// webApp.ts
import "dotenv/config";
import http from "http";
import fs from "fs/promises";
import path from "path";

import {
    TarotEngine,
    loadCardsJson,
    menuText,
    readingTypeFromMenu,
    listHumanReadableCards,
    clearConversation
} from "./tarot";

import type { TarotInterpretation, TarotChatReply } from "./tarot";
import { WebUi, WebUiSession } from "./webUI";

/* =========================
   IO + Styles
========================= */

const portFromEnv = process.env.TAROT_WEB_PORT ? Number.parseInt(process.env.TAROT_WEB_PORT, 10) : undefined;

const serverUi = new WebUi({
    port: Number.isNaN(portFromEnv ?? Number.NaN) ? undefined : portFromEnv,
    title: "Tarot Reader",
    logUrl: true
});

/* =========================
   Monkeypatch: serve + inject webClient.js + optional styles.css
========================= */

type RouteFn = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
type TemplateFn = () => string | null;

type WebUiHack = {
    route: RouteFn;
    template: TemplateFn;
};

const hack = serverUi as unknown as WebUiHack;

const routeOrig = hack.route.bind(serverUi) as RouteFn;
const templateOrig = hack.template.bind(serverUi) as TemplateFn;

const HEAD_OPEN_RE = /<head\b[^>]*>/iu;

function injectAfterHeadOpen(html: string, snippet: string): string {
    const m = HEAD_OPEN_RE.exec(html);
    if (!m) return html;
    const idx = m.index + m[0].length;
    return html.slice(0, idx) + `\n${snippet}\n` + html.slice(idx);
}

const HEAD_CLOSE_RE = /<\/head\s*>/iu;

const webClientCandidates: readonly string[] = [
    path.resolve(process.cwd(), "webClient.js"),
    path.resolve(import.meta.dir, "webClient.js")
];

const stylesCssPath = path.resolve(process.cwd(), "styles.css");

let webClientCache: string | null = null;

function firstHeaderValue(v: string | readonly string[] | undefined): string | undefined {
    if (!v) return undefined;
    if (Array.isArray(v)) return v[0] as string | undefined;
    if (typeof v === "string") return v;
    return undefined;
}

function normaliseBasePath(raw: string | undefined): string {
    const v = (raw || "").trim();
    if (!v || v === "/") return "";
    const withSlash = v.startsWith("/") ? v : `/${v}`;
    return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceQuotedPath(html: string, fromPath: string, toPath: string): string {
    const re = new RegExp(`(["'\`])${escapeRegExp(fromPath)}(?=[?/"'\`])`, "gu");
    return html.replace(re, `$1${toPath}`);
}

function replaceCssUrl(html: string, fromPath: string, toPath: string): string {
    const re = new RegExp(`url\\(\\s*(["']?)${escapeRegExp(fromPath)}\\1\\s*\\)`, "giu");
    return html.replace(re, `url(${toPath})`);
}

function getMountBasePath(req: http.IncomingMessage): string {
    const envBase = normaliseBasePath(process.env.TAROT_WEB_BASE_PATH);
    if (envBase) return envBase;

    const hdr = firstHeaderValue(req.headers["x-forwarded-prefix"]);
    return normaliseBasePath(hdr);
}

function applyMountToHtml(html: string, basePath: string): string {
    if (!basePath) return html;

    const stylesTo = `${basePath}/styles.css`;
    const clientTo = `${basePath}/webClient.js`;
    const eventsTo = `${basePath}/events`;
    const inputTo = `${basePath}/input`;

    let out = html;

    out = replaceQuotedPath(out, "/styles.css", stylesTo);
    out = replaceQuotedPath(out, "/webClient.js", clientTo);
    out = replaceQuotedPath(out, "/events", eventsTo);
    out = replaceQuotedPath(out, "/input", inputTo);

    out = replaceCssUrl(out, "/styles.css", stylesTo);
    out = replaceCssUrl(out, "/webClient.js", clientTo);

    return out;
}

async function readFirstExistingFile(paths: readonly string[]): Promise<string | null> {
    for (const p of paths) {
        try {
            return await fs.readFile(p, "utf8");
        } catch {
            // try next
        }
    }
    return null;
}

async function getWebClientJs(): Promise<string | null> {
    if (webClientCache) return webClientCache;

    const found = await readFirstExistingFile(webClientCandidates);
    if (!found) return null;

    webClientCache = found;
    return webClientCache;
}

async function hasStylesCss(): Promise<boolean> {
    try {
        await fs.access(stylesCssPath);
        return true;
    } catch {
        return false;
    }
}

async function readStylesCss(): Promise<string | null> {
    try {
        return await fs.readFile(stylesCssPath, "utf8");
    } catch {
        return null;
    }
}

function injectBeforeHeadClose(html: string, snippet: string): string {
    if (!HEAD_CLOSE_RE.test(html)) return html;
    return html.replace(HEAD_CLOSE_RE, `${snippet}\n</head>`);
}

function injectStylesLinkIfMissing(html: string): string {
    if (html.includes('href="/styles.css"') || html.includes("href='/styles.css'")) {
        return html;
    }

    const userStyleRe = /<style\s+id=(["'])tui-user-css\1[^>]*>\s*<\/style\s*>/iu;

    if (userStyleRe.test(html)) {
        return html.replace(
            userStyleRe,
            `<link rel="stylesheet" href="/styles.css">\n$&`
        );
    }

    return injectBeforeHeadClose(
        html,
        `<link rel="stylesheet" href="/styles.css">`
    );
}

hack.template = () => {
    const html = templateOrig();
    if (!html) return html;

    if (html.includes("/webClient.js")) return html;

    return injectBeforeHeadClose(
        html,
        `<script src="/webClient.js"></script>`
    );

};

type ParsedSession = {
    sessionToken: string | null;
    chatId: string | null;
};

function resolveSessionKeyFromParsed(p: ParsedSession): string | null {
    if (p.sessionToken) return p.sessionToken;
    if (p.chatId) return `chat:${p.chatId}`;
    return null;
}

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

/* =========================
   Session runner: one Tarot loop per sessionToken
========================= */

type AppCtx = {
    apiKey: string;
    data: ReturnType<typeof loadCardsJson>;
};

const appReady: Promise<AppCtx> = (async () => {
    await serverUi.ready;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const data = loadCardsJson("./cards.json");
    return { apiKey, data };
})();

const running = new Map<string, Promise<void>>();

function startSessionIfNeeded(sessionKey: string, chatId: string | null): void {
    const key = sessionKey.trim();
    if (!key) return;
    if (running.has(key)) return;

    const initialChatId = (chatId || "").trim() || undefined;

    const p = (async () => {
        const ctx = await appReady;
        const io = serverUi.forSession(key);
        await runTarotSession(io, ctx.apiKey, ctx.data, key, initialChatId);
    })()
        .catch(err => {
            // eslint-disable-next-line no-console
            console.error(err);
        })
        .finally(() => {
            running.delete(key);
        });

    running.set(key, p);
}

async function runTarotSession(
    io: WebUiSession,
    apiKey: string,
    data: ReturnType<typeof loadCardsJson>,
    sessionKey: string,
    initialChatId: string | undefined
): Promise<void> {
    await io.ready;

    const ui = io.ui;

    const startPlaceholderRotator = (params: {
        elementId: string;
        suggestions: readonly string[];
        fallback: string;
        intervalMs?: number;
    }): () => void => {
        const intervalMs = Math.max(250, params.intervalMs ?? 3000);

        const list = params.suggestions
            .map(s => s.trim())
            .filter(Boolean);

        const effective = list.length ? list : [params.fallback];

        let stopped = false;
        let i = 0;

        const loop = async (): Promise<void> => {
            while (!stopped) {
                const next = effective[i % effective.length] ?? params.fallback;
                i += 1;

                io.setInputPlaceholder(params.elementId, next, true);
                await ui.sleep(intervalMs);
            }
        };

        void loop().catch(() => undefined);

        return () => {
            stopped = true;
        };
    };

    const S = ui.sgr;

    const NO_STYLE = S.style();

    const STYLE_GREY = S.style(S.fg256(245));
    const STYLE_ITALIC_GREY = S.style(S.italicOn, S.fg256(245));
    const STYLE_GOLD = S.style(S.fg256(220));

    const BORDER_GREY = S.style(S.fg256(245));
    const TITLE_GREY = S.style(S.boldOn, S.fg256(245));

    const BORDER_PURPLE = S.style(S.fg256(141));
    const TITLE_PURPLE = S.style(S.boldOn, S.fg256(141));

    const BORDER_CYAN = S.style(S.fg256(81));
    const TITLE_CYAN = S.style(S.boldOn, S.fg256(81));

    const BORDER_WHITE = S.style(S.fg256(255));
    const TITLE_WHITE = S.style(S.boldOn, S.fg256(255));

    function boxed(
        title: string | null,
        body: string,
        borderStyle = BORDER_PURPLE,
        titleStyle = TITLE_PURPLE
    ): void {
        io.boxed(title, body, { borderStyle, titleStyle, bodyStyle: NO_STYLE });
    }

    function centred(text: string, style = STYLE_GREY): void {
        io.centred(text, style);
    }

    function applyPlaceholders(text: string, readerName: string, querentName: string): string {
        const querent = querentName.trim()
            ? querentName.trim()
            : "the person across the table";

        return text
            .replaceAll("${tarotist}", readerName)
            .replaceAll("${Tarotist}", readerName)
            .replaceAll("${reader}", readerName)
            .replaceAll("${Reader}", readerName)
            .replaceAll("${consultante}", querent)
            .replaceAll("${Consultante}", querent)
            .replaceAll("${querent}", querent)
            .replaceAll("${Querent}", querent);
    }

    function isRecord(v: unknown): v is Record<string, unknown> {
        return typeof v === "object" && v !== null;
    }

    function isTarotInterpretation(v: unknown): v is TarotInterpretation {
        if (!isRecord(v)) return false;
        return (
            typeof v["reading_type"] === "string" &&
            typeof v["question"] === "string" &&
            typeof v["initial_gesture"] === "string" &&
            typeof v["full_reading"] === "string" &&
            typeof v["final_gesture"] === "string" &&
            typeof v["note"] === "string"
        );
    }

    function isTarotChatReply(v: unknown): v is TarotChatReply {
        if (!isRecord(v)) return false;
        const gestureOk = typeof v["gesture"] === "string";
        const replyOk = typeof v["reply"] === "string" || typeof v["response"] === "string";
        return gestureOk && replyOk;
    }

    function safeJson(v: unknown): string {
        try {
            return JSON.stringify(v, null, 2);
        } catch {
            return "[could not serialise]";
        }
    }

    type FollowUpSuggestions = {
        suggestions: string[];
    };

    function schemaFollowUpSuggestion(): Record<string, unknown> {
        return {
            type: "object",
            additionalProperties: false,
            properties: {
                suggestions: {
                    type: "array",
                    minItems: 3,
                    maxItems: 6,
                    items: { type: "string" }
                }
            },
            required: ["suggestions"]
        };
    }

    function isSuggestions(v: unknown): v is FollowUpSuggestions {
        if (!isRecord(v)) return false;
        const s = v["suggestions"];
        return Array.isArray(s) && s.every(x => typeof x === "string" && x.trim().length > 0);
    }

    function buildFollowUpSuggestionPrompt(params: {
        readerName: string;
        interpretation: TarotInterpretation;
    }): string {
        const it = params.interpretation;

        // Keep it short, but anchor hard on the actual reading content.
        return [
            `You are ${params.readerName}, continuing a tarot reading conversation.`,
            "",
            "Task",
            "Generate some follow-up question examples for the querent to ask next, based on the specific reading below.",
            "These must be natural user questions, not explanations.",
            "",
            "Constraints",
            "- Only three suggestions.",
            "- They must be one short sentence in question form each.",
            "- Reference at least one concrete element from the reading in each suggestion for example a card name and what it means in the reading.",
            "- Avoid generic questions like 'tell me more'.",
            "- Do not mention AI, schemas, or system prompts.",
            "",
            "Reading context",
            `Original question: ${JSON.stringify(it.question)}`,
            `Synthesis: ${JSON.stringify(it.synthesis)}`,
            `Full reading: ${JSON.stringify(it.full_reading)}`,
            "",
            `Example questions: "What does the [CARD NAME] in [CARD POSITION] suggest about [SOMETHING RELEVANT TO THE QUESTION]?"`,
            `"\nHow can I apply the advice from the [CARD NAME] to my current situation?"`,
            `"\nCould you elaborate on the significance of the [CARD NAME] in relation to my question?"`,
            "Return JSON only."
        ].join("\n");
    }

    function normaliseSuggestions(items: readonly string[]): string[] {
        const seen = new Set<string>();
        const out: string[] = [];

        for (const raw of items) {
            const s = raw.trim().replace(/\s+/gu, " ");
            if (!s) continue;

            // Keep it a question if possible (helps UX)
            const q = s.endsWith("?") ? s : `${s}?`;

            const key = q.toLowerCase();
            if (seen.has(key)) continue;

            seen.add(key);
            out.push(q);

            if (out.length >= 6) break;
        }

        return out;
    }

    function extractSuggestionsFromText(text: string): string[] {
        const t = text.trim();
        if (!t) return [];

        // Try to locate a JSON object containing "suggestions": [...]
        const jsonBlockRe = /\{[\s\S]*?"suggestions"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/iu;
        const m = jsonBlockRe.exec(t);
        if (m) {
            try {
                const obj = JSON.parse(m[0]) as unknown;
                if (isSuggestions(obj)) return normaliseSuggestions(obj.suggestions);
            } catch { }
        }

        // Extract quoted strings that look like questions
        const quotedRe = /"([^"]{5,200})"/gu;
        const quoted: string[] = [];
        for (const qm of t.matchAll(quotedRe)) {
            const s = (qm[1] || "").trim();
            if (s) quoted.push(s);
        }
        if (quoted.length >= 2) {
            const qs = quoted.filter(x => /[?]/u.test(x) || x.length >= 12);
            const norm = normaliseSuggestions(qs.length ? qs : quoted);
            if (norm.length) return norm;
        }

        // Bullet or numbered lists
        const lines = t.split(/\r?\n/gu).map(x => x.trim()).filter(Boolean);

        const listItemRe = /^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/u;
        const list: string[] = [];
        for (const line of lines) {
            const lm = listItemRe.exec(line);
            if (lm && lm[1]) list.push(lm[1].trim());
        }
        if (list.length) return normaliseSuggestions(list);

        // As a last resort: pick sentences that end with '?'
        const questions = t.split(/[.!]\s+/gu).map(x => x.trim()).filter(x => x.endsWith("?"));
        return normaliseSuggestions(questions);
    }

    function fallbackSuggestions(readerName: string, interpretation: TarotInterpretation): string[] {
        const cards = (interpretation.cards || []).slice(0, 3).map(c => c.position_name).filter(Boolean);
        const anchor = cards[0] || "that key position";

        return normaliseSuggestions([
            `What does ${anchor} mean for my question`,
            `Which part of the reading should I act on first`,
            `What is the main obstacle you see in this spread`,
            `How should I interpret the tension between the cards`,
            `What would change the outcome suggested by this reading`
        ]);
    }

    async function generateFollowUpSuggestions(
        engine: TarotEngine,
        readerName: string,
        interpretation: TarotInterpretation
    ): Promise<string[]> {
        const convo = engine.jsonConversation;

        try {
            await convo.updateSchema(schemaFollowUpSuggestion());

            const rawUnknown = await convo.send(
                "user",
                buildFollowUpSuggestionPrompt({ readerName, interpretation }),
                { model: "gpt-4.1-nano" }
            ) as unknown;

            // Best case: it already matches the schema
            if (isSuggestions(rawUnknown)) {
                const norm = normaliseSuggestions(rawUnknown.suggestions);
                return norm.length ? norm : fallbackSuggestions(readerName, interpretation);
            }

            // Next: try parsing string-ish outputs using regex
            const rawText =
                typeof rawUnknown === "string"
                    ? rawUnknown
                    : safeJson(rawUnknown);

            const extracted = extractSuggestionsFromText(rawText);
            if (extracted.length) return extracted;

            // Final: deterministic fallback
            return fallbackSuggestions(readerName, interpretation);
        } catch (err: unknown) {
            // Log, but never fail the UX
            // eslint-disable-next-line no-console
            console.warn("follow-up suggestion generation failed:", err);
            return fallbackSuggestions(readerName, interpretation);
        }
    }

    function getRestoredId(engine: TarotEngine): string | undefined {
        const restored = engine.restoredConversation as unknown;
        if (!isRecord(restored)) return undefined;
        const id = restored["id"];
        return typeof id === "string" && id.trim() ? id.trim() : undefined;
    }

    async function printRestoredChat(engine: TarotEngine): Promise<void> {
        const restored = engine.restoredConversation as unknown;
        if (!isRecord(restored)) return;

        const messages = restored["messages"];
        if (!Array.isArray(messages) || messages.length === 0) return;

        const id = typeof restored["id"] === "string" ? restored["id"] : "";
        const createdAt = typeof restored["createdAt"] === "string" ? restored["createdAt"] : "";

        io.line();
        centred("The air still holds the thread of your last visit…", STYLE_ITALIC_GREY);
        await ui.sleep(180);

        io.line();
        io.boxed(
            "Chat echo",
            [
                id ? `ID: ${id}` : "ID: [unknown]",
                createdAt ? `Created: ${createdAt}` : "Created: [unknown]",
                `Messages: ${messages.length}`
            ].join("\n"),
            { borderStyle: BORDER_CYAN, titleStyle: TITLE_CYAN, bodyStyle: NO_STYLE }
        );

        for (const m of messages) {
            if (!isRecord(m)) continue;

            const prompt = typeof m["prompt"] === "string" ? m["prompt"] : "";
            const resp = m["response"];

            io.line();
            io.boxed("User", prompt || "[empty]", { borderStyle: BORDER_GREY, titleStyle: TITLE_GREY, bodyStyle: NO_STYLE });

            if (isTarotInterpretation(resp)) {
                const body = [
                    resp.initial_gesture,
                    "",
                    resp.full_reading,
                    "",
                    resp.final_gesture,
                    "",
                    resp.note
                ].filter(Boolean).join("\n");

                io.boxed(engine.reader.name, body, { borderStyle: BORDER_PURPLE, titleStyle: TITLE_PURPLE, bodyStyle: NO_STYLE });
                continue;
            }

            if (isTarotChatReply(resp)) {
                const rec = resp as unknown as Record<string, unknown>;
                const gesture = typeof rec["gesture"] === "string" ? rec["gesture"] : "";
                const reply = typeof rec["response"] === "string"
                    ? rec["response"]
                    : (typeof rec["reply"] === "string" ? rec["reply"] : "");

                const body = [gesture, "", reply].filter(Boolean).join("\n");
                io.boxed(engine.reader.name, body, { borderStyle: BORDER_PURPLE, titleStyle: TITLE_PURPLE, bodyStyle: NO_STYLE });
                continue;
            }

            io.boxed(engine.reader.name, safeJson(resp), { borderStyle: BORDER_PURPLE, titleStyle: TITLE_PURPLE, bodyStyle: NO_STYLE });
        }

        io.line();
    }

    /* =========================
       Web metadata (session-scoped)
    ========================= */

    let lastSentChatId: string | null = null;

    function emitChatId(engine: TarotEngine): void {
        const id = engine.conversationId;
        if (!id) return;
        if (lastSentChatId === id) return;

        lastSentChatId = id;
        io.setMeta("chatId", id);
        io.setMeta("title", `Tarot Reader (chatId ${id})`);
    }

    function emitCleared(): void {
        io.setMeta("cleared", "1");
        lastSentChatId = null;
    }

    /* =========================
       Main loop for this session
    ========================= */

    sessionLoop:
    while (true) {
        const engine = new TarotEngine(apiKey, data, sessionKey, {
            chatId: initialChatId,
            io: io as unknown as never
        });

        // Only use the initial chatId on first construction for this session run.
        initialChatId = undefined;

        emitChatId(engine);

        const readerName = engine.reader.name;
        const restoredId = getRestoredId(engine);
        const isRestored = Boolean(restoredId);

        io.clearScreen();
        centred(
            isRestored
                ? "✦ We continue where we left off ✦"
                : "✦ Welcome to the tarot reader ✦",
            STYLE_GOLD
        );
        centred(`Your Tarot Reader: ${readerName}`, STYLE_ITALIC_GREY);
        io.line();

        if (isRestored) {
            await printRestoredChat(engine);
        } else {
            io.setInputPlaceholder("tui-input", "Please type your name...");
            const userName = await io.askLine("What is your name?\n> ", { trim: true, allowEmpty: true });
            if (userName) engine.setQuerentName(userName);

            io.line();

            const sceneRaw = [engine.reader.lounge, "", engine.reader.portrait].join("\n");
            const scene = applyPlaceholders(sceneRaw, readerName, userName);

            io.boxed("Entrance", scene, { borderStyle: BORDER_GREY, titleStyle: TITLE_GREY, bodyStyle: NO_STYLE });
            io.line();

            const waitRaw = engine.reader.waiting || "The silence stretches for a moment";
            const wait = applyPlaceholders(waitRaw, readerName, userName);

            centred(wait, STYLE_ITALIC_GREY);
            io.setInputPlaceholder("tui-input", "Press ENTER or click the button to continue ➡️");
            centred("Press ENTER when you wish to continue…", STYLE_GREY);

            let stopWelcome = ui.startThinking(wait, { labelStyle: STYLE_ITALIC_GREY });
            const welcomePromise = engine.generateWelcome().catch(() => null);

            await io.waitForEnterOrTimeout(60000);

            stopWelcome();
            io.line();

            const welcome = await welcomePromise;
            if (typeof welcome === "string" && welcome.trim()) {
                centred(welcome, STYLE_ITALIC_GREY);
                io.line();
            }
        }

        while (true) {
            const canClear = Boolean(engine.conversationId) || Boolean(getRestoredId(engine));
            io.line(menuText(canClear));
            io.setInputPlaceholder("tui-input", "Please choose an option from the menu (1, 2, 3, 4, 5, 6, 0)...");

            const opt = await io.askLine("> ", { trim: true, allowEmpty: true });
            if (!opt) continue;

            if (opt === "0") {
                io.close(); // closes only this session
                return;
            }

            if (opt === "6") {
                const id = engine.conversationId ?? getRestoredId(engine);
                if (!id) continue;

                clearConversation(id);
                emitCleared();

                io.line();
                centred("The table is cleared. We return to the threshold…", STYLE_ITALIC_GREY);
                await ui.sleep(700);
                continue sessionLoop;
            }

            const type = readingTypeFromMenu(opt);
            if (!type) continue;

            io.setInputPlaceholder("tui-input", `Please type your question for ${readerName}...`);
            const question = await io.askLine("What would you like to ask?\n> ", { trim: true, allowEmpty: true });
            if (!question) continue;

            const openingLabel = `${readerName}'s gaze is steady, listening to the question`;
            const ritualLabel = `${readerName}'s eyes close, shuffling the deck`;
            const interpretLabel = `${readerName} studies the reading in silence`;

            let currentLabel = openingLabel;
            let stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });

            io.setInputPlaceholder("tui-input", `Please wait...`);

            try {
                const { interpretation } = await engine.doReading(
                    { type, question },
                    {
                        onTheatre: async (line: string) => {
                            stopThinking();
                            centred(line, STYLE_ITALIC_GREY);
                            stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });
                            io.setInputPlaceholder("tui-input", `Please wait...`);
                        },

                        onOpening: async (opening) => {
                            emitChatId(engine);

                            stopThinking();
                            io.line();

                            centred(opening.initial_gesture, STYLE_ITALIC_GREY);
                            await ui.sleep(200);

                            boxed("Opening", opening.opening, BORDER_PURPLE, TITLE_PURPLE);
                            await ui.sleep(150);

                            io.line();
                            centred(`${readerName} takes the deck into her hands…`, STYLE_ITALIC_GREY);
                            await ui.sleep(450);

                            currentLabel = ritualLabel;
                            stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });
                        },

                        onRitual: async (ritual) => {
                            emitChatId(engine);

                            stopThinking();
                            io.line();

                            boxed("The ritual", ritual.link_question_to_spread, BORDER_PURPLE, TITLE_PURPLE);
                            await ui.sleep(150);
                        },

                        onRevealCards: async (spread) => {
                            io.line();

                            const cardLines = listHumanReadableCards(spread);
                            centred(
                                cardLines.length === 1
                                    ? "With a slow gesture, I turn the card…"
                                    : "With a slow gesture, I turn the cards one by one…",
                                STYLE_ITALIC_GREY
                            );
                            await ui.sleep(400);

                            io.boxed(
                                cardLines.length === 1
                                ? "The card on the table"
                                : "The cards on the table",
                                listHumanReadableCards(spread).join("\n"),
                                { borderStyle: BORDER_CYAN, titleStyle: TITLE_CYAN, bodyStyle: NO_STYLE }
                            );

                            io.line();

                            currentLabel = interpretLabel;
                            stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });
                        }
                    }
                );

                emitChatId(engine);
                stopThinking();

                for (const g of interpretation.gestures_during) {
                    centred(g, STYLE_ITALIC_GREY);
                    await ui.sleep(180);
                }

                io.boxed("The reading", interpretation.full_reading, {
                    borderStyle: BORDER_WHITE,
                    titleStyle: TITLE_WHITE,
                    bodyStyle: NO_STYLE
                });

                centred(interpretation.final_gesture, STYLE_ITALIC_GREY);
                io.line();
                centred(interpretation.note, STYLE_GREY);
                io.line();

                const suggestions = await generateFollowUpSuggestions(engine, readerName, interpretation);
                const fallback = `Ask ${readerName} about your reading...`;

                //console.log("Follow-up suggestions:", suggestions);

                const stopRotatePlaceholder = startPlaceholderRotator({
                    elementId: "tui-input",
                    suggestions,
                    fallback,
                    intervalMs: 3000
                });

                while (true) {
                    const followUp = await io.askLine(
                        `Ask ${readerName}, or type "new reading"\n> `,
                        { trim: true, allowEmpty: true }
                    );
                    if (!followUp) continue;

                    // Stop rotating as soon as we have user input
                    stopRotatePlaceholder();

                    if (followUp === "new reading" || followUp.toLowerCase().includes("new reading")) {
                        io.line();
                        break;
                    }

                    let stopChat = ui.startThinking("Listening", { labelStyle: STYLE_ITALIC_GREY });

                    const reply = await engine.chatAfterReading(
                        followUp,
                        {
                            onTheatre: (line: string) => {
                                stopChat();
                                centred(line, STYLE_ITALIC_GREY);
                                stopChat = ui.startThinking("Listening", { labelStyle: STYLE_ITALIC_GREY });
                            }
                        }
                    );

                    stopChat();

                    centred(reply.gesture, STYLE_ITALIC_GREY);
                    io.boxed(null, reply.response, { borderStyle: BORDER_PURPLE, titleStyle: TITLE_PURPLE, bodyStyle: NO_STYLE });
                }
            } finally {
                stopThinking();
            }
        }
    }
}

/* =========================
   Route shim: start per-session engine loops on /events
========================= */

hack.route = async (req, res) => {
    const method = req.method ?? "GET";
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?", 1)[0];

    if (method === "GET" && rawUrl.startsWith("/events")) {
        const parsed = parseSessionFromRawUrl(rawUrl);
        const sessionKey = resolveSessionKeyFromParsed(parsed);

        if (sessionKey) {
            startSessionIfNeeded(sessionKey, parsed.chatId);
        }

        return routeOrig(req, res);
    }

    // Serve /styles.css from ./styles.css if it exists (otherwise fall back to WebUi behaviour).
    if (method === "GET" && pathname === "/styles.css") {
        const css = await readStylesCss();
        if (!css) return routeOrig(req, res);

        res.writeHead(200, {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-store"
        });
        res.end(css);
        return;
    }

    // Force the page to include /styles.css only when ./styles.css exists.
    if (method === "GET" && pathname === "/") {
        const baseHtml = hack.template();
        if (!baseHtml) {
            res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
            res.end("Template not loaded yet");
            return;
        }

        let html = baseHtml;
        if (await hasStylesCss()) html = injectStylesLinkIfMissing(html);

        // If behind a reverse-proxy subpath, rewrite root-absolute URLs to the mount prefix
        const basePath = getMountBasePath(req);
        html = applyMountToHtml(html, basePath);

        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
    }

    if (method === "GET" && pathname === "/webClient.js") {
        const js = await getWebClientJs();
        if (!js) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("webClient.js not found");
            return;
        }

        res.writeHead(200, {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-store"
        });
        res.end(js);
        return;
    }

    return routeOrig(req, res);
};

// Ensure early surfacing of config issues.
appReady.catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
});