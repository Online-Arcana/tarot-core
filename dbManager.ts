// dbManager.ts
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";

export type StoredMessage = {
    role: "user";
    prompt: string;
    response: unknown;
};

export type StoredConversation = {
    id: string;
    createdAt: string;

    /**
     * Present in newer DB formats. Optional for backwards compatibility.
     */
    keyId?: string;

    /**
     * TEMPORARY (debugging only): the runtime session ID associated with this conversation.
     * Optional so older records, or records written without this, still validate.
     */
    sessionId?: string;

    messages: StoredMessage[];
};

type EncryptedField = {
    __enc: true;
    v: 1;
    iv: string;   // base64
    tag: string;  // base64
    data: string; // base64
};

type DiskMessage = {
    role: "user";
    prompt: EncryptedField;
    response: EncryptedField;
};

type DiskConversation = {
    id: string;
    createdAt: string;

    /**
     * Stored hash id of the encryption key. Optional for older files.
     */
    keyId?: string;

    /**
     * TEMPORARY (debugging only): runtime session id, stored in plaintext.
     */
    sessionId?: string;

    messages: DiskMessage[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isErrno(e: unknown): e is NodeJS.ErrnoException {
    return e instanceof Error && "code" in e;
}

function parseIsoMs(s: string): number {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? 0 : ms;
}

export class ConversationDbManager {
    private readonly dataDir: string;
    private readonly convDir: string;

    // Serialises writes per target file within this process
    private readonly writeQueues = new Map<string, Promise<void>>();

    public constructor(dataDir: string) {
        this.dataDir = path.resolve(dataDir);
        this.convDir = path.join(this.dataDir, "conversations");
        this.ensureDirsSync();
    }

    /**
     * Best-effort fallback restore when the caller does not know the conversationId (or it fails to load).
     * Finds the newest conversation whose keyId matches the provided sessionKey.
     *
     * If sessionId is provided, it will only filter when the file also contains sessionId.
     * This keeps older files (without sessionId) eligible.
     */
    public findLatestConversationIdSync(sessionKey: string, sessionId?: string): string | null {
        this.ensureDirsSync();

        const expectedKeyId = this.computeKeyId(sessionKey);
        const wantSid = (sessionId || "").trim();

        let files: string[] = [];
        try {
            files = readdirSync(this.convDir);
        } catch {
            return null;
        }

        let bestId: string | null = null;
        let bestMs = -1;

        for (const file of files) {
            if (!file.endsWith(".json")) continue;

            const full = path.join(this.convDir, file);

            let parsed: unknown;
            try {
                parsed = JSON.parse(readFileSync(full, "utf8")) as unknown;
            } catch {
                continue;
            }

            if (!isRecord(parsed)) continue;

            const id = typeof parsed["id"] === "string" ? parsed["id"].trim() : "";
            if (!id) continue;

            const keyIdOnDisk = typeof parsed["keyId"] === "string" ? parsed["keyId"] : null;
            if (!keyIdOnDisk) continue;
            if (keyIdOnDisk !== expectedKeyId) continue;

            const sidOnDisk = typeof parsed["sessionId"] === "string" ? parsed["sessionId"].trim() : "";
            if (wantSid && sidOnDisk && sidOnDisk !== wantSid) continue;

            const createdAt = typeof parsed["createdAt"] === "string" ? parsed["createdAt"] : "";
            const ms = parseIsoMs(createdAt);

            if (ms > bestMs) {
                bestMs = ms;
                bestId = id;
            }
        }

        return bestId;
    }

    public loadConversationSync(conversationId: string, sessionKey: string): StoredConversation | null {
        const targetPath = this.conversationFilePath(conversationId);
        if (!existsSync(targetPath)) return null;

        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(targetPath, "utf8")) as unknown;
        } catch {
            return null;
        }

        if (!isRecord(parsed)) return null;

        const id = typeof parsed["id"] === "string" ? parsed["id"] : null;
        const createdAt = typeof parsed["createdAt"] === "string" ? parsed["createdAt"] : null;

        const keyIdOnDisk = typeof parsed["keyId"] === "string" ? parsed["keyId"] : null;
        const sessionIdOnDisk = typeof parsed["sessionId"] === "string" ? parsed["sessionId"] : undefined;

        const messagesRaw = parsed["messages"];

        if (!id || !createdAt) return null;
        if (!Array.isArray(messagesRaw)) return null;

        const expectedKeyId = this.computeKeyId(sessionKey);

        // Backwards compatible:
        // - If keyId is present, enforce it matches.
        // - If keyId is missing, attempt decryption anyway.
        if (keyIdOnDisk && keyIdOnDisk !== expectedKeyId) return null;

        const key = this.deriveAesKey(sessionKey);

        const messages: StoredMessage[] = [];
        for (const m of messagesRaw) {
            if (!isRecord(m)) return null;

            const role = m["role"];
            const promptEnc = m["prompt"];
            const responseEnc = m["response"];

            if (role !== "user") return null;
            if (!this.isEncryptedField(promptEnc)) return null;
            if (!this.isEncryptedField(responseEnc)) return null;

            let promptVal: unknown;
            let responseVal: unknown;

            try {
                promptVal = this.decryptJson(key, promptEnc);
                responseVal = this.decryptJson(key, responseEnc);
            } catch {
                return null;
            }

            if (typeof promptVal !== "string") return null;

            messages.push({
                role: "user",
                prompt: promptVal,
                response: responseVal
            });
        }

        return {
            id,
            createdAt,
            keyId: keyIdOnDisk ?? expectedKeyId,
            sessionId: sessionIdOnDisk,
            messages
        };
    }

    public async appendMessage(
        conversationId: string,
        sessionKey: string,
        prompt: string,
        response: unknown,
        sessionId?: string
    ): Promise<void> {
        const targetPath = this.conversationFilePath(conversationId);

        await this.serialise(targetPath, async () => {
            await this.ensureDirs();

            await this.withLock(targetPath, async () => {
                const disk = await this.readDiskConversation(targetPath);

                const keyId = this.computeKeyId(sessionKey);
                const key = this.deriveAesKey(sessionKey);

                const next: DiskConversation = disk ?? {
                    id: conversationId,
                    createdAt: new Date().toISOString(),
                    keyId,
                    messages: []
                };

                // If the file exists, ensure we do not mix keys
                if (disk) {
                    const existingKeyId = typeof next.keyId === "string" ? next.keyId : null;
                    if (existingKeyId && existingKeyId !== keyId) {
                        throw new Error("Session key does not match conversation encryption key");
                    }

                    // If older record had no keyId, upgrade it on write
                    if (!existingKeyId) next.keyId = keyId;
                }

                const sid = (sessionId || "").trim();
                if (sid && !next.sessionId) next.sessionId = sid;

                next.messages.push({
                    role: "user",
                    prompt: this.encryptJson(key, prompt),
                    response: this.encryptJson(key, response)
                });

                await this.atomicWriteJson(targetPath, next);
            });
        });
    }

    public clearConversationSync(conversationId: string): boolean {
        const targetPath = this.conversationFilePath(conversationId);
        if (!existsSync(targetPath)) return false;

        try {
            require("fs").unlinkSync(targetPath);
            return true;
        } catch {
            return false;
        }
    }

    /* =========================
       Serialisation + locking
    ========================= */

    private async serialise<T>(key: string, op: () => Promise<T>): Promise<T> {
        const prev = this.writeQueues.get(key) ?? Promise.resolve();

        const run = prev.then(op, op);

        const done = run.then(
            () => undefined,
            () => undefined
        );

        this.writeQueues.set(key, done);

        void done.finally(() => {
            if (this.writeQueues.get(key) === done) this.writeQueues.delete(key);
        });

        return run;
    }

    private lockPathFor(targetPath: string): string {
        return `${targetPath}.lock`;
    }

    private async withLock(targetPath: string, fn: () => Promise<void>): Promise<void> {
        const lockPath = this.lockPathFor(targetPath);
        const release = await this.acquireLock(lockPath);

        try {
            await fn();
        } finally {
            await release();
        }
    }

    private async acquireLock(lockPath: string): Promise<() => Promise<void>> {
        const started = Date.now();
        const maxWaitMs = 8000;
        const staleMs = 30000;

        for (; ;) {
            try {
                const fh = await fs.open(lockPath, "wx");
                await fh.writeFile(
                    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
                    { encoding: "utf8" }
                );
                await fh.close();

                return async () => {
                    try {
                        await fs.unlink(lockPath);
                    } catch {
                        // ignore
                    }
                };
            } catch (e: unknown) {
                if (!isErrno(e) || e.code !== "EEXIST") throw e;

                // stale lock handling
                try {
                    const st = await fs.stat(lockPath);
                    const age = Date.now() - st.mtimeMs;
                    if (age > staleMs) {
                        await fs.unlink(lockPath).catch(() => undefined);
                    }
                } catch {
                    // ignore stat/unlink races
                }

                if (Date.now() - started > maxWaitMs) {
                    throw new Error("Timed out waiting for conversation file lock");
                }

                await sleep(60 + Math.floor(Math.random() * 90));
            }
        }
    }

    private async atomicWriteJson(targetPath: string, data: DiskConversation): Promise<void> {
        const dir = path.dirname(targetPath);
        const tmp = path.join(
            dir,
            `${path.basename(targetPath)}.tmp.${process.pid}.${crypto.randomBytes(6).toString("hex")}`
        );

        const json = JSON.stringify(data, null, 2);
        await fs.writeFile(tmp, json, { encoding: "utf8" });
        await fs.rename(tmp, targetPath);
    }

    private async readDiskConversation(targetPath: string): Promise<DiskConversation | null> {
        try {
            const raw = await fs.readFile(targetPath, "utf8");
            const parsed: unknown = JSON.parse(raw);

            if (!isRecord(parsed)) return null;

            const id = typeof parsed["id"] === "string" ? parsed["id"] : null;
            const createdAt = typeof parsed["createdAt"] === "string" ? parsed["createdAt"] : null;
            const messages = parsed["messages"];

            if (!id || !createdAt) return null;
            if (!Array.isArray(messages)) return null;

            return parsed as DiskConversation;
        } catch (e: unknown) {
            if (isErrno(e) && e.code === "ENOENT") return null;
            return null;
        }
    }

    /* =========================
       Paths + dirs
    ========================= */

    private ensureDirsSync(): void {
        if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
        if (!existsSync(this.convDir)) mkdirSync(this.convDir, { recursive: true });
    }

    private async ensureDirs(): Promise<void> {
        await fs.mkdir(this.convDir, { recursive: true });
    }

    private conversationFilePath(conversationId: string): string {
        const stem = this.safeFileStem(conversationId);
        return path.join(this.convDir, `${stem}.json`);
    }

    private safeFileStem(conversationId: string): string {
        const id = conversationId.trim();
        const ok = /^[a-zA-Z0-9_-]{6,200}$/.test(id);
        if (ok) return id;

        const hash = crypto.createHash("sha256").update(id, "utf8").digest("base64url");
        return `hash_${hash}`;
    }

    /* =========================
       Crypto (AES-256-GCM)
    ========================= */

    private computeKeyId(sessionKey: string): string {
        return crypto.createHash("sha256").update(sessionKey, "utf8").digest("hex").slice(0, 16);
    }

    private deriveAesKey(sessionKey: string): Buffer {
        return crypto.scryptSync(sessionKey, "tarot-convo-v1", 32);
    }

    private isEncryptedField(v: unknown): v is EncryptedField {
        if (!isRecord(v)) return false;
        return (
            v["__enc"] === true &&
            v["v"] === 1 &&
            typeof v["iv"] === "string" &&
            typeof v["tag"] === "string" &&
            typeof v["data"] === "string"
        );
    }

    private encryptJson(key: Buffer, value: unknown): EncryptedField {
        const normalised = value === undefined ? { __undef: true } : value;
        const plaintext = Buffer.from(JSON.stringify(normalised), "utf8");
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        return {
            __enc: true,
            v: 1,
            iv: iv.toString("base64"),
            tag: tag.toString("base64"),
            data: enc.toString("base64")
        };
    }

    private decryptJson(key: Buffer, enc: EncryptedField): unknown {
        const iv = Buffer.from(enc.iv, "base64");
        const tag = Buffer.from(enc.tag, "base64");
        const data = Buffer.from(enc.data, "base64");

        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);

        const dec = Buffer.concat([decipher.update(data), decipher.final()]);
        const parsed: unknown = JSON.parse(dec.toString("utf8"));

        if (isRecord(parsed) && parsed["__undef"] === true) return undefined;
        return parsed;
    }
}