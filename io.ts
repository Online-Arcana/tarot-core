//io.ts
import readline from "readline/promises"
import { stdin as defaultInput, stdout as defaultOutput } from "process"

import { TerminalTui } from "./tui"
import type { JSONConversation, SendOptions } from "./jsonConvos"

type MaybePromise<T> = T | Promise<T>

type Style = ReturnType<TerminalTui["sgr"]["style"]>
type RetryInfo = Parameters<NonNullable<SendOptions["onRetry"]>>[0]

export type TerminalIoOptions = {
    input?: NodeJS.ReadStream
    output?: NodeJS.WriteStream

    // Optional UI defaults, still generic.
    promptStyle?: Style
    infoStyle?: Style
    mutedStyle?: Style

    // TerminalTui passthrough
    tui?: ConstructorParameters<typeof TerminalTui>[0]
}

export type AskLineOptions = {
    trim?: boolean
    allowEmpty?: boolean
    promptStyle?: Style
}

export type AskNonEmptyOptions = {
    trim?: boolean
    promptStyle?: Style
    // called when user submits empty input
    onEmpty?: () => void
}

export type AskChoiceOptions<T> = {
    // renders the menu or context before asking
    render?: () => void
    promptStyle?: Style
    // called on invalid choice
    onInvalid?: (raw: string) => void
    // optional guard to reject a parsed value
    accept?: (v: T) => boolean
}

export type SendWithUiOptions = {
    thinkingLabel?: string
    thinkingIntervalMs?: number
    thinkingStyle?: Style

    // Provide a retry line generator if you want theatre on retries.
    retryLine?: (info: RetryInfo) => MaybePromise<string | null | undefined>
    retryLineStyle?: Style

    // If you want full control over how retry lines are printed.
    onRetryLine?: (line: string, info: RetryInfo) => MaybePromise<void>

    // Forwarded to JSONConversation.send()
    send?: SendOptions
}

export class TerminalIo {
    public readonly ui: TerminalTui
    public readonly rl: readline.Interface

    private readonly promptStyle: Style
    private readonly infoStyle: Style
    private readonly mutedStyle: Style

    public constructor(opts: TerminalIoOptions = {}) {
        const input = opts.input ?? defaultInput
        const output = opts.output ?? defaultOutput

        this.ui = new TerminalTui({ input, output, ...(opts.tui ?? {}) })
        this.rl = readline.createInterface({ input, output })

        const S = this.ui.sgr
        this.promptStyle = opts.promptStyle ?? S.style(S.fg256(245))
        this.infoStyle = opts.infoStyle ?? S.style(S.italicOn, S.fg256(245))
        this.mutedStyle = opts.mutedStyle ?? S.style(S.fg256(240))
    }

    public close(): void {
        this.rl.close()
    }

    /* =========================
      Output primitives
    ========================= */

    public clearScreen(): void {
        this.ui.clearScreen()
    }

    public write(s: string): void {
        this.ui.write(s)
    }

    public line(s = ""): void {
        this.ui.line(s)
    }

    public centred(text: string, style?: Style): void {
        this.ui.centred(text, style)
    }

    public boxed(
        title: string | null,
        body: string,
        styles?: {
            borderStyle?: Style
            bodyStyle?: Style
            titleStyle?: Style
        }
    ): void {
        this.ui.boxed(title, body, styles)
    }

    public paint(text: string, style?: Style): string {
        return this.ui.paint(text, style)
    }

    public paintPrompt(text: string): string {
        return this.ui.paint(text, this.promptStyle)
    }

    public info(text: string): void {
        this.ui.centred(text, this.infoStyle)
    }

    public muted(text: string): void {
        this.ui.centred(text, this.mutedStyle)
    }

    /* =========================
      Input primitives
    ========================= */

    public async askLine(prompt: string, opts: AskLineOptions = {}): Promise<string> {
        const trim = opts.trim ?? true
        const allowEmpty = opts.allowEmpty ?? true
        const promptStyle = opts.promptStyle ?? this.promptStyle

        const raw = await this.rl.question(this.ui.paint(prompt, promptStyle))
        const out = trim ? raw.trim() : raw

        if (allowEmpty) return out
        if (out) return out

        return ""
    }

    public async askNonEmpty(prompt: string, opts: AskNonEmptyOptions = {}): Promise<string> {
        const trim = opts.trim ?? true
        const promptStyle = opts.promptStyle ?? this.promptStyle

        while (true) {
            const raw = await this.rl.question(this.ui.paint(prompt, promptStyle))
            const out = trim ? raw.trim() : raw
            if (out) return out

            if (opts.onEmpty) opts.onEmpty()
        }
    }

    public async askChoice<T>(
        prompt: string,
        parse: (raw: string) => T | null,
        opts: AskChoiceOptions<T> = {}
    ): Promise<T> {
        const promptStyle = opts.promptStyle ?? this.promptStyle

        while (true) {
            if (opts.render) opts.render()

            const raw = (await this.rl.question(this.ui.paint(prompt, promptStyle))).trim()
            const v = parse(raw)

            if (!v) {
                if (opts.onInvalid) opts.onInvalid(raw)
                continue
            }

            if (opts.accept && !opts.accept(v)) {
                if (opts.onInvalid) opts.onInvalid(raw)
                continue
            }

            return v
        }
    }

    public async waitForEnterOrTimeout(timeoutMs: number): Promise<void> {
        await this.ui.waitForEnterOrTimeout(timeoutMs)
    }

    /* =========================
      Generic “do work with spinner”
    ========================= */

    public withThinking<T>(
        label: string,
        fn: () => Promise<T>,
        opts: { intervalMs?: number; style?: Style } = {}
    ): Promise<T> {
        const stop = this.ui.startThinking(label, {
            intervalMs: opts.intervalMs,
            labelStyle: opts.style ?? this.infoStyle
        })

        const run = async (): Promise<T> => {
            try {
                return await fn()
            } finally {
                stop()
            }
        }

        return run()
    }

    /* =========================
      JSONConversation orchestration with terminal UX
    ========================= */

    public async sendWithUi<T extends object>(
        convo: JSONConversation<T>,
        role: "system" | "user",
        content: string,
        opts: SendWithUiOptions = {}
    ): Promise<T> {
        const thinkingLabel = opts.thinkingLabel
        const intervalMs = opts.thinkingIntervalMs ?? 300
        const thinkingStyle = opts.thinkingStyle ?? this.infoStyle

        const startThinking = (): (() => void) | null => {
            if (!thinkingLabel) return null
            return this.ui.startThinking(thinkingLabel, { intervalMs, labelStyle: thinkingStyle })
        }

        let stopThinking = startThinking()

        const stopSpinner = (): void => {
            if (!stopThinking) return
            stopThinking()
            stopThinking = null
        }

        const restartSpinner = (): void => {
            if (!thinkingLabel) return
            stopThinking = startThinking()
        }

        const externalOnRetry = opts.send?.onRetry

        const mergedSend: SendOptions = {
            ...(opts.send ?? {}),
            onRetry: async (info) => {
                stopSpinner()

                const line = opts.retryLine ? await opts.retryLine(info) : null
                const printable = typeof line === "string" ? line.trim() : ""

                if (printable) {
                    if (opts.onRetryLine) {
                        await opts.onRetryLine(printable, info)
                    } else {
                        this.ui.centred(printable, opts.retryLineStyle ?? this.infoStyle)
                    }
                }

                if (externalOnRetry) await externalOnRetry(info)
                restartSpinner()
            }
        }

        try {
            const out = await convo.send(role, content, mergedSend)
            stopSpinner()
            return out
        } catch (err) {
            stopSpinner()
            throw err
        }
    }
}