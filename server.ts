import http from "http"
import fs from "fs"
import path from "path"
import * as pty from "node-pty"
import { WebSocketServer } from "ws"

const PORT = 6666
const HOST = "127.0.0.1"

const webRoot = path.join(process.cwd(), "web")

function serveFile(res: http.ServerResponse, filePath: string) {
  try {
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath)

    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".js" ? "application/javascript; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      "application/octet-stream"

    res.writeHead(200, { "Content-Type": type })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end("Not found")
  }
}

/* =========================
   HTTP server
========================= */

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400)
    res.end()
    return
  }

  if (req.url === "/tarot" || req.url === "/tarot/") {
    serveFile(res, path.join(webRoot, "webgui.html"))
    return
  }

  if (req.url.startsWith("/tarot/")) {
    const file = req.url.replace("/tarot/", "")
    serveFile(res, path.join(webRoot, file))
    return
  }

  res.writeHead(404)
  res.end("Not found")
})

/* =========================
   WebSocket + PTY
========================= */

const wss = new WebSocketServer({
  server,
  path: "/tarot/ws"
})

const META_PREFIX = "__TAROT_META__"
const OSC_META_PREFIX = "\x1b]0;TAROT_META "
const OSC_META_REGEX = /\x1b\]0;TAROT_META ([^=\x07]+)=([^\x07]*)\x07/g

function splitIncompleteOsc(buf: string): { complete: string; carry: string } {
  const last = buf.lastIndexOf(OSC_META_PREFIX)
  if (last < 0) return { complete: buf, carry: "" }

  const belIdx = buf.indexOf("\x07", last)
  if (belIdx === -1) {
    return { complete: buf.slice(0, last), carry: buf.slice(last) }
  }

  return { complete: buf, carry: "" }
}

wss.on("connection", (ws, req) => {
  const base = `http://${req.headers.host ?? `${HOST}:${PORT}`}`
  const url = new URL(req.url ?? "/tarot/ws", base)
  const chatId = url.searchParams.get("chatId")?.trim()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: "xterm-256color",
    TAROT_META: "1"
  }

  if (chatId) env.TAROT_CHAT_ID = chatId

  const term = pty.spawn("npx", ["ts-node", "app.ts"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env
  })

  let oscCarry = ""

  term.onData(data => {
    if (ws.readyState !== ws.OPEN) return

    // Accumulate and safely handle OSC sequences that may be split across chunks
    const combined = oscCarry + data
    const split = splitIncompleteOsc(combined)
    oscCarry = split.carry

    // Extract any complete meta sequences, forward as dedicated WS messages, strip from terminal output
    const cleaned = split.complete.replace(OSC_META_REGEX, (_m, keyRaw: string, valRaw: string) => {
      const key = String(keyRaw || "").trim()
      const value = String(valRaw || "")

      if (key) {
        ws.send(META_PREFIX + JSON.stringify({ key, value }))
      }
      return ""
    })

    if (cleaned) ws.send(cleaned)
  })

  ws.on("message", data => {
    const msg = data.toString()

    if (msg.startsWith("{")) {
      try {
        const payload = JSON.parse(msg)
        if (payload && payload.type === "resize") {
          term.resize(payload.cols, payload.rows)
          return
        }
      } catch {
        /* ignore */
      }
    }

    term.write(msg)
  })

  ws.on("close", () => term.kill())
  ws.on("error", () => term.kill())

  setTimeout(() => term.kill(), 10 * 60 * 1000)
})

server.listen(PORT, HOST, () => {
  console.log(`Tarot server listening on http://${HOST}:${PORT}/tarot`)
})