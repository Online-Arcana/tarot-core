import "dotenv/config";
import fs from "fs/promises";
import path from "path";

import { WebUi } from "./webUI";

type MenuKey =
    | "1" // colours
    | "2" // typography
    | "3" // boxes
    | "4" // input bar
    | "5" // spacing
    | "6" // presets
    | "7" // export
    | "0"; // exit

type ColourPreset = Readonly<{ label: string; value: string }>;

type ThemeState = Readonly<{
    // core
    fontFamily: string;
    bodyBg: string;
    bodyFg: string;

    // meta bar
    metaBg: string;
    metaBorder: string;

    // root
    rootBg: string;
    rootPaddingPx: number;

    // elements
    elemMarginPx: number;

    // boxes
    //boxBorder: string;
    boxBg: string;
    boxRadiusPx: number;
    boxPaddingYpx: number;
    boxPaddingXpx: number;
    boxTitleWeight: number;

    // input bar
    ioBg: string;
    ioBorder: string;
    ioPromptFg: string;

    inputBg: string;
    inputFg: string;
    inputBorder: string;
    inputRadiusPx: number;

    buttonBg: string;
    buttonFg: string;
    buttonBorder: string;
    buttonRadiusPx: number;
}>;

const CSS_STRUCTURE_PATH = path.resolve(process.cwd(), "cssStructure.css");

function clampInt(n: number, min: number, max: number): number {
    if (Number.isNaN(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function isHexColour(s: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

function normaliseHex(s: string): string {
    const v = s.trim();
    if (isHexColour(v)) return v.toLowerCase();
    return v;
}

function defaultTheme(): ThemeState {
    return {
        fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
        bodyBg: "#ffffff",
        bodyFg: "#111111",

        metaBg: "#ffffff",
        metaBorder: "rgba(0, 0, 0, 0.08)",

        rootBg: "#ffffff",
        rootPaddingPx: 16,

        elemMarginPx: 6,

        //boxBorder: "rgba(0, 0, 0, 0.18)",
        boxBg: "transparent",
        boxRadiusPx: 10,
        boxPaddingYpx: 10,
        boxPaddingXpx: 12,
        boxTitleWeight: 700,

        ioBg: "#ffffff",
        ioBorder: "rgba(0, 0, 0, 0.08)",
        ioPromptFg: "#111111",

        inputBg: "#ffffff",
        inputFg: "#111111",
        inputBorder: "rgba(0, 0, 0, 0.20)",
        inputRadiusPx: 10,

        buttonBg: "#f3f3f3",
        buttonFg: "#111111",
        buttonBorder: "rgba(0, 0, 0, 0.20)",
        buttonRadiusPx: 10
    };
}

async function readCssStructure(): Promise<string> {
    try {
        const raw = await fs.readFile(CSS_STRUCTURE_PATH, { encoding: "utf8" });
        return raw.replace(/\s+$/u, "") + "\n";
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read ${CSS_STRUCTURE_PATH}: ${msg}`);
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceToken(template: string, key: string, value: string): string {
    // Matches:
    //   {{KEY}}
    //   {{ KEY }}
    //   { { KEY } }
    //   with any whitespace/newlines between braces and token.
    const k = escapeRegExp(key);
    const re = new RegExp(`\\{\\s*\\{\\s*${k}\\s*\\}\\s*\\}`, "g");
    return template.replace(re, value);
}

function assertNoUnresolvedTokens(css: string): void {
    const re = /\{\s*\{\s*([A-Z0-9_]+)\s*\}\s*\}/gu;
    const unresolved = new Set<string>();

    let m: RegExpExecArray | null = null;
    while ((m = re.exec(css)) !== null) unresolved.add(m[1]);

    if (unresolved.size > 0) {
        const list = [...unresolved].sort().join(", ");
        throw new Error(`Unresolved CSS tokens in cssStructure.css: ${list}`);
    }
}

function renderCss(t: ThemeState, template: string): string {
    const replacements: Readonly<Record<string, string>> = {
        TUI_FONT: t.fontFamily,
        TUI_BODY_BG: t.bodyBg,
        TUI_BODY_FG: t.bodyFg,

        TUI_META_BG: t.metaBg,
        TUI_META_BORDER: t.metaBorder,

        TUI_ROOT_BG: t.rootBg,
        TUI_ROOT_PAD: String(t.rootPaddingPx),

        TUI_ELEM_MARGIN: String(t.elemMarginPx),

        //TUI_BOX_BORDER: t.boxBorder,
        TUI_BOX_BG: t.boxBg,
        TUI_BOX_RADIUS: String(t.boxRadiusPx),
        TUI_BOX_PAD_Y: String(t.boxPaddingYpx),
        TUI_BOX_PAD_X: String(t.boxPaddingXpx),
        TUI_BOX_TITLE_WEIGHT: String(t.boxTitleWeight),

        TUI_IO_BG: t.ioBg,
        TUI_IO_BORDER: t.ioBorder,
        TUI_IO_PROMPT_FG: t.ioPromptFg,

        TUI_INPUT_BG: t.inputBg,
        TUI_INPUT_FG: t.inputFg,
        TUI_INPUT_BORDER: t.inputBorder,
        TUI_INPUT_RADIUS: String(t.inputRadiusPx),

        TUI_BTN_BG: t.buttonBg,
        TUI_BTN_FG: t.buttonFg,
        TUI_BTN_BORDER: t.buttonBorder,
        TUI_BTN_RADIUS: String(t.buttonRadiusPx)
    };

    let out = template;

    for (const key of Object.keys(replacements)) {
        out = replaceToken(out, key, replacements[key]);
    }

    assertNoUnresolvedTokens(out);
    return out;
}

function themeSummary(t: ThemeState): string {
    const lines: string[] = [
        `fontFamily: ${t.fontFamily}`,
        `body: ${t.bodyBg} / ${t.bodyFg}`,
        `meta: bg ${t.metaBg}, border ${t.metaBorder}`,
        `root: bg ${t.rootBg}, padding ${t.rootPaddingPx}px`,
        `elemMargin: ${t.elemMarginPx}px`,
        //`box: border ${t.boxBorder}, bg ${t.boxBg}, radius ${t.boxRadiusPx}px, pad ${t.boxPaddingYpx}px ${t.boxPaddingXpx}px`,
        `box: border (locked), bg ${t.boxBg}, radius ${t.boxRadiusPx}px, pad ${t.boxPaddingYpx}px ${t.boxPaddingXpx}px`,
        `io: bg ${t.ioBg}, border ${t.ioBorder}`,
        `io prompt: ${t.ioPromptFg}`,
        `input: bg ${t.inputBg}, fg ${t.inputFg}, border ${t.inputBorder}, radius ${t.inputRadiusPx}px`,
        `button: bg ${t.buttonBg}, fg ${t.buttonFg}, border ${t.buttonBorder}, radius ${t.buttonRadiusPx}px`
    ];
    return lines.join("\n");
}

function presets(): Readonly<Record<string, ThemeState>> {
    const light = defaultTheme();

    const dark: ThemeState = {
        ...light,
        bodyBg: "#0b0e12",
        bodyFg: "#e9e9ea",
        metaBg: "#0b0e12",
        metaBorder: "rgba(255, 255, 255, 0.10)",
        rootBg: "#0b0e12",
        //  boxBorder: "rgba(255, 255, 255, 0.18)",
        boxBg: "rgba(255, 255, 255, 0.03)",
        ioBg: "#0b0e12",
        ioBorder: "rgba(255, 255, 255, 0.10)",
        ioPromptFg: "#111111",
        inputBg: "rgba(255, 255, 255, 0.06)",
        inputFg: "#e9e9ea",
        inputBorder: "rgba(255, 255, 255, 0.18)",
        buttonBg: "rgba(255, 255, 255, 0.10)",
        buttonFg: "#e9e9ea",
        buttonBorder: "rgba(255, 255, 255, 0.18)"
    };

    const nord: ThemeState = {
        ...dark,
        bodyBg: "#2e3440",
        bodyFg: "#eceff4",
        metaBg: "#2e3440",
        rootBg: "#2e3440",
        //boxBorder: "rgba(236, 239, 244, 0.18)",
        boxBg: "rgba(236, 239, 244, 0.05)",
        inputBg: "rgba(236, 239, 244, 0.08)",
        buttonBg: "rgba(236, 239, 244, 0.10)"
    };

    return {
        light,
        dark,
        nord
    };
}

class UiStyler {
    private theme: ThemeState = defaultTheme();
    private dirty = false;

    private cssTemplate = "";

    public constructor(private readonly io: WebUi) { }

    public async run(): Promise<void> {
        await this.io.ready;

        this.cssTemplate = await readCssStructure();
        this.applyCss();

        while (true) {
            this.renderScreen();

            const optRaw = await this.io.askLine("> ", { trim: true, allowEmpty: true });
            const opt = (optRaw || "").trim() as MenuKey;

            if (!opt) continue;

            switch (opt) {
                case "1":
                    await this.menuColours();
                    break;
                case "2":
                    await this.menuTypography();
                    break;
                case "3":
                    await this.menuBoxes();
                    break;
                case "4":
                    await this.menuInputBar();
                    break;
                case "5":
                    await this.menuSpacing();
                    break;
                case "6":
                    await this.menuPresets();
                    break;
                case "7":
                    await this.exportCss();
                    break;
                case "0":
                    this.io.close();
                    return;
                default:
                    break;
            }
        }
    }

    private applyCss(): void {
        this.io.setCss(renderCss(this.theme, this.cssTemplate));
        this.io.setMeta("dirty", this.dirty ? "1" : "0");
    }

    private renderScreen(): void {
        const ui = this.io.ui;
        const S = ui.sgr;

        const STYLE_TITLE = S.style(S.boldOn, S.fg256(81));
        const STYLE_MUTED = S.style(S.italicOn, S.fg256(245));

        this.io.clearScreen();

        this.io.centred("WebUI CSS Generator", STYLE_TITLE);
        this.io.centred("Adjust settings, watch the page update live, then export styles.css", STYLE_MUTED);
        this.io.line();

        this.io.boxed("Current theme", themeSummary(this.theme), {
            borderStyle: S.style(S.fg256(245)),
            titleStyle: S.style(S.boldOn, S.fg256(245)),
            bodyStyle: S.style()
        });

        this.io.line();
        this.preview();
        this.io.line();

        this.io.line([
            "Menu",
            "1. Colours",
            "2. Typography",
            "3. Boxes",
            "4. Input bar",
            "5. Spacing",
            "6. Presets",
            "7. Export styles.css",
            "0. Exit"
        ].join("\n"));
    }

    private preview(): void {
        const ui = this.io.ui;
        const S = ui.sgr;

        this.io.centred("Preview", S.style(S.boldOn, S.fg256(220)));
        this.io.line();

        this.io.line("This is a normal line element.");
        this.io.centred("This is a centred element.", S.style(S.italicOn, S.fg256(245)));

        this.io.boxed(
            "Box title",
            [
                "This is a boxed element.",
                "It should reflect border, padding, radius, background, and font choices."
            ].join("\n"),
            {
                borderStyle: S.style(S.fg256(141)),
                titleStyle: S.style(S.boldOn, S.fg256(141)),
                bodyStyle: S.style()
            }
        );

        this.io.line();
        this.io.centred("Try editing input styles and look at the bottom bar.", S.style(S.fg256(245)));
    }

    private async menuColours(): Promise<void> {
        const presetsList: readonly ColourPreset[] = [
            { label: "White", value: "#ffffff" },
            { label: "Near black", value: "#0b0e12" },
            { label: "Slate", value: "#2e3440" },
            { label: "Soft grey", value: "#f4f4f5" },
            { label: "Ink", value: "#111111" }
        ];

        const bodyBg = await this.chooseColour("Body background", this.theme.bodyBg, presetsList);
        const bodyFg = await this.chooseColour("Body text colour", this.theme.bodyFg, presetsList);
        const rootBg = await this.chooseColour("Root background (#tui-root)", this.theme.rootBg, presetsList);

        this.theme = { ...this.theme, bodyBg, bodyFg, rootBg };
        this.dirty = true;
        this.applyCss();
    }

    private async menuTypography(): Promise<void> {
        this.io.line();
        this.io.line("Font family options:");
        this.io.line("1. System mono (default)");
        this.io.line('2. "JetBrains Mono", ui-monospace, monospace');
        this.io.line('3. "Fira Code", ui-monospace, monospace');
        this.io.line("4. Custom (paste your own font-family value)");
        this.io.line("0. Back");

        const opt = (await this.io.askLine("> ", { trim: true, allowEmpty: true })).trim();
        if (!opt || opt === "0") return;

        const next =
            opt === "1"
                ? defaultTheme().fontFamily
                : opt === "2"
                    ? `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
                    : opt === "3"
                        ? `"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
                        : opt === "4"
                            ? (await this.io.askLine("Paste font-family value\n> ", { trim: true, allowEmpty: true })).trim()
                            : "";

        if (!next) return;

        this.theme = { ...this.theme, fontFamily: next };
        this.dirty = true;
        this.applyCss();
    }

    private async menuBoxes(): Promise<void> {
        const presetsList: readonly ColourPreset[] = [
            { label: "Transparent", value: "transparent" },
            { label: "Soft white overlay", value: "rgba(255, 255, 255, 0.04)" },
            { label: "Soft black overlay", value: "rgba(0, 0, 0, 0.04)" },
            { label: "Light border", value: "rgba(0, 0, 0, 0.18)" },
            { label: "Dark border", value: "rgba(255, 255, 255, 0.18)" }
        ];

        //const boxBorder = await this.chooseColour("Box border colour", this.theme.boxBorder, presetsList);
        const boxBg = await this.chooseColour("Box background", this.theme.boxBg, presetsList);

        const radius = await this.chooseNumber("Box radius (px)", this.theme.boxRadiusPx, 0, 30);
        const padY = await this.chooseNumber("Box padding Y (px)", this.theme.boxPaddingYpx, 0, 40);
        const padX = await this.chooseNumber("Box padding X (px)", this.theme.boxPaddingXpx, 0, 60);

        const titleWeight = await this.chooseNumber("Box title weight (400..900)", this.theme.boxTitleWeight, 400, 900);

        this.theme = {
            ...this.theme,
            //boxBorder,
            boxBg,
            boxRadiusPx: radius,
            boxPaddingYpx: padY,
            boxPaddingXpx: padX,
            boxTitleWeight: titleWeight
        };

        this.dirty = true;
        this.applyCss();
    }

    private async menuInputBar(): Promise<void> {
        const presetsList: readonly ColourPreset[] = [
            { label: "White", value: "#ffffff" },
            { label: "Near black", value: "#0b0e12" },
            { label: "Soft white overlay", value: "rgba(255, 255, 255, 0.06)" },
            { label: "Soft black overlay", value: "rgba(0, 0, 0, 0.06)" },
            { label: "Light border", value: "rgba(0, 0, 0, 0.20)" },
            { label: "Dark border", value: "rgba(255, 255, 255, 0.18)" }
        ];

        const ioBg = await this.chooseColour("Input bar background (#tui-io)", this.theme.ioBg, presetsList);
        const ioBorder = await this.chooseColour("Input bar border", this.theme.ioBorder, presetsList);
        const ioPromptFg = await this.chooseColour("Input bar prompt text colour (#tui-prompt)", this.theme.ioPromptFg, presetsList);

        const inputBg = await this.chooseColour("Input background", this.theme.inputBg, presetsList);
        const inputFg = await this.chooseColour("Input text colour", this.theme.inputFg, presetsList);
        const inputBorder = await this.chooseColour("Input border", this.theme.inputBorder, presetsList);
        const inputRadius = await this.chooseNumber("Input radius (px)", this.theme.inputRadiusPx, 0, 30);

        const buttonBg = await this.chooseColour("Button background", this.theme.buttonBg, presetsList);
        const buttonFg = await this.chooseColour("Button text colour", this.theme.buttonFg, presetsList);
        const buttonBorder = await this.chooseColour("Button border", this.theme.buttonBorder, presetsList);
        const buttonRadius = await this.chooseNumber("Button radius (px)", this.theme.buttonRadiusPx, 0, 30);

        this.theme = {
            ...this.theme,
            ioBg,
            ioBorder,
            inputBg,
            inputFg,
            ioPromptFg,
            inputBorder,
            inputRadiusPx: inputRadius,
            buttonBg,
            buttonFg,
            buttonBorder,
            buttonRadiusPx: buttonRadius
        };

        this.dirty = true;
        this.applyCss();
    }

    private async menuSpacing(): Promise<void> {
        const rootPadding = await this.chooseNumber("Root padding (px)", this.theme.rootPaddingPx, 0, 80);
        const elemMargin = await this.chooseNumber("Element vertical margin (px)", this.theme.elemMarginPx, 0, 30);

        this.theme = { ...this.theme, rootPaddingPx: rootPadding, elemMarginPx: elemMargin };
        this.dirty = true;
        this.applyCss();
    }

    private async menuPresets(): Promise<void> {
        const p = presets();

        this.io.line();
        this.io.line("Presets:");
        this.io.line("1. Light");
        this.io.line("2. Dark");
        this.io.line("3. Nord");
        this.io.line("0. Back");

        const opt = (await this.io.askLine("> ", { trim: true, allowEmpty: true })).trim();
        if (!opt || opt === "0") return;

        const next =
            opt === "1" ? p.light :
                opt === "2" ? p.dark :
                    opt === "3" ? p.nord :
                        null;

        if (!next) return;

        this.theme = next;
        this.dirty = true;
        this.applyCss();
    }

    private async exportCss(): Promise<void> {
        const suggested = path.resolve(process.cwd(), "styles.css");
        const raw = await this.io.askLine(`Output path (default: ${suggested})\n> `, { trim: true, allowEmpty: true });
        const outPath = raw.trim() ? path.resolve(process.cwd(), raw.trim()) : suggested;

        const css = renderCss(this.theme, this.cssTemplate);

        await fs.writeFile(outPath, css, { encoding: "utf8" });

        this.dirty = false;
        this.applyCss();

        this.io.line();
        this.io.boxed("Saved", `Wrote ${outPath}`, { bodyStyle: this.io.ui.sgr.style() });
        this.io.line();
    }

    private async chooseNumber(label: string, current: number, min: number, max: number): Promise<number> {
        this.io.line();
        const raw = await this.io.askLine(`${label} [${min}..${max}] (current: ${current})\n> `, { trim: true, allowEmpty: true });
        if (!raw.trim()) return current;

        const parsed = Number.parseInt(raw.trim(), 10);
        return clampInt(parsed, min, max);
    }

    private async chooseColour(label: string, current: string, list: readonly ColourPreset[]): Promise<string> {
        this.io.line();
        this.io.line(`${label} (current: ${current})`);
        this.io.line("Choose:");
        for (let i = 0; i < list.length; i += 1) {
            const idx = i + 1;
            this.io.line(`${idx}. ${list[i].label} (${list[i].value})`);
        }
        this.io.line("H. Enter hex (e.g. #112233) or raw CSS colour (e.g. rgba(...))");
        this.io.line("0. Keep current");

        const raw = (await this.io.askLine("> ", { trim: true, allowEmpty: true })).trim();
        if (!raw || raw === "0") return current;

        const upper = raw.toUpperCase();
        if (upper === "H") {
            const v = (await this.io.askLine("Enter colour\n> ", { trim: true, allowEmpty: true })).trim();
            if (!v) return current;

            const v2 = normaliseHex(v);
            if (isHexColour(v2)) return v2;
            return v2;
        }

        const idx = Number.parseInt(raw, 10);
        if (Number.isNaN(idx)) return current;

        const at = idx - 1;
        if (at < 0 || at >= list.length) return current;

        return list[at].value;
    }
}

/* =========================
   Bootstrap
========================= */

function readPort(): number | undefined {
    const env = process.env.WEBUI_STYLER_PORT;
    if (!env) return undefined;

    const n = Number.parseInt(env, 10);
    return Number.isNaN(n) ? undefined : n;
}

async function main(): Promise<void> {
    const io = new WebUi({
        port: readPort(),
        title: "WebUI CSS Generator",
        logUrl: true
    });

    const app = new UiStyler(io);
    await app.run();
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
});