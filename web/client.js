//./web/client.js
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
  Persisted chatId (localStorage)
========================= */

const STORAGE_KEY = "tarotChatId";
const META_PREFIX = "__TAROT_META__";

const savedChatId = (localStorage.getItem(STORAGE_KEY) || "").trim();
const wsPath = "/tarot/ws" + (savedChatId ? `?chatId=${encodeURIComponent(savedChatId)}` : "");

const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host +
  wsPath
);

function handleMetaFrame(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.key === "chatId") {
    const id = (payload.value || "").toString().trim();
    if (id) localStorage.setItem(STORAGE_KEY, id);
    return;
  }
  if (payload.key === "cleared") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/* =========================
  Resize + IO
========================= */

function sendResize() {
  const dims = fitAddon.proposeDimensions();
  if (!dims) return;
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: "resize",
    cols: dims.cols,
    rows: dims.rows
  }));
}

ws.onopen = () => {
  fitAddon.fit();
  sendResize();
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

term.onData(d => ws.send(d));

window.addEventListener("resize", () => {
  fitAddon.fit();
  sendResize();
});

// const toolbar = isMobile
//   ? await new IOSMacToolbar(isMobile).install({
//     send: ({ seq }) => {
//       if (ws.readyState === WebSocket.OPEN) ws.send(seq);
//     }
//   })
//   : null;