/**
 * Settings popup: shows the trigger shortcut and records a new one.
 *
 * Depends on the `FocusFinderShortcut` global from shortcut.js.
 */
(() => {
    "use strict";

    const { MODIFIER_KEYS } = FocusFinderShortcut;

    /** Display labels for `KeyboardEvent.code` values that aren't letters or digits. */
    const CODE_LABELS = Object.freeze({
        Space: "Space",
        Enter: "Enter",
        Backspace: "⌫",
        Escape: "Esc",
        Tab: "Tab",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        BracketLeft: "[",
        BracketRight: "]",
        Semicolon: ";",
        Quote: "'",
        Comma: ",",
        Period: ".",
        Slash: "/",
        Backslash: "\\",
        Minus: "-",
        Equal: "=",
    });

    const display = document.getElementById("shortcut-display");
    const recordButton = document.getElementById("record-btn");

    /** @type {Shortcut} */
    let currentShortcut = FocusFinderShortcut.DEFAULT;
    /** Tears down the active recording session; `null` when not recording. */
    let stopRecording = null;

    // ── Rendering ───────────────────────────────────────────────────────────

    /**
     * @param {string} className
     * @param {string} text
     */
    function span(className, text) {
        const el = document.createElement("span");
        el.className = className;
        el.textContent = text;
        return el;
    }

    /** @param {string} code A `KeyboardEvent.code` value. */
    function codeToLabel(code) {
        if (code.startsWith("Key")) return code.slice(3);
        if (code.startsWith("Digit")) return code.slice(5);
        return CODE_LABELS[code] || code;
    }

    /**
     * @param {Shortcut} shortcut
     * @returns {HTMLElement[]}
     */
    function shortcutNodes(shortcut) {
        if (FocusFinderShortcut.isDoublePress(shortcut)) {
            return [span("key-badge", shortcut.modifier), span("key-repeat", "×2")];
        }

        const keys = [];
        if (shortcut.ctrl) keys.push("Ctrl");
        if (shortcut.alt) keys.push("Alt");
        if (shortcut.shift) keys.push("Shift");
        if (shortcut.meta) keys.push("⌘");
        keys.push(codeToLabel(shortcut.code));

        return keys.flatMap((key, index) => {
            const badge = span("key-badge", key);
            return index === 0 ? [badge] : [span("key-separator", "+"), badge];
        });
    }

    /** @param {Shortcut} shortcut */
    function renderShortcut(shortcut) {
        display.replaceChildren(...shortcutNodes(shortcut));
    }

    // ── Recording ───────────────────────────────────────────────────────────

    function startRecording() {
        let nonModifierPressed = false;

        /** @param {KeyboardEvent} e */
        const onKeyDown = (e) => {
            if (MODIFIER_KEYS.includes(e.key)) return;
            nonModifierPressed = true;
            e.preventDefault();
            commit({ code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
        };

        /** @param {KeyboardEvent} e */
        const onKeyUp = (e) => {
            if (!MODIFIER_KEYS.includes(e.key) || nonModifierPressed) return;
            // A modifier released on its own is recorded as a double-press of it.
            commit({ type: "double", modifier: e.key });
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);

        display.replaceChildren(span("recording-prompt", "Press any shortcut…"));
        recordButton.textContent = "Cancel";
        recordButton.classList.add("recording");

        stopRecording = () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            recordButton.textContent = "Change";
            recordButton.classList.remove("recording");
            stopRecording = null;
        };
    }

    /** @param {Shortcut} shortcut */
    async function commit(shortcut) {
        stopRecording?.();
        await FocusFinderShortcut.save(shortcut);
        currentShortcut = shortcut;
        renderShortcut(shortcut);
    }

    function cancelRecording() {
        stopRecording?.();
        renderShortcut(currentShortcut);
    }

    // ── Init ────────────────────────────────────────────────────────────────

    recordButton.addEventListener("click", () => {
        if (stopRecording) {
            cancelRecording();
        } else {
            startRecording();
        }
    });

    FocusFinderShortcut.load().then((stored) => {
        currentShortcut = stored;
        // Don't clobber the prompt if recording started before storage answered.
        if (!stopRecording) renderShortcut(stored);
    });
})();
