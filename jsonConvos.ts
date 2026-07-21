import OpenAI from "openai/index.js";

type ToolFn = (params: { [key: string]: unknown }) => Promise<unknown> | unknown;

export type schemaDef = Record<string, unknown>;

export type toolDef = {
  name: string
  description: string
  parameters: schemaDef
  handler: string | ToolFn
}

type RetryInfo = {
  attempt: number
  maxAttempts: number
  rawText: string
  parseError: string
}

export type SendOptions = {
  signal?: AbortSignal
  retries?: number
  retryDelayMs?: number
  onRetry?: (info: RetryInfo) => void | Promise<void>
  model?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function readString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key]
  return typeof v === "string" ? v : null
}

function extractOutputText(resp: unknown): string | null {
  if (!isRecord(resp)) return null

  // Node SDK Responses API suele exponer output_text
  const outputText = readString(resp, "output_text")
  if (outputText) return outputText

  // Fallback: output[0].content[0].text
  const output = resp["output"]
  if (!Array.isArray(output) || output.length < 1) return null

  const first = output[0]
  if (!isRecord(first)) return null

  const content = first["content"]
  if (!Array.isArray(content) || content.length < 1) return null

  const c0 = content[0]
  if (!isRecord(c0)) return null

  const text = c0["text"]
  return typeof text === "string" ? text : null
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export class StructuredOutputParseError extends Error {
  public readonly rawText: string
  public readonly attempts: number

  constructor(message: string, rawText: string, attempts: number) {
    super(message)
    this.name = "StructuredOutputParseError"
    this.rawText = rawText
    this.attempts = attempts
  }
}

export class JSONConversation<T extends object> {
  private readonly apiKey: string
  private readonly client: OpenAI
  private model: string
  private schema: schemaDef
  private temperature: number
  private maxOutputTokens: number
  private conversationId?: string
  private tools: Record<string, toolDef> = {}

  private lockTail: Promise<void> = Promise.resolve()
  private busyCount = 0
  private pendingCount = 0

  constructor(
    apiKey: string,
    schema: schemaDef,
    conversationId?: string,
    options?: {
      model?: string
      temperature?: number
      maxOutputTokens?: number
    }
  ) {
    this.apiKey = apiKey
    this.client = new OpenAI({ apiKey })
    this.schema = schema
    this.model = options?.model ?? "gpt-4.1"
    this.temperature = options?.temperature ?? 0.7
    this.maxOutputTokens = options?.maxOutputTokens ?? 512
    this.conversationId = conversationId
  }

  public get key(): string {
    return this.apiKey
  }

  async updateSchema(newSchema: schemaDef): Promise<void> {
    await this.enqueue(async () => {
      this.schema = newSchema
    })
  }

  async registerTool(tool: {
    name: string
    description: string
    parameters: schemaDef
    handler: ToolFn
  }): Promise<void> {
    await this.enqueue(async () => {
      const { name, description, parameters, handler } = tool
      this.tools[name] = { name, description, parameters, handler }
    })
  }

  get registeredTools(): Record<string, toolDef> {
    return this.tools
  }

  private enqueue<R>(fn: () => Promise<R>): Promise<R> {
    this.pendingCount += 1

    const run = async (): Promise<R> => {
      this.busyCount += 1
      try {
        return await fn()
      } finally {
        this.busyCount -= 1
        this.pendingCount -= 1
      }
    }

    const start = this.lockTail.catch(() => undefined)
    const p = start.then(run)

    // Ensure the queue continues even if this task rejects
    this.lockTail = p.then(
      () => undefined,
      () => undefined
    )

    return p
  }

  private enqueueVoid(fn: () => void): void {
    void this.enqueue(async () => {
      fn()
      return undefined
    }).catch(() => undefined)
  }

  private async initConversation(): Promise<void> {
    if (!this.conversationId) {
      const conv = await this.client.conversations.create()
      this.conversationId = conv.id
    }
  }

  async send(role: "system" | "user", content: string, opts?: SendOptions): Promise<T> {
    return this.enqueue(async () => {
      await this.initConversation()
      const conversationId = this.conversationId!

      const retries = Math.max(0, opts?.retries ?? 0)
      const maxAttempts = 1 + retries
      const retryDelayMs = Math.max(0, opts?.retryDelayMs ?? 450)

      const retrySuffix =
        "\n\nIMPORTANT: You must return a single json object that has the spected schema shape and nothing else."

      let lastRaw = ""
      let lastErr = ""

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const userContent = attempt === 1 ? content : (content + retrySuffix)

        try {
          const response = await (this.client.responses as OpenAI["responses"]).create({
            model: opts?.model ?? this.model,
            input: [{ role, content: userContent }],
            temperature: this.temperature,
            max_output_tokens: this.maxOutputTokens,
            text: {
              format: {
                type: "json_schema",
                name: "DynamicSchema",
                schema: this.schema,
                strict: true
              }
            },
            conversation: { id: conversationId }
          }, {
            signal: opts?.signal
          })

          const outputText = extractOutputText(response as unknown)
          const raw = outputText ?? ""
          lastRaw = raw

          try {
            return JSON.parse(raw) as T
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "unknown parse error"
            lastErr = msg

            if (attempt < maxAttempts) {
              if (opts?.onRetry) {
                await opts.onRetry({
                  attempt,
                  maxAttempts,
                  rawText: raw,
                  parseError: msg
                })
              }
              await sleep(retryDelayMs + (attempt - 1) * 250)
              continue
            }

            throw new StructuredOutputParseError(
              `Could not parse the expected output after ${maxAttempts} tries`,
              raw,
              maxAttempts
            )
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "APIUserAbortError") {
            return { bot_response: "⏹️ Request cancelled." } as unknown as T
          }
          throw err
        }
      }

      throw new StructuredOutputParseError(
        `${lastErr}`,
        lastRaw,
        1 + retries
      )
    });
  }

  get id(): string | undefined {
    return this.conversationId
  }

  get isBusy(): boolean {
    return this.busyCount > 0
  }

  get queued(): number {
    return this.pendingCount
  }

}