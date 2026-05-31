const DEFAULT_SHORTCUT = { code: "KeyC", ctrl: false, shift: false, alt: false, meta: false };

const display = document.getElementById("shortcut-display");
const btn = document.getElementById("record-btn");

const MODIFIERS = ["Control", "Shift", "Alt", "Meta", "CapsLock"];

function codeToLabel(code) {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    const map = {
        Space: "Space", Enter: "Enter", Backspace: "⌫", Escape: "Esc", Tab: "Tab",
        ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
        BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'",
        Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Minus: "-", Equal: "=",
    };
    return map[code] || code;
}

function badge(label) {
    return `<span class="key-badge">${label}</span>`;
}

function plus() {
    return `<span style="color:#45475a;font-size:11px;padding:0 2px">+</span>`;
}

function renderShortcut(s) {
    if (s.type === "double") {
        display.innerHTML = badge(s.modifier) + `<span style="color:#585b70;font-size:11px;padding-left:5px">×2</span>`;
        return;
    }
    const parts = [];
    if (s.ctrl)  parts.push("Ctrl");
    if (s.alt)   parts.push("Alt");
    if (s.shift) parts.push("Shift");
    if (s.meta)  parts.push("⌘");
    parts.push(codeToLabel(s.code));
    display.innerHTML = parts.map(badge).join(plus());
}

chrome.storage.local.get("shortcut", ({ shortcut }) => {
    renderShortcut(shortcut || DEFAULT_SHORTCUT);
});

let recording = false;

btn.addEventListener("click", () => {
    if (recording) {
        stop();
        return;
    }

    recording = true;
    display.innerHTML = `<span style="color:#89b4fa;font-size:12px">Press any shortcut…</span>`;
    btn.textContent = "Cancel";
    btn.classList.add("recording");

    let nonModifierPressed = false;

    const onKeyDown = (e) => {
        if (MODIFIERS.includes(e.key)) return;
        nonModifierPressed = true;
        e.preventDefault();

        const shortcut = {
            code: e.code,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
        };
        save(shortcut);
        stop();
    };

    const onKeyUp = (e) => {
        if (!MODIFIERS.includes(e.key) || nonModifierPressed) return;
        // Modifier released with no other key → record as double-press of that modifier
        const shortcut = { type: "double", modifier: e.key };
        save(shortcut);
        stop();
    };

    const stop = () => {
        recording = false;
        btn.textContent = "Change";
        btn.classList.remove("recording");
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("keyup", onKeyUp, true);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
});

function save(shortcut) {
    chrome.storage.local.set({ shortcut }, () => renderShortcut(shortcut));
}
