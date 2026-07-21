// webUI.ts
import http from "http";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

import { TerminalTui } from "./tui";
import type { JSONConversation, SendOptions } from "./jsonConvos";

type MaybePromise<T> = T | Promise<T>;

type Style = ReturnType<TerminalTui["sgr"]["style"]>;
type RetryInfo = Parameters<NonNullable<SendOptions["onRetry"]>>[0];

export type WebUiOptions = {
    host?: string;
    port?: number;
    title?: string;
    logUrl?: boolean;

    /**
     * Path to the HTML template, defaults to ./webUI.html next to this file.
     */
    templatePath?: string;

    // Optional UI defaults, mirroring TerminalIo.
    promptStyle?: Style;
    infoStyle?: Style;
    mutedStyle?: Style;

    // TerminalTui passthrough (for sgr defaults only).
    tui?: ConstructorParameters<typeof TerminalTui>[0];
};

export type AskLineOptions = {
    trim?: boolean;
    allowEmpty?: boolean;
    promptStyle?: Style;
};

export type AskNonEmptyOptions = {
    trim?: boolean;
    promptStyle?: Style;
    onEmpty?: () => void;
};

export type AskChoiceOptions<T> = {
    render?: () => void;
    promptStyle?: Style;
    onInvalid?: (raw: string) => void;
    accept?: (v: T) => boolean;
};

export type SendWithUiOptions = {
    thinkingLabel?: string;
    thinkingIntervalMs?: number;
    thinkingStyle?: Style;

    retryLine?: (info: RetryInfo) => MaybePromise<string | null | undefined>;
    retryLineStyle?: Style;

    onRetryLine?: (line: string, info: RetryInfo) => MaybePromise<void>;

    send?: SendOptions;
};

type UiLine = {
    kind: "line" | "centred";
    id: string;
    text: string;
    classes: readonly string[];
};

type UiBox = {
    kind: "box";
    id: string;

    title: string | null;
    body: string;

    boxClasses: readonly string[];
    borderClasses: readonly string[];
    titleClasses: readonly string[];
    bodyClasses: readonly string[];
};

type UiElement = UiLine | UiBox;

type UiSpinner = {
    id: string;
    label: string;
    classes: readonly string[];
    intervalMs: number;
};

type PromptState = {
    promptId: string;
    prompt: string;
    mode: "line" | "enter";
    trim: boolean;
    allowEmpty: boolean;
    classes: readonly string[];
};

type UiInitEvent = {
    t: "init";
    title: string;
    elements: readonly UiElement[];
    spinners: readonly UiSpinner[];
    prompt: PromptState | null;
};

type UiEvent =
    | UiInitEvent
    | { t: "clear" }
    | { t: "append"; el: UiElement }
    | { t: "thinking_start"; spinner: UiSpinner }
    | { t: "thinking_stop"; id: string }
    | { t: "prompt"; prompt: PromptState }
    | { t: "prompt_clear" }
    | { t: "meta"; key: string; value: string }
    | { t: "css"; css: string }
    | { t: "input_placeholder"; id: string; inputType: string; placeholder: string; generated?: boolean }
    | { t: "dom_disabled"; id: string; disabled: boolean };

function escapeHtml(s: string): string {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function parseAnsiColourIndex(code: string): { kind: "fg" | "bg"; n: number } | null {
    const fg = /^\x1b\[38;5;(\d{1,3})m$/u.exec(code);
    if (fg) {
        const n = Number.parseInt(fg[1], 10);
        if (Number.isNaN(n) || n < 0 || n > 255) return null;
        return { kind: "fg", n };
    }

    const bg = /^\x1b\[48;5;(\d{1,3})m$/u.exec(code);
    if (bg) {
        const n = Number.parseInt(bg[1], 10);
        if (Number.isNaN(n) || n < 0 || n > 255) return null;
        return { kind: "bg", n };
    }

    return null;
}

function styleToClasses(style?: Style): string[] {
    if (!style || style.length === 0) return [];

    const out: string[] = [];
    for (const code of style) {
        if (code === "\x1b[1m") out.push("sgr-bold");
        else if (code === "\x1b[3m") out.push("sgr-italic");
        else if (code === "\x1b[4m") out.push("sgr-underline");
        else if (code === "\x1b[2m") out.push("sgr-dim");
        else {
            const c = parseAnsiColourIndex(code);
            if (!c) continue;
            out.push(c.kind === "fg" ? `sgr-fg-${c.n}` : `sgr-bg-${c.n}`);
        }
    }

    return out;
}

function ansi256ToRgb(n: number): { r: number; g: number; b: number } {
    const base16: Array<{ r: number; g: number; b: number }> = [
        { r: 0, g: 0, b: 0 },
        { r: 128, g: 0, b: 0 },
        { r: 0, g: 128, b: 0 },
        { r: 128, g: 128, b: 0 },
        { r: 0, g: 0, b: 128 },
        { r: 128, g: 0, b: 128 },
        { r: 0, g: 128, b: 128 },
        { r: 192, g: 192, b: 192 },
        { r: 128, g: 128, b: 128 },
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 255, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
        { r: 255, g: 0, b: 255 },
        { r: 0, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 }
    ];

    if (n >= 0 && n <= 15) return base16[n];

    if (n >= 16 && n <= 231) {
        const idx = n - 16;
        const r = Math.floor(idx / 36);
        const g = Math.floor((idx % 36) / 6);
        const b = idx % 6;

        const levels = [0, 95, 135, 175, 215, 255];
        return { r: levels[r], g: levels[g], b: levels[b] };
    }

    const v = 8 + (n - 232) * 10;
    return { r: v, g: v, b: v };
}

function buildAnsiPaletteCss(): string {
    const vars: string[] = [];
    const fg: string[] = [];
    const bg: string[] = [];

    for (let i = 0; i < 256; i += 1) {
        const { r, g, b } = ansi256ToRgb(i);
        vars.push(`:root { --ansi-${i}: rgb(${r}, ${g}, ${b}); }`);
        fg.push(`.sgr-fg-${i} { color: var(--ansi-${i}); }`);
        bg.push(`.sgr-bg-${i} { background-color: var(--ansi-${i}); }`);
    }

    return [...vars, ...fg, ...bg].join("\n");
}

function toSseData(evt: UiEvent): string {
    return JSON.stringify(evt).replace(/\n/g, "\\n");
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

type PendingPrompt = {
    state: PromptState;
    resolve: (v: string) => void;
};

type SessionState = {
    clients: Set<http.ServerResponse>;
    elements: UiElement[];
    spinners: Map<string, UiSpinner>;
    pendingPrompt: PendingPrompt | null;
    waitTimer: NodeJS.Timeout | null;
    seq: number;
    disabledCounts: Map<string, number>;
};

type ParsedSession = {
    sessionToken: string | null;
    chatId: string | null;
};

function parseSessionFromRawUrl(rawUrl: string): ParsedSession {
    try {
        const u = new URL(rawUrl, "http://local/");
        const s = (u.searchParams.get("sessionToken") || "").trim();
        const c = (u.searchParams.get("chatId") || "").trim();
        return {
            sessionToken: s ? s : null,
            chatId: c ? c : null
        };
    } catch {
        return { sessionToken: null, chatId: null };
    }
}

type SessionKeyCandidates = {
    tokenKey: string | null;
    chatKey: string | null;
};

function sessionKeyCandidates(rawUrl: string): SessionKeyCandidates {
    const p = parseSessionFromRawUrl(rawUrl);
    const tokenKey = p.sessionToken ? p.sessionToken : null;
    const chatKey = p.chatId ? `chat:${p.chatId}` : null;
    return { tokenKey, chatKey };
}

/**
 * Prefer sessionToken for true isolation.
 * If a client connects before it has a sessionToken, fall back to a chatId-scoped session key.
 */
function resolveSessionKey(rawUrl: string): string | null {
    const p = parseSessionFromRawUrl(rawUrl);
    if (p.sessionToken) return p.sessionToken;
    if (p.chatId) return `chat:${p.chatId}`;
    return null;
}

export class WebUiSession {
    private readonly parent: WebUi;
    private readonly sessionKey: string;

    public readonly ui: Readonly<{
        sgr: TerminalTui["sgr"];
        sleep: (ms: number) => Promise<void>;
        startThinking: (label: string, opts?: { intervalMs?: number; labelStyle?: Style }) => () => void;
    }>;

    public readonly ready: Promise<void>;

    public constructor(parent: WebUi, sessionKey: string) {
        this.parent = parent;
        this.sessionKey = sessionKey;
        this.ready = parent.ready;

        this.ui = Object.freeze({
            sgr: parent.sgr,
            sleep: parent.sleep,
            startThinking: (label: string, o?: { intervalMs?: number; labelStyle?: Style }) => {
                return parent.sessionStartThinking(this.sessionKey, label, o);
            }
        });
    }

    public url(): string {
        return this.parent.url();
    }

    /**
     * Ends this session only (clients, prompts, spinners, elements).
     * Does not stop the HTTP server.
     */
    public close(): void {
        this.parent.closeSession(this.sessionKey);
    }

    public setCss(css: string): void {
        this.parent.setCss(css);
    }

    public clearScreen(): void {
        this.parent.sessionClearScreen(this.sessionKey);
    }

    public write(s: string): void {
        this.parent.sessionWrite(this.sessionKey, s);
    }

    public line(s = ""): void {
        this.parent.sessionLine(this.sessionKey, s);
    }

    public centred(text: string, style?: Style): void {
        this.parent.sessionCentred(this.sessionKey, text, style);
    }

    public boxed(
        title: string | null,
        body: string,
        styles?: {
            borderStyle?: Style;
            bodyStyle?: Style;
            titleStyle?: Style;
        }
    ): void {
        this.parent.sessionBoxed(this.sessionKey, title, body, styles);
    }

    public paint(text: string, style?: Style): string {
        return this.parent.paint(text, style);
    }

    public paintPrompt(text: string): string {
        return this.parent.paintPrompt(text);
    }

    public info(text: string): void {
        this.parent.sessionInfo(this.sessionKey, text);
    }

    public muted(text: string): void {
        this.parent.sessionMuted(this.sessionKey, text);
    }

    public async askLine(prompt: string, opts: AskLineOptions = {}): Promise<string> {
        return this.parent.sessionAskLine(this.sessionKey, prompt, opts);
    }

    public async askNonEmpty(prompt: string, opts: AskNonEmptyOptions = {}): Promise<string> {
        return this.parent.sessionAskNonEmpty(this.sessionKey, prompt, opts);
    }

    public async askChoice<T>(
        prompt: string,
        parse: (raw: string) => T | null,
        opts: AskChoiceOptions<T> = {}
    ): Promise<T> {
        return this.parent.sessionAskChoice(this.sessionKey, prompt, parse, opts);
    }

    public async waitForEnterOrTimeout(timeoutMs: number): Promise<void> {
        return this.parent.sessionWaitForEnterOrTimeout(this.sessionKey, timeoutMs);
    }

    public withThinking<T>(
        label: string,
        fn: () => Promise<T>,
        opts: { intervalMs?: number; style?: Style } = {}
    ): Promise<T> {
        return this.parent.sessionWithThinking(this.sessionKey, label, fn, opts);
    }

    public async sendWithUi<T extends object>(
        convo: JSONConversation<T>,
        role: "system" | "user",
        content: string,
        opts: SendWithUiOptions = {}
    ): Promise<T> {
        return this.parent.sessionSendWithUi(this.sessionKey, convo, role, content, opts);
    }

    public setMeta(key: string, value: string): void {
        this.parent.sessionSetMeta(this.sessionKey, key, value);
    }

    public setInputPlaceholder(inputId: string, placeholder: string, generated?: boolean, inputType = "text"): void {
        this.parent.sessionSetInputPlaceholder(this.sessionKey, inputId, placeholder, generated, inputType);
    }

}

export class WebUi {
    public readonly ready: Promise<void>;

    private readonly host: string;
    private port: number;
    private readonly title: string;
    private readonly logUrl: boolean;

    private readonly sgrSource: TerminalTui;

    private readonly promptStyle: Style;
    private readonly infoStyle: Style;
    private readonly mutedStyle: Style;

    private readonly server: http.Server;

    private readonly sessions = new Map<string, SessionState>();

    private templateHtml: string | null = null;

    private cssText = "";

    public constructor(opts: WebUiOptions = {}) {
        this.host = opts.host ?? "127.0.0.1";
        this.port = opts.port ?? 6667;
        this.title = opts.title ?? "Web UI";
        this.logUrl = opts.logUrl ?? true;

        this.sgrSource = new TerminalTui({ ...(opts.tui ?? {}) });

        const S = this.sgrSource.sgr;
        this.promptStyle = opts.promptStyle ?? S.style(S.fg256(245));
        this.infoStyle = opts.infoStyle ?? S.style(S.italicOn, S.fg256(245));
        this.mutedStyle = opts.mutedStyle ?? S.style(S.fg256(240));

        this.server = http.createServer((req, res) => {
            void this.route(req, res);
        });

        const templatePath =
            opts.templatePath ??
            path.resolve(import.meta.dir, "webUI.html");

        const templateReady = fs.readFile(templatePath, "utf8")
            .then(s => {
                this.templateHtml = s;
            });

        const serverReady = new Promise<void>((resolve, reject) => {
            const onError = (err: unknown) => {
                const e = err as { code?: string };
                const wantFallback = e.code === "EADDRINUSE" && opts.port === undefined;
                if (!wantFallback) return reject(err);

                this.server.listen(0, this.host, () => {
                    const addr = this.server.address();
                    if (addr && typeof addr === "object") this.port = addr.port;
                    if (this.logUrl) console.log(this.url());
                    resolve();
                });
            };

            this.server.once("error", onError);

            this.server.listen(this.port, this.host, () => {
                const addr = this.server.address();
                if (addr && typeof addr === "object") this.port = addr.port;
                this.server.off("error", onError);
                if (this.logUrl) console.log(this.url());
                resolve();
            });
        });

        this.ready = Promise.all([templateReady, serverReady]).then(() => undefined);
    }

    public get sgr(): TerminalTui["sgr"] {
        return this.sgrSource.sgr;
    }

    public sleep = async (ms: number): Promise<void> => {
        await new Promise<void>(resolve => setTimeout(resolve, ms));
    };

    public forSession(sessionKey: string): WebUiSession {
        const k = sessionKey.trim();
        if (!k) throw new Error("sessionKey is required");
        this.ensureSession(k);
        return new WebUiSession(this, k);
    }

    public setCss(css: string): void {
        this.cssText = css;
        this.broadcastAll({ t: "css", css: this.cssText });
    }

    public url(): string {
        return `http://${this.host}:${this.port}/`;
    }

    /**
     * Stops the HTTP server (global).
     */
    public close(): void {
        for (const key of this.sessions.keys()) {
            this.closeSession(key);
        }
        this.sessions.clear();
        this.server.close();
    }

    /**
     * Ends a single session (clients, prompts, spinners, elements) without stopping the HTTP server.
     */
    public closeSession(sessionKey: string): void {
        const ssn = this.sessions.get(sessionKey);
        if (!ssn) return;

        for (const c of ssn.clients) c.end();
        ssn.clients.clear();

        if (ssn.waitTimer) {
            clearTimeout(ssn.waitTimer);
            ssn.waitTimer = null;
        }

        const pending = ssn.pendingPrompt;
        ssn.pendingPrompt = null;
        if (pending) {
            // Resolve with empty string to unblock awaiting code.
            pending.resolve("");
        }

        this.sessions.delete(sessionKey);
    }

    /* =========================
       Session-scoped primitives (used by WebUiSession)
    ========================= */

    public sessionClearScreen(sessionKey: string): void {
        const ssn = this.ensureSession(sessionKey);
        ssn.elements.length = 0;
        this.broadcast(sessionKey, { t: "clear" });
    }

    public sessionWrite(sessionKey: string, s: string): void {
        this.sessionAppendLine(sessionKey, s);
    }

    public sessionLine(sessionKey: string, s = ""): void {
        this.sessionAppendLine(sessionKey, s);
    }

    public sessionCentred(sessionKey: string, text: string, style?: Style): void {
        const ssn = this.ensureSession(sessionKey);
        const id = this.nextId(ssn, "centred");
        const classes = ["tui-elem", "tui-centred", ...styleToClasses(style)];
        const el: UiLine = { kind: "centred", id, text, classes };
        ssn.elements.push(el);
        this.broadcast(sessionKey, { t: "append", el });
    }

    public sessionBoxed(
        sessionKey: string,
        title: string | null,
        body: string,
        styles?: {
            borderStyle?: Style;
            bodyStyle?: Style;
            titleStyle?: Style;
        }
    ): void {
        const ssn = this.ensureSession(sessionKey);
        const id = this.nextId(ssn, "box");

        const el: UiBox = {
            kind: "box",
            id,
            title,
            body,
            boxClasses: ["tui-elem", "tui-box"],
            borderClasses: ["tui-box__border", ...styleToClasses(styles?.borderStyle)],
            titleClasses: ["tui-box__title", ...styleToClasses(styles?.titleStyle)],
            bodyClasses: ["tui-box__body", ...styleToClasses(styles?.bodyStyle)]
        };

        ssn.elements.push(el);
        this.broadcast(sessionKey, { t: "append", el });
    }

    public paint(text: string, _style?: Style): string {
        return text;
    }

    public paintPrompt(text: string): string {
        return text;
    }

    public sessionInfo(sessionKey: string, text: string): void {
        this.sessionCentred(sessionKey, text, this.infoStyle);
    }

    public sessionMuted(sessionKey: string, text: string): void {
        this.sessionCentred(sessionKey, text, this.mutedStyle);
    }

    public sessionStartThinking(
        sessionKey: string,
        label: string,
        o?: { intervalMs?: number; labelStyle?: Style }
    ): () => void {
        const ssn = this.ensureSession(sessionKey);
        const intervalMs = o?.intervalMs ?? 300;
        const classes = ["tui-elem", "tui-thinking", ...styleToClasses(o?.labelStyle)];
        const id = this.nextId(ssn, "thinking");

        const spinner: UiSpinner = { id, label, classes, intervalMs };
        ssn.spinners.set(id, spinner);
        this.broadcast(sessionKey, { t: "thinking_start", spinner });

        return () => {
            const ssn2 = this.sessions.get(sessionKey);
            if (!ssn2) return;
            ssn2.spinners.delete(id);
            this.broadcast(sessionKey, { t: "thinking_stop", id });
        };
    }

    public sessionSetMeta(sessionKey: string, key: string, value: string): void {
        this.broadcast(sessionKey, { t: "meta", key, value });
    }

    public sessionSetInputPlaceholder(
        sessionKey: string,
        inputId: string,
        placeholder: string,
        generated?: boolean,
        inputType = "text"
    ): void {
        const id = (inputId || "").trim();
        if (!id) return;

        this.broadcast(sessionKey, {
            t: "input_placeholder",
            id,
            inputType: (inputType || "text").trim() || "text",
            placeholder: placeholder ?? "",
            generated: generated ?? undefined
        });
    }

    public sessionSetDomDisabled(sessionKey: string, id: string, disabled: boolean): void {
        const elId = (id || "").trim();
        if (!elId) return;

        this.broadcast(sessionKey, { t: "dom_disabled", id: elId, disabled: Boolean(disabled) });
    }

    private sessionAcquireDomDisabled(sessionKey: string, ids: readonly string[]): void {
        const ssn = this.ensureSession(sessionKey);

        for (const raw of ids) {
            const id = (raw || "").trim();
            if (!id) continue;

            const prev = ssn.disabledCounts.get(id) ?? 0;
            const next = prev + 1;
            ssn.disabledCounts.set(id, next);

            if (next === 1) {
                this.broadcast(sessionKey, { t: "dom_disabled", id, disabled: true });
            }
        }
    }

    private sessionReleaseDomDisabled(sessionKey: string, ids: readonly string[]): void {
        const ssn = this.sessions.get(sessionKey);
        if (!ssn) return;

        for (const raw of ids) {
            const id = (raw || "").trim();
            if (!id) continue;

            const prev = ssn.disabledCounts.get(id) ?? 0;
            const next = Math.max(0, prev - 1);

            if (next === 0) {
                ssn.disabledCounts.delete(id);
                this.broadcast(sessionKey, { t: "dom_disabled", id, disabled: false });
            } else {
                ssn.disabledCounts.set(id, next);
            }
        }
    }

    public async sessionAskLine(sessionKey: string, prompt: string, opts: AskLineOptions = {}): Promise<string> {
        const trim = opts.trim ?? true;
        const allowEmpty = opts.allowEmpty ?? true;
        const promptStyle = opts.promptStyle ?? this.promptStyle;

        const raw = await this.sessionPromptUser(sessionKey, {
            prompt,
            mode: "line",
            trim,
            allowEmpty,
            classes: ["tui-prompt", ...styleToClasses(promptStyle)]
        });

        const out = trim ? raw.trim() : raw;
        if (allowEmpty) return out;
        if (out) return out;
        return "";
    }

    public async sessionAskNonEmpty(sessionKey: string, prompt: string, opts: AskNonEmptyOptions = {}): Promise<string> {
        const trim = opts.trim ?? true;
        const promptStyle = opts.promptStyle ?? this.promptStyle;

        while (true) {
            const raw = await this.sessionPromptUser(sessionKey, {
                prompt,
                mode: "line",
                trim,
                allowEmpty: true,
                classes: ["tui-prompt", ...styleToClasses(promptStyle)]
            });

            const out = trim ? raw.trim() : raw;
            if (out) return out;

            if (opts.onEmpty) opts.onEmpty();
        }
    }

    public async sessionAskChoice<T>(
        sessionKey: string,
        prompt: string,
        parse: (raw: string) => T | null,
        opts: AskChoiceOptions<T> = {}
    ): Promise<T> {
        const promptStyle = opts.promptStyle ?? this.promptStyle;

        while (true) {
            if (opts.render) opts.render();

            const raw = await this.sessionPromptUser(sessionKey, {
                prompt,
                mode: "line",
                trim: true,
                allowEmpty: true,
                classes: ["tui-prompt", ...styleToClasses(promptStyle)]
            });

            const v = parse(raw.trim());

            if (!v) {
                if (opts.onInvalid) opts.onInvalid(raw);
                continue;
            }

            if (opts.accept && !opts.accept(v)) {
                if (opts.onInvalid) opts.onInvalid(raw);
                continue;
            }

            return v;
        }
    }

    public async sessionWaitForEnterOrTimeout(sessionKey: string, timeoutMs: number): Promise<void> {
        if (timeoutMs <= 0) return;

        const ssn = this.ensureSession(sessionKey);
        if (ssn.pendingPrompt) return;

        const promptId = randomUUID();

        const p = new Promise<void>(resolve => {
            const state: PromptState = {
                promptId,
                prompt: "Press Enter to continue…",
                mode: "enter",
                trim: true,
                allowEmpty: true,
                classes: ["tui-prompt", "tui-prompt-enter", ...styleToClasses(this.promptStyle)]
            };

            ssn.pendingPrompt = {
                state,
                resolve: () => resolve()
            };

            this.broadcast(sessionKey, { t: "prompt", prompt: state });

            ssn.waitTimer = setTimeout(() => {
                ssn.waitTimer = null;

                const pending = ssn.pendingPrompt;
                if (!pending) return;
                if (pending.state.promptId !== promptId) return;

                ssn.pendingPrompt = null;
                this.broadcast(sessionKey, { t: "prompt_clear" });
                resolve();
            }, timeoutMs);
        });

        await p;
    }

    public sessionWithThinking<T>(
        sessionKey: string,
        label: string,
        fn: () => Promise<T>,
        opts: { intervalMs?: number; style?: Style } = {}
    ): Promise<T> {
        const stop = this.sessionStartThinking(sessionKey, label, {
            intervalMs: opts.intervalMs,
            labelStyle: opts.style ?? this.infoStyle
        });

        const run = async (): Promise<T> => {
            try {
                return await fn();
            } finally {
                stop();
            }
        };

        return run();
    }

    public async sessionSendWithUi<T extends object>(
        sessionKey: string,
        convo: JSONConversation<T>,
        role: "system" | "user",
        content: string,
        opts: SendWithUiOptions = {}
    ): Promise<T> {
        const thinkingLabel = opts.thinkingLabel;
        const intervalMs = opts.thinkingIntervalMs ?? 300;
        const thinkingStyle = opts.thinkingStyle ?? this.infoStyle;

        const lockIds = ["tui-input", "tui-send"] as const;
        this.sessionAcquireDomDisabled(sessionKey, lockIds);


        const startThinking = (): (() => void) | null => {
            if (!thinkingLabel) return null;
            return this.sessionStartThinking(sessionKey, thinkingLabel, { intervalMs, labelStyle: thinkingStyle });
        };

        let stopThinking = startThinking();

        const stopSpinner = (): void => {
            if (!stopThinking) return;
            stopThinking();
            stopThinking = null;
        };

        const restartSpinner = (): void => {
            if (!thinkingLabel) return;
            stopThinking = startThinking();
        };

        const externalOnRetry = opts.send?.onRetry;

        const mergedSend: SendOptions = {
            ...(opts.send ?? {}),
            onRetry: async (info) => {
                stopSpinner();

                const line = opts.retryLine ? await opts.retryLine(info) : null;
                const printable = typeof line === "string" ? line.trim() : "";

                if (printable) {
                    if (opts.onRetryLine) {
                        await opts.onRetryLine(printable, info);
                    } else {
                        this.sessionCentred(sessionKey, printable, opts.retryLineStyle ?? this.infoStyle);
                    }
                }

                if (externalOnRetry) await externalOnRetry(info);
                restartSpinner();
            }
        };

        try {
            const out = await convo.send(role, content, mergedSend);
            stopSpinner();
            return out;
        } catch (err) {
            stopSpinner();
            throw err;
        } finally {
            this.sessionReleaseDomDisabled(sessionKey, lockIds);
        }
    }

    /* =========================
       Private helpers
    ========================= */

    private ensureSession(sessionKey: string): SessionState {
        const existing = this.sessions.get(sessionKey);
        if (existing) return existing;

        const created: SessionState = {
            clients: new Set<http.ServerResponse>(),
            elements: [],
            spinners: new Map<string, UiSpinner>(),
            pendingPrompt: null,
            waitTimer: null,
            seq: 0,
            disabledCounts: new Map<string, number>()
        };

        this.sessions.set(sessionKey, created);
        return created;
    }

    private sessionAppendLine(sessionKey: string, text: string): void {
        const ssn = this.ensureSession(sessionKey);
        const id = this.nextId(ssn, "line");
        const classes = ["tui-elem", "tui-line"];
        const el: UiLine = { kind: "line", id, text, classes };
        ssn.elements.push(el);
        this.broadcast(sessionKey, { t: "append", el });
    }

    private nextId(ssn: SessionState, kind: string): string {
        ssn.seq += 1;
        const n = String(ssn.seq).padStart(6, "0");
        return `tui-${kind}-${n}`;
    }

    private broadcast(sessionKey: string, evt: UiEvent): void {
        const ssn = this.sessions.get(sessionKey);
        if (!ssn) return;

        const data = `data: ${toSseData(evt)}\n\n`;
        for (const res of ssn.clients) res.write(data);
    }

    private broadcastAll(evt: UiEvent): void {
        const data = `data: ${toSseData(evt)}\n\n`;
        for (const ssn of this.sessions.values()) {
            for (const res of ssn.clients) res.write(data);
        }
    }

    private sendToClient(res: http.ServerResponse, evt: UiEvent): void {
        res.write(`data: ${toSseData(evt)}\n\n`);
    }

    private async sessionPromptUser(cfgSessionKey: string, cfg: {
        prompt: string;
        mode: "line" | "enter";
        trim: boolean;
        allowEmpty: boolean;
        classes: readonly string[];
    }): Promise<string> {
        const ssn = this.ensureSession(cfgSessionKey);
        if (ssn.pendingPrompt) return "";

        const promptId = randomUUID();

        const out = await new Promise<string>(resolve => {
            const state: PromptState = {
                promptId,
                prompt: cfg.prompt,
                mode: cfg.mode,
                trim: cfg.trim,
                allowEmpty: cfg.allowEmpty,
                classes: [...cfg.classes]
            };

            ssn.pendingPrompt = { state, resolve };
            this.broadcast(cfgSessionKey, { t: "prompt", prompt: state });
        });

        return out;
    }

    private template(): string | null {
        const tpl = this.templateHtml;
        if (!tpl) return null;

        const paletteCss = buildAnsiPaletteCss();

        return tpl
            .replaceAll("{{TITLE}}", escapeHtml(this.title))
            .replaceAll("{{PALETTE_CSS}}", paletteCss);
    }

    private snapshotInit(sessionKey: string): UiInitEvent {
        const ssn = this.ensureSession(sessionKey);
        const spinners = [...ssn.spinners.values()];
        const prompt = ssn.pendingPrompt ? ssn.pendingPrompt.state : null;

        return {
            t: "init",
            title: this.title,
            elements: [...ssn.elements],
            spinners,
            prompt
        };
    }

    private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const method = req.method ?? "GET";
        const rawUrl = req.url ?? "/";
        const pathname = rawUrl.split("?", 1)[0];

        if (method === "GET" && pathname === "/") {
            const html = this.template();
            if (!html) {
                res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
                res.end("Template not loaded yet");
                return;
            }

            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(html);
            return;
        }

        if (method === "GET" && pathname === "/events") {
            const keys = sessionKeyCandidates(rawUrl);
            const sessionKey =
                (keys.tokenKey && this.sessions.has(keys.tokenKey) ? keys.tokenKey : null) ??
                (keys.chatKey && this.sessions.has(keys.chatKey) ? keys.chatKey : null) ??
                keys.tokenKey ??
                keys.chatKey;

            if (!sessionKey) {
                res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
                res.end("Missing sessionToken (or chatId).");
                return;
            }

            const ssn = this.ensureSession(sessionKey);

            res.writeHead(200, {
                "content-type": "text/event-stream",
                "cache-control": "no-cache",
                "connection": "keep-alive",
                "access-control-allow-origin": "*",
                "x-accel-buffering": "no"
            });

            this.sendToClient(res, this.snapshotInit(sessionKey));

            // Global CSS should be applied even for late joiners.
            if (this.cssText.trim()) {
                this.sendToClient(res, { t: "css", css: this.cssText });
            }

            ssn.clients.add(res);

            req.on("close", () => {
                ssn.clients.delete(res);
            });

            return;
        }

        if (method === "POST" && pathname === "/input") {
            const data = await readJsonBody(req);
            if (!isRecord(data)) {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
                return;
            }

            const promptId = typeof data["promptId"] === "string" ? data["promptId"] : "";
            const value = typeof data["value"] === "string" ? data["value"] : "";

            const keys = sessionKeyCandidates(rawUrl);
            const wantPid = promptId.trim();

            const tokenSsn = keys.tokenKey ? this.sessions.get(keys.tokenKey) : undefined;
            const chatSsn = keys.chatKey ? this.sessions.get(keys.chatKey) : undefined;

            const tokenPid = tokenSsn?.pendingPrompt?.state.promptId ?? "";
            const chatPid = chatSsn?.pendingPrompt?.state.promptId ?? "";

            const sessionKey =
                (wantPid && keys.tokenKey && tokenPid === wantPid ? keys.tokenKey : null) ??
                (wantPid && keys.chatKey && chatPid === wantPid ? keys.chatKey : null) ??
                (keys.tokenKey && tokenSsn?.pendingPrompt ? keys.tokenKey : null) ??
                (keys.chatKey && chatSsn?.pendingPrompt ? keys.chatKey : null) ??
                (keys.tokenKey && tokenSsn ? keys.tokenKey : null) ??
                (keys.chatKey && chatSsn ? keys.chatKey : null) ??
                keys.tokenKey ??
                keys.chatKey;

            if (!sessionKey) {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "missing_session" }));
                return;
            }

            const ssn = this.sessions.get(sessionKey);
            if (!ssn) {
                res.writeHead(409, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "unknown_session" }));
                return;
            }

            const pending = ssn.pendingPrompt;
            if (!pending) {
                res.writeHead(409, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "no_pending_prompt" }));
                return;
            }

            if (pending.state.promptId !== promptId) {
                res.writeHead(409, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "prompt_mismatch" }));
                return;
            }

            if (ssn.waitTimer) {
                clearTimeout(ssn.waitTimer);
                ssn.waitTimer = null;
            }

            const out = pending.state.trim ? value.trim() : value;

            if (!pending.state.allowEmpty && !out) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: true, accepted: false }));
                return;
            }

            ssn.pendingPrompt = null;
            this.broadcast(sessionKey, { t: "prompt_clear" });

            pending.resolve(out);

            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true, accepted: true }));
            return;
        }

        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
    }
}