// app.ts
import "dotenv/config";
import { stdin as input, stdout as output } from "process";

import {
  TarotEngine,
  loadCardsJson,
  menuText,
  readingTypeFromMenu,
  listHumanReadableCards,
  clearConversation
} from "./tarot";

import type { TarotInterpretation, TarotChatReply } from "./tarot";
import { TerminalIo } from "./io";

/* =========================
   IO + Styles
========================= */

const io = new TerminalIo({ input, output });
const ui = io.ui;
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

/* =========================
   Optional input with timeout
========================= */

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

/* ==========================
   Chat restoration
============================= */

function readInitialChatId(): string | undefined {
  const env = process.env.TAROT_CHAT_ID;
  if (env && env.trim()) return env.trim();

  const inline = process.argv.find(a => a.startsWith("--chatId=") || a.startsWith("--chat="));
  if (inline) {
    const v = inline.split("=", 2)[1];
    return v && v.trim() ? v.trim() : undefined;
  }

  const idx = process.argv.findIndex(a => a === "--chatId" || a === "--chat");
  if (idx >= 0) {
    const v = process.argv[idx + 1];
    return v && v.trim() ? v.trim() : undefined;
  }

  return undefined;
}

function readSessionKey(): string | undefined {
  const env =
    (process.env.TAROT_SESSION_KEY || "").trim() ||
    (process.env.TAROT_SESSION_TOKEN || "").trim() ||
    (process.env.SESSION_TOKEN || "").trim();

  if (env) return env;

  const inline = process.argv.find(a =>
    a.startsWith("--sessionKey=") ||
    a.startsWith("--sessionToken=") ||
    a.startsWith("--session=")
  );

  if (inline) {
    const v = inline.split("=", 2)[1];
    return v && v.trim() ? v.trim() : undefined;
  }

  const idx = process.argv.findIndex(a =>
    a === "--sessionKey" ||
    a === "--sessionToken" ||
    a === "--session"
  );

  if (idx >= 0) {
    const v = process.argv[idx + 1];
    return v && v.trim() ? v.trim() : undefined;
  }

  return undefined;
}

/* ==========================
   Session token auto-fetch (Option B)
============================= */

type SessionTokenPayload = Readonly<{ sessionToken: string }>;

function isSessionTokenPayload(v: unknown): v is SessionTokenPayload {
  if (typeof v !== "object" || v === null) return false;
  const rec = v as Record<string, unknown>;
  const tok = rec["sessionToken"];
  return typeof tok === "string" && tok.trim().length > 0;
}

async function fetchSessionToken(url: string, timeoutMs: number): Promise<string | undefined> {
  const u = url.trim();
  if (!u) return undefined;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(u, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!res.ok) return undefined;

    const data: unknown = await res.json();
    if (!isSessionTokenPayload(data)) return undefined;

    return data.sessionToken.trim();
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

async function resolveSessionKey(): Promise<string> {
  const explicit = readSessionKey();
  if (explicit) return explicit;

  const url = (process.env.TAROT_SESSION_TOKEN_URL || "https://srv.kittycrypto.gg/session-token").trim();
  const timeoutMsRaw = (process.env.TAROT_SESSION_TOKEN_TIMEOUT_MS || "").trim();
  const timeoutMsParsed = timeoutMsRaw ? Number.parseInt(timeoutMsRaw, 10) : NaN;
  const timeoutMs = Number.isFinite(timeoutMsParsed) && timeoutMsParsed > 0 ? timeoutMsParsed : 5000;

  const fetched = await fetchSessionToken(url, timeoutMs);
  if (fetched) return fetched;

  throw new Error(
    "Missing session token. Provide TAROT_SESSION_KEY (or TAROT_SESSION_TOKEN), pass --sessionToken=<token>, or set TAROT_SESSION_TOKEN_URL to a token endpoint."
  );
}

/* ==========================
   Type guards / printing
============================= */

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
   Web metadata (chatId via terminal title)
========================= */

const META_ENABLED = process.env.TAROT_META === "1";
let lastSentChatId: string | null = null;

function emitMeta(key: string, value: string): void {
  if (!META_ENABLED) return;

  const safe = value
    .replaceAll("\x1b", "")
    .replaceAll("\x07", "")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");

  process.stdout.write(`\x1b]0;TAROT_META ${key}=${safe}\x07`);
}

function emitChatId(engine: TarotEngine): void {
  const id = engine.conversationId;
  if (!id) return;
  if (lastSentChatId === id) return;

  lastSentChatId = id;
  emitMeta("chatId", id);
}

function emitCleared(): void {
  emitMeta("cleared", "1");
  lastSentChatId = null;
}

/* =========================
   Main
========================= */

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const sessionKey = await resolveSessionKey();

  const data = loadCardsJson("./cards.json");
  let initialChatId = readInitialChatId();

  sessionLoop:
  while (true) {
    const engine = new TarotEngine(apiKey, data, sessionKey, {
      chatId: initialChatId,
      io
    });

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
      const userName = await io.askLine("What is your name?\n> ", { trim: true, allowEmpty: true });
      if (userName) engine.setQuerentName(userName);

      io.line();

      const sceneRaw = [
        engine.reader.lounge,
        "",
        engine.reader.portrait
      ].join("\n");

      const scene = applyPlaceholders(sceneRaw, readerName, userName);
      io.boxed("Entrance", scene, { borderStyle: BORDER_GREY, titleStyle: TITLE_GREY, bodyStyle: NO_STYLE });

      io.line();

      const waitRaw = engine.reader.waiting || "The silence stretches for a moment";
      const wait = applyPlaceholders(waitRaw, readerName, userName);

      centred(wait, STYLE_ITALIC_GREY);
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

    /* ===== Main menu ===== */

    while (true) {
      const canClear = Boolean(engine.conversationId) || Boolean(getRestoredId(engine));
      io.line(menuText(canClear));

      const opt = await io.askLine("> ", { trim: true, allowEmpty: true });
      if (!opt) continue;

      if (opt === "0") {
        io.close();
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

      const question = await io.askLine("What would you like to ask?\n> ", { trim: true, allowEmpty: true });
      if (!question) continue;

      const openingLabel =
        `${readerName}'s gaze is steady, listening to the question`;
      const ritualLabel =
        `${readerName}'s eyes close, shuffling the deck`;
      const interpretLabel =
        `${readerName} studies the cards in silence`;

      let currentLabel = openingLabel;
      let stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });

      try {
        const { interpretation } = await engine.doReading(
          { type, question },
          {
            onTheatre: async (line: string) => {
              stopThinking();
              centred(line, STYLE_ITALIC_GREY);
              stopThinking = ui.startThinking(currentLabel, { labelStyle: STYLE_ITALIC_GREY });
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
              centred("With a slow gesture, I turn the cards one by one…", STYLE_ITALIC_GREY);
              await ui.sleep(400);

              io.boxed(
                "The cards on the table",
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

        while (true) {
          const followUp = await io.askLine(
            `Speak with ${readerName} or type "new reading"\n> `,
            { trim: true, allowEmpty: true }
          );
          if (!followUp) continue;

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
      } catch (err) {
        stopThinking();
        throw err;
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});