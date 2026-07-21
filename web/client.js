// ./web/client.js
const md = new MobileDetect(window.navigator.userAgent);
const isMobile = !!md.mobile();

const term = new Terminal({
  cursorBlink: true,
  scrollback: 2000,
  fontSize: isMobile ? 10 : 14
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

const container = document.getElementById("term");
term.open(container);
fitAddon.fit();

/* =========================
  Persisted chatId + sessionToken (localStorage)
========================= */

const STORAGE_KEY = "tarotChatId";
const SESSION_STORAGE_KEY = "tarotSessionToken";
const SESSION_TOKEN_URL = "https://srv.kittycrypto.gg/session-token";
const META_PREFIX = "__TAROT_META__";

function safeGetLocalStorage(key) {
  try {
    return (localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeRemoveLocalStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function normaliseToken(raw) {
  return (raw || "").toString().trim();
}

async function getSessionToken() {
  const existing = normaliseToken(safeGetLocalStorage(SESSION_STORAGE_KEY));
  if (existing) return existing;

  const response = await fetch(SESSION_TOKEN_URL, { method: "GET" });
  if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

  const data = await response.json();
  const token = data && typeof data === "object" && typeof data.sessionToken === "string"
    ? normaliseToken(data.sessionToken)
    : "";

  if (!token) throw new Error("Invalid session token response");

  safeSetLocalStorage(SESSION_STORAGE_KEY, token);
  return token;
}

function handleMetaFrame(payload) {
  if (!payload || typeof payload !== "object") return;

  if (payload.key === "chatId") {
    const id = (payload.value || "").toString().trim();
    if (id) safeSetLocalStorage(STORAGE_KEY, id);
    return;
  }

  if (payload.key === "cleared") {
    safeRemoveLocalStorage(STORAGE_KEY);
  }
}

/* =========================
  Resize + IO
========================= */

function sendResize(ws) {
  const dims = fitAddon.proposeDimensions();
  if (!dims) return;
  if (!ws) return;
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: "resize",
    cols: dims.cols,
    rows: dims.rows
  }));
}

function wireSocket(ws) {
  ws.onopen = () => {
    fitAddon.fit();
    sendResize(ws);
  };

  ws.onmessage = e => {
    if (typeof e.data !== "string") return;

    // Meta messages from server
    if (e.data.startsWith(META_PREFIX)) {
      const json = e.data.slice(META_PREFIX.length);
      try {
        handleMetaFrame(JSON.parse(json));
      } catch {
        /* ignore */
      }
      return;
    }

    // Normal terminal stream
    term.write(e.data);
  };

  term.onData(d => {
    if (ws.readyState === WebSocket.OPEN) ws.send(d);
  });

  window.addEventListener("resize", () => {
    fitAddon.fit();
    sendResize(ws);
  });
}

(async function bootstrap() {
  try {
    const savedChatId = normaliseToken(safeGetLocalStorage(STORAGE_KEY));
    const sessionToken = await getSessionToken();

    const qs = new URLSearchParams();
    if (savedChatId) qs.set("chatId", savedChatId);
    qs.set("sessionToken", sessionToken);

    const wsPath = "/tarot/ws" + "?" + qs.toString();

    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      wsPath
    );

    wireSocket(ws);
  } catch (err) {
    try {
      console.error(err);
    } catch {
      /* ignore */
    }

    term.write("\r\n");
    term.write("Session initialisation failed.\r\n");
    term.write("Please reload the page. If it persists, check the session-token endpoint.\r\n");
    term.write("\r\n");
  }
})();