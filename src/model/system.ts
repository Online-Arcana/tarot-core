/**
 * @deprecated Compatibility-only language hint.
 *
 * Runtime model generation is authored by model/prompt.ts, which has the request,
 * reader identity and mapped-medium context required to build a correct prompt.
 * This legacy helper deliberately contains no reader, tarot or medium instructions so
 * callers cannot accidentally bypass the current prompt architecture with contradictory
 * mapped-reader guidance.
 */
export function systemPrompt(code: string): string {
  return code.toLowerCase().startsWith("es")
    ? "Escribe el contenido visible en español natural de España. Las instrucciones específicas de tarea, voz, identidad y medio deben proceder del constructor de prompts del core."
    : "Write visible content in natural British English. Task, voice, identity and medium instructions must come from the core prompt builder.";
}
