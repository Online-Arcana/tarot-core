/* webClient.js */
/* eslint-disable no-let, no-undef */
"use strict";

class TarotWebClient {
    constructor() {
        this.CHAT_ID_KEY = "tarotChatId";
        this.SESSION_KEY = "tarotSessionToken";

        this.PARAM_CHAT_ID = "chatId";
        this.PARAM_SESSION = "sessionToken";

        this.SESSION_TOKEN_URL = "https://srv.kittycrypto.gg/session-token";

        // Private state
        this.__tokenPromise = null;
        this.__origFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
        this.__NativeEventSource = window.EventSource;

        // Bind handlers once
        this.__onKeyDownBound = this.__onKeyDown.bind(this);
        this.__onClickBound = this.__onClick.bind(this);
    }

    init() {
        // Keep compatibility with your current setup
        window.fetchSessionToken = this.fetchSessionToken.bind(this);

        this.__patchFetch();
        this.__patchEventSource();
        this.__installAiPlaceholderHelpers();

        // Kick off token retrieval as early as possible.
        // This ensures the first EventSource created by the page can be deferred and then succeed.
        void this.ensureSessionToken();
    }

    /* =========================
       Storage + normalisation
    ========================= */

    safeGet(key) {
        try {
            return (localStorage.getItem(key) || "").trim();
        } catch {
            return "";
        }
    }

    safeSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* ignore */
        }
    }

    safeRemove(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    }

    normalise(raw) {
        return (raw || "").toString().trim();
    }

    /* =========================
       Shared DOM retry helper
    ========================= */

    __applyWithRetry(applyFn, opts) {
        const cfg = opts || {};
        const maxTries = Number.isFinite(cfg.maxTries) ? Math.max(1, cfg.maxTries) : 20;
        const tickMs = Number.isFinite(cfg.tickMs) ? Math.max(0, cfg.tickMs) : 50;
        const readyEvent = (cfg.readyEvent || "DOMContentLoaded").toString();

        const runNowOrRetry = () => {
            try {
                if (applyFn()) return;
            } catch {
                // treat as "not yet"
            }

            let tries = 0;
            const timer = window.setInterval(() => {
                tries += 1;
                let ok = false;

                try {
                    ok = Boolean(applyFn());
                } catch {
                    ok = false;
                }

                if (ok || tries >= maxTries) window.clearInterval(timer);
            }, tickMs);
        };

        if (document.readyState === "loading") {
            document.addEventListener(readyEvent, () => { runNowOrRetry(); }, { once: true });
            return;
        }

        runNowOrRetry();
    }

    /* =========================
       URL patching
    ========================= */

    __isAbsoluteUrlString(s) {
        return typeof s === "string" && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
    }

    __isSchemeRelativeUrlString(s) {
        return typeof s === "string" && s.startsWith("//");
    }

    __sameOrigin(u) {
        try {
            return u.origin === window.location.origin;
        } catch {
            return false;
        }
    }

    __isTarotEndpointPath(pathname) {
        if (typeof pathname !== "string") return false;
        return pathname.endsWith("/events") || pathname.endsWith("/input");
    }

    patchUrl(urlStr) {
        if (typeof urlStr !== "string" || !urlStr) return urlStr;

        let u;
        try {
            u = new URL(urlStr, window.location.href);
        } catch {
            return urlStr;
        }

        // Only patch same-origin URLs. Never touch other domains.
        if (!this.__sameOrigin(u)) return urlStr;

        // Only patch Tarot endpoints, regardless of reverse proxy prefix.
        if (!this.__isTarotEndpointPath(u.pathname)) return urlStr;

        const chatId = this.normalise(this.safeGet(this.CHAT_ID_KEY));
        const sessionToken = this.normalise(this.safeGet(this.SESSION_KEY));

        if (chatId && !this.normalise(u.searchParams.get(this.PARAM_CHAT_ID))) {
            u.searchParams.set(this.PARAM_CHAT_ID, chatId);
        }
        if (sessionToken && !this.normalise(u.searchParams.get(this.PARAM_SESSION))) {
            u.searchParams.set(this.PARAM_SESSION, sessionToken);
        }

        // Preserve absolute form if the caller provided an absolute URL.
        const wasAbsolute = this.__isAbsoluteUrlString(urlStr) || this.__isSchemeRelativeUrlString(urlStr);
        return wasAbsolute ? u.toString() : (u.pathname + u.search);
    }

    /* =========================
       SSE payload helpers
    ========================= */

    __parseSseJson(data) {
        if (typeof data !== "string" || !data) return null;
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    __handleMetaEvent(evt) {
        if (!evt || evt.t !== "meta") return;

        const key = (evt.key || "").toString();
        const value = (evt.value || "").toString();

        if (key === "cleared") {
            this.safeRemove(this.CHAT_ID_KEY);
            return;
        }

        if (key === "chatId") {
            const id = this.normalise(value);
            if (id) this.safeSet(this.CHAT_ID_KEY, id);
        }
    }

    __setAiPlaceholderMeta(el, generated, placeholder) {
        try {
            if (!el || !el.dataset) return;

            if (generated) {
                el.dataset.tuiAiPlaceholder = "1";
                el.dataset.tuiAiPlaceholderText = (placeholder || "").toString();
                return;
            }

            delete el.dataset.tuiAiPlaceholder;
            delete el.dataset.tuiAiPlaceholderText;
        } catch {
            /* ignore */
        }
    }

    __handleInputPlaceholderEvent(evt) {
        if (!evt || evt.t !== "input_placeholder") return;

        const id = (evt.id || "").toString().trim();
        if (!id) return;

        const placeholder = (evt.placeholder || "").toString();
        const inputType = (evt.inputType || "text").toString().trim() || "text";
        const generated = Boolean(evt.generated);

        this.__applyWithRetry(() => {
            const el = document.getElementById(id);
            if (!el) return false;

            const tag = (el.tagName || "").toString().toLowerCase();

            // input
            if (tag === "input") {
                try { el.type = inputType; } catch { /* ignore invalid types */ }
                try { el.placeholder = placeholder; } catch { /* ignore */ }
                this.__setAiPlaceholderMeta(el, generated, placeholder);
                return true;
            }

            // textarea
            if (tag === "textarea") {
                try { el.placeholder = placeholder; } catch { /* ignore */ }
                this.__setAiPlaceholderMeta(el, generated, placeholder);
                return true;
            }

            // other elements: set attribute as a last resort
            try { el.setAttribute("placeholder", placeholder); } catch { /* ignore */ }
            this.__setAiPlaceholderMeta(el, generated, placeholder);
            return true;
        }, { maxTries: 20, tickMs: 50 });
    }

    __handleDomDisabledEvent(evt) {
        if (!evt || evt.t !== "dom_disabled") return;

        const id = (evt.id || "").toString().trim();
        if (!id) return;

        const disabled = Boolean(evt.disabled);

        this.__applyWithRetry(() => {
            const el = document.getElementById(id);
            if (!el) return false;

            // Prefer property when available.
            if ("disabled" in el) {
                try { el.disabled = disabled; } catch { /* ignore */ }
                return true;
            }

            // Fallback attribute.
            try {
                if (disabled) el.setAttribute("disabled", "disabled");
                else el.removeAttribute("disabled");
            } catch { /* ignore */ }

            return true;
        }, { maxTries: 20, tickMs: 50 });
    }

    /* =========================
       Session token retrieval
    ========================= */

    async fetchSessionToken() {
        const existing = this.normalise(this.safeGet(this.SESSION_KEY));
        if (existing) {
            window.sessionToken = existing;
            return existing;
        }

        const fetchFn = this.__origFetch || (typeof window.fetch === "function" ? window.fetch.bind(window) : null);
        if (!fetchFn) return "";

        try {
            const url = this.SESSION_TOKEN_URL + "?t=" + Date.now().toString(10);

            const response = await fetchFn(url, {
                method: "GET",
                cache: "no-store",
                headers: { "cache-control": "no-store" }
            });

            if (!response.ok) throw new Error("Failed to fetch session token: " + response.status);

            const data = await response.json();
            const token =
                data && typeof data === "object" && typeof data.sessionToken === "string"
                    ? this.normalise(data.sessionToken)
                    : "";

            if (!token) throw new Error("Invalid session token response");

            this.safeSet(this.SESSION_KEY, token);
            window.sessionToken = token;

            return token;
        } catch (err) {
            try { console.error("Error fetching session token:", err); } catch { /* ignore */ }
            return "";
        }
    }

    ensureSessionToken() {
        if (this.__tokenPromise) return this.__tokenPromise;

        this.__tokenPromise = this.fetchSessionToken()
            .catch(() => "")
            .then(t => this.normalise(t));

        return this.__tokenPromise;
    }

    /* =========================
       Patching fetch
    ========================= */

    __patchFetch() {
        if (typeof window.fetch !== "function") return;

        const origFetch = this.__origFetch || window.fetch.bind(window);
        this.__origFetch = origFetch;

        const self = this;

        window.fetch = function (input, init) {
            if (typeof input === "string") {
                return origFetch(self.patchUrl(input), init);
            }

            if (input && typeof input === "object" && typeof input.url === "string") {
                const nextUrl = self.patchUrl(input.url);
                if (nextUrl === input.url) return origFetch(input, init);

                const nextReq = new Request(nextUrl, input);
                return origFetch(nextReq, init);
            }

            return origFetch(input, init);
        };
    }

    /* =========================
       Patching EventSource
    ========================= */

    __patchEventSource() {
        const NativeEventSource = this.__NativeEventSource;
        if (typeof NativeEventSource !== "function") return;

        const self = this;

        class WrappedEventSource {
            constructor(url, config) {
                this.onopen = null;
                this.onmessage = null;
                this.onerror = null;

                this.readyState = WrappedEventSource.CONNECTING;
                this.url = "";
                this.withCredentials = Boolean(config && config.withCredentials);

                this.__rawUrl = String(url || "");
                this.__config = config;
                this.__native = null;
                this.__closed = false;

                this.__listeners = {
                    open: new Set(),
                    message: new Set(),
                    error: new Set()
                };

                // Mark that something attempted to start a stream.
                window.__tarot_has_eventsource = true;

                const hasTokenNow = Boolean(self.normalise(self.safeGet(self.SESSION_KEY)));
                const hasChatNow = Boolean(self.normalise(self.safeGet(self.CHAT_ID_KEY)));

                if (hasTokenNow || hasChatNow) {
                    this.__connect();
                    return;
                }

                void self.ensureSessionToken().then((t) => {
                    if (this.__closed) return;

                    if (!t && !self.normalise(self.safeGet(self.CHAT_ID_KEY))) {
                        try { console.error("No sessionToken available, cannot open /events"); } catch { /* ignore */ }
                        this.readyState = WrappedEventSource.CLOSED;
                        return;
                    }

                    this.__connect();
                });
            }

            __connect() {
                if (this.__closed) return;

                const patched = self.patchUrl(this.__rawUrl);
                this.url = patched;

                try {
                    this.__native = new NativeEventSource(patched, this.__config);
                } catch (err) {
                    try { console.error("EventSource failed to construct:", err); } catch { /* ignore */ }
                    this.readyState = WrappedEventSource.CLOSED;
                    return;
                }

                const dispatch = (type, ev) => {
                    // Track readyState if possible
                    try {
                        if (this.__native && typeof this.__native.readyState === "number") {
                            this.readyState = this.__native.readyState;
                        }
                    } catch {
                        /* ignore */
                    }

                    // Meta capture from the main stream
                    if (type === "message") {
                        const payload = ev && typeof ev.data === "string" ? self.__parseSseJson(ev.data) : null;
                        if (!payload) return;

                        self.__handleMetaEvent(payload);
                        self.__handleInputPlaceholderEvent(payload);
                        self.__handleDomDisabledEvent(payload);
                    }

                    const propHandler =
                        type === "open" ? this.onopen :
                            type === "message" ? this.onmessage :
                                type === "error" ? this.onerror :
                                    null;

                    if (typeof propHandler === "function") {
                        try { propHandler.call(this, ev); } catch { /* ignore */ }
                    }

                    const set = this.__listeners[type];
                    if (set && set.size) {
                        for (const fn of set) {
                            try { fn.call(this, ev); } catch { /* ignore */ }
                        }
                    }
                };

                this.__native.onopen = (ev) => { dispatch("open", ev); };
                this.__native.onmessage = (ev) => { dispatch("message", ev); };
                this.__native.onerror = (ev) => { dispatch("error", ev); };
            }

            addEventListener(type, listener) {
                const t = String(type || "");
                if (!t) return;

                const fn = listener;
                if (typeof fn !== "function") return;

                const set = this.__listeners[t];
                if (!set) return;

                set.add(fn);
            }

            removeEventListener(type, listener) {
                const t = String(type || "");
                if (!t) return;

                const fn = listener;
                if (typeof fn !== "function") return;

                const set = this.__listeners[t];
                if (!set) return;

                set.delete(fn);
            }

            close() {
                this.__closed = true;
                this.readyState = WrappedEventSource.CLOSED;

                if (this.__native && typeof this.__native.close === "function") {
                    try { this.__native.close(); } catch { /* ignore */ }
                }

                this.__native = null;
            }
        }

        WrappedEventSource.CONNECTING = 0;
        WrappedEventSource.OPEN = 1;
        WrappedEventSource.CLOSED = 2;

        window.EventSource = WrappedEventSource;
    }

    /* =========================
       AI placeholder UX helpers
    ========================= */

    __installAiPlaceholderHelpers() {
        // TAB: accept AI placeholder into value
        // ENTER: if empty and AI placeholder exists, send placeholder as if typed
        // CLICK send: if empty and AI placeholder exists, send placeholder as if typed
        document.addEventListener("keydown", this.__onKeyDownBound, true);
        document.addEventListener("click", this.__onClickBound, true);
    }

    __getEl(id) {
        const key = (id || "").toString().trim();
        if (!key) return null;
        try {
            return document.getElementById(key);
        } catch {
            return null;
        }
    }

    __isEnabledInput(el) {
        if (!el) return false;
        if (el.disabled) return false;
        if (el.readOnly) return false;
        return true;
    }

    __getAiPlaceholderText(el) {
        try {
            if (!el || !el.dataset) return "";
            if (el.dataset.tuiAiPlaceholder !== "1") return "";
            return (el.dataset.tuiAiPlaceholderText || "").toString().trim();
        } catch {
            return "";
        }
    }

    __applyPlaceholderToValue(el, text) {
        try {
            el.value = text;

            // Fire an input event so any listeners update their state.
            try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch { /* ignore */ }

            // Put caret at end.
            try {
                const n = el.value.length;
                if (typeof el.setSelectionRange === "function") el.setSelectionRange(n, n);
            } catch { /* ignore */ }
        } catch {
            /* ignore */
        }
    }

    __autofillIfAiPlaceholderEmpty() {
        const input = this.__getEl("tui-input");
        if (!input) return false;

        if (!this.__isEnabledInput(input)) return false;

        const aiText = this.__getAiPlaceholderText(input);
        if (!aiText) return false;

        const current = (input.value || "").toString();
        if (current.trim().length !== 0) return false;

        this.__applyPlaceholderToValue(input, aiText);
        return true;
    }

    __onKeyDown(ev) {
        const e = ev || window.event;
        if (!e) return;

        const key = e.key;
        if (key !== "Tab" && key !== "Enter") return;

        const input = this.__getEl("tui-input");
        if (!input) return;

        // Must be focused for keyboard behaviour.
        if (document.activeElement !== input) return;

        if (!this.__isEnabledInput(input)) return;

        const aiText = this.__getAiPlaceholderText(input);
        if (!aiText) return;

        const current = (input.value || "").toString();
        const empty = current.trim().length === 0;

        // TAB accepts placeholder
        if (key === "Tab") {
            if (e.shiftKey) return;
            if (!empty) return;

            try { e.preventDefault(); } catch { /* ignore */ }
            this.__applyPlaceholderToValue(input, aiText);
            return;
        }

        // ENTER sends placeholder when input is empty by first copying it into value.
        if (key === "Enter") {
            if (!empty) return;
            this.__applyPlaceholderToValue(input, aiText);
            // Do not preventDefault; allow existing submit/send logic to run.
        }
    }

    __onClick(ev) {
        const e = ev || window.event;
        if (!e) return;

        const send = this.__getEl("tui-send");
        if (!send) return;

        const target = e.target;
        if (!target) return;

        // Click on send button (or inside it)
        const isSendClick =
            target === send ||
            (typeof send.contains === "function" && send.contains(target));

        if (!isSendClick) return;

        // If input is empty and has an AI placeholder, inject it just before the app reads the value.
        this.__autofillIfAiPlaceholderEmpty();
    }
}

const tarotWebClient = new TarotWebClient();
tarotWebClient.init();