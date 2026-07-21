import wcwidthLib from "wcwidth"

/* =========================
  Internal types (not exported)
========================= */

// 0..255 as a compile time union
type BuildTuple<
    N extends number,
    Acc extends readonly number[] = []
> = Acc["length"] extends N ? Acc : BuildTuple<N, readonly [...Acc, Acc["length"]]>

// Generate a union of numbers from 0 to Max-1
type IntRange<Max extends number, Result extends number[] = []> = Result['length'] extends Max
    ? Result[number]
    : IntRange<Max, [...Result, Result['length']]>
type Ansi256 = IntRange<256>

// Supported SGR tokens, exhaustive for what this class accepts.
// Note: keep this list intentional. Add more tokens here if you want more SGR features.
type Sgr =
    | "\x1b[0m"   // reset
    | "\x1b[1m"   // bold on
    | "\x1b[22m"  // bold off (normal intensity)
    | "\x1b[3m"   // italic on
    | "\x1b[23m"  // italic off
    | "\x1b[4m"   // underline on
    | "\x1b[24m"  // underline off
    | "\x1b[2m"   // dim on
    | "\x1b[22m"  // dim off shares 22 in many terminals
    | `\x1b[38;5;${Ansi256}m` // fg 256
    | `\x1b[48;5;${Ansi256}m` // bg 256

type Style = readonly Sgr[]

type BoxCharset = Readonly<{
    topLeft: string
    topRight: string
    bottomLeft: string
    bottomRight: string
    horizontal: string
    vertical: string
    teeLeft: string
    teeRight: string
}>

const DEFAULT_CHARSET: BoxCharset = {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
    teeLeft: "├",
    teeRight: "┤"
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

function freezeStyle(style: Style): Style {
    return Object.freeze([...style]) as Style
}

/* =========================
  TerminalTui
========================= */

export class TerminalTui {
    public readonly sgr: Readonly<{
        reset: Sgr

        boldOn: Sgr
        boldOff: Sgr

        italicOn: Sgr
        italicOff: Sgr

        underlineOn: Sgr
        underlineOff: Sgr

        dimOn: Sgr
        dimOff: Sgr

        fg256: (n: Ansi256) => Sgr
        bg256: (n: Ansi256) => Sgr

        // Convenience for style arrays, still type safe.
        style: (...codes: readonly Sgr[]) => Style
    }>

    private readonly input: NodeJS.ReadStream
    private readonly output: NodeJS.WriteStream

    private readonly minWidth: number
    private readonly maxWidth: number
    private readonly sidePadding: number

    private readonly charset: BoxCharset
    private readonly wcwidth: (ch: string) => number

    // Defaults used when caller does not pass styles
    private readonly defaultTextStyle: Style
    private readonly defaultBorderStyle: Style
    private readonly defaultTitleStyle: Style

    public constructor(opts: {
        input?: NodeJS.ReadStream
        output?: NodeJS.WriteStream

        minWidth?: number
        maxWidth?: number
        sidePadding?: number

        charset?: Partial<BoxCharset>

        wcwidth?: (ch: string) => number

        // Optional defaults, but still typed and still SGR-safe
        defaultTextStyle?: Style
        defaultBorderStyle?: Style
        defaultTitleStyle?: Style
    } = {}) {
        this.input = opts.input ?? process.stdin
        this.output = opts.output ?? process.stdout

        this.minWidth = opts.minWidth ?? 60
        this.maxWidth = opts.maxWidth ?? 120
        this.sidePadding = opts.sidePadding ?? 2

        this.charset = { ...DEFAULT_CHARSET, ...(opts.charset ?? {}) }
        this.wcwidth = opts.wcwidth ?? wcwidthLib

        this.sgr = Object.freeze({
            reset: "\x1b[0m",

            boldOn: "\x1b[1m",
            boldOff: "\x1b[22m",

            italicOn: "\x1b[3m",
            italicOff: "\x1b[23m",

            underlineOn: "\x1b[4m",
            underlineOff: "\x1b[24m",

            dimOn: "\x1b[2m",
            dimOff: "\x1b[22m",

            fg256: (n: Ansi256) => `\x1b[38;5;${n}m` as Sgr,
            bg256: (n: Ansi256) => `\x1b[48;5;${n}m` as Sgr,

            style: (...codes: readonly Sgr[]) => freezeStyle(codes)
        })

        this.defaultTextStyle = opts.defaultTextStyle ?? this.sgr.style(this.sgr.fg256(245))
        this.defaultBorderStyle = opts.defaultBorderStyle ?? this.sgr.style(this.sgr.fg256(141))
        this.defaultTitleStyle = opts.defaultTitleStyle ?? this.sgr.style(this.sgr.boldOn, this.sgr.fg256(141))
    }

    /* =========================
      Public API, styling
    ========================= */

    public paint(text: string, style: Style = this.defaultTextStyle): string {
        if (style.length === 0) return text
        return style.join("") + text + this.sgr.reset
    }

    public stripAnsi(v: unknown): string {
        return (typeof v === "string" ? v : "").replace(ANSI_REGEX, "")
    }

    public visibleWidth(s: string): number {
        const clean = this.stripAnsi(s)
        let w = 0
        for (const ch of [...clean]) w += this.wcwidth(ch)
        return w
    }

    /* =========================
      Public API, terminal IO
    ========================= */

    public width(): number {
        const cols = this.output.columns ?? 80
        return Math.max(this.minWidth, Math.min(cols, this.maxWidth))
    }

    public clearScreen(): void {
        this.output.write("\x1b[2J\x1b[H")
    }

    public write(s: string): void {
        this.output.write(s)
    }

    public line(s = ""): void {
        this.output.write(s + "\n")
    }

    /* =========================
      Public API, layout
    ========================= */

    public centred(text: string, style: Style = this.defaultTextStyle): void {
        const w = this.width()
        const pad = Math.max(0, Math.floor((w - this.visibleWidth(text)) / 2))
        this.line(" ".repeat(pad) + this.paint(text, style))
    }

    public boxed(
        title: string | null,
        body: string,
        opts: {
            borderStyle?: Style
            bodyStyle?: Style
            titleStyle?: Style
        } = {}
    ): void {
        const w = this.width()
        const inner = w - 2 - this.sidePadding * 2

        const borderStyle = opts.borderStyle ?? this.defaultBorderStyle
        const bodyStyle = opts.bodyStyle ?? this.defaultTextStyle
        const titleStyle = opts.titleStyle ?? this.defaultTitleStyle

        const top = this.charset.topLeft + this.charset.horizontal.repeat(w - 2) + this.charset.topRight
        const bottom = this.charset.bottomLeft + this.charset.horizontal.repeat(w - 2) + this.charset.bottomRight

        this.line(this.paint(top, borderStyle))

        if (title) {
            const cleanTitle = this.stripAnsi(title)
            const titleBlock = ` ${cleanTitle} `
            const titleW = this.visibleWidth(titleBlock)

            const pad = Math.max(0, inner - titleW)
            const left = Math.floor(pad / 2)
            const right = pad - left

            const row =
                this.paint(this.charset.vertical, borderStyle) +
                " ".repeat(this.sidePadding + left) +
                this.paint(titleBlock, titleStyle) +
                " ".repeat(this.sidePadding + right) +
                this.paint(this.charset.vertical, borderStyle)

            this.line(row)

            const sep =
                this.charset.teeLeft + this.charset.horizontal.repeat(w - 2) + this.charset.teeRight
            this.line(this.paint(sep, borderStyle))
        }

        for (const raw of this.wrapBlock(body, inner)) {
            const line = raw ? raw : ""
            const pad = Math.max(0, inner - this.visibleWidth(line))

            const row =
                this.paint(this.charset.vertical, borderStyle) +
                " ".repeat(this.sidePadding) +
                this.paint(line, bodyStyle) +
                " ".repeat(pad) +
                " ".repeat(this.sidePadding) +
                this.paint(this.charset.vertical, borderStyle)

            this.line(row)
        }

        this.line(this.paint(bottom, borderStyle))
    }

    /* =========================
      Public API, animation
    ========================= */

    public startThinking(label: string, opts: {
        intervalMs?: number
        labelStyle?: Style
    } = {}): () => void {
        const frames = ["⋅..", ".⋅.", "..⋅", ".⋅."]
        let i = 0

        const intervalMs = opts.intervalMs ?? 300
        const labelStyle = opts.labelStyle ?? this.sgr.style(this.sgr.italicOn, this.sgr.fg256(245))

        const tick = () => {
            const w = this.width()
            const line = this.paint(label, labelStyle) + " " + frames[i % frames.length]
            const pad = Math.max(0, w - this.visibleWidth(line))
            this.output.write("\r" + line + " ".repeat(pad))
            i += 1
        }

        tick()
        const interval = setInterval(tick, intervalMs)

        return () => {
            clearInterval(interval)
            this.clearCurrentLine()
        }
    }

    public clearCurrentLine(): void {
        const w = this.width()
        this.output.write("\r" + " ".repeat(w) + "\r")
    }

    public async sleep(ms: number): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, ms))
    }

    /* =========================
      Public API, input
    ========================= */

    public async waitForEnterOrTimeout(timeoutMs: number): Promise<void> {
        await new Promise<void>(resolve => {
            let done = false

            const cleanup = (timer: NodeJS.Timeout) => {
                clearTimeout(timer)
                this.input.off("data", onData)
            }

            const onData = () => {
                if (done) return
                done = true
                cleanup(timer)
                resolve()
            }

            const timer = setTimeout(() => {
                if (done) return
                done = true
                cleanup(timer)
                resolve()
            }, timeoutMs)

            this.input.once("data", onData)
        })
    }

    /* =========================
      Private layout helpers
    ========================= */

    private clampSliceToWidth(text: string, width: number): string {
        let out = ""
        let w = 0
        for (const ch of [...text]) {
            const cw = this.wcwidth(ch)
            if (w + cw > width) break
            out += ch
            w += cw
        }
        return out
    }

    private wrapLine(text: string, width: number): string[] {
        const words = text.split(/\s+/).filter(Boolean)
        const lines: string[] = []
        let line = ""

        for (const word of words) {
            if (this.visibleWidth(word) > width) {
                if (line) {
                    lines.push(line)
                    line = ""
                }
                lines.push(this.clampSliceToWidth(word, width))
                continue
            }

            const test = line ? `${line} ${word}` : word

            if (this.visibleWidth(test) > width) {
                if (line) lines.push(line)
                line = word
                continue
            }

            line = test
        }

        if (line) lines.push(line)
        return lines
    }

    private wrapBlock(text: string, width: number): string[] {
        return text
            .split("\n")
            .flatMap(line => {
                const trimmed = line.replace(/\s+$/u, "")
                return trimmed ? this.wrapLine(trimmed, width) : [""]
            })
    }
}