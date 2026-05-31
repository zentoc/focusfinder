let overlay = null;
let allElements = [];
let filteredElements = [];
let selectedIndex = 0;

function onOpenFocusFinder() {
    if (overlay) {
        closePalette();
    } else {
        openPalette();
    }
}

function openPalette() {
    allElements = collectFocusableElements();

    overlay = document.createElement("div");
    overlay.id = "focus-finder-overlay";
    overlay.innerHTML = `
        <div id="focus-finder-palette">
            <div id="focus-finder-input-wrap">
                <span id="focus-finder-icon">⌕</span>
                <input id="focus-finder-input" placeholder="Focus any element…" autocomplete="off" spellcheck="false" />
            </div>
            <div id="focus-finder-results"></div>
            <div id="focus-finder-footer">
                <span class="ff-hint"><span class="ff-key">↑</span><span class="ff-key">↓</span> navigate</span>
                <span class="ff-hint"><span class="ff-key">↵</span> focus</span>
                <span class="ff-hint"><span class="ff-key">Esc</span> close</span>
            </div>
        </div>
    `;

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closePalette();
    });

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#focus-finder-input");
    input.focus();

    renderResults("");

    input.addEventListener("input", () => renderResults(input.value));

    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closePalette();
        } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            moveSelection(1);
        } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
            e.preventDefault();
            moveSelection(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            confirmSelection();
        }
    });
}

function closePalette() {
    clearPageHighlight();
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
    allElements = [];
    filteredElements = [];
    selectedIndex = 0;
}

function highlightPageElement() {
    clearPageHighlight();
    if (selectedIndex >= 0 && selectedIndex < filteredElements.length) {
        filteredElements[selectedIndex].el.classList.add("ff-page-highlight");
    }
}

function clearPageHighlight() {
    document.querySelectorAll(".ff-page-highlight").forEach(el => el.classList.remove("ff-page-highlight"));
}

function renderResults(query) {
    const resultsEl = document.getElementById("focus-finder-results");
    if (!resultsEl) return;

    const q = query.toLowerCase().trim();
    filteredElements = q
        ? allElements.filter(({ label, meta, kind }) =>
            `${label} ${meta} ${kind}`.toLowerCase().includes(q))
        : allElements;

    selectedIndex = filteredElements.length > 0 ? 0 : -1;
    highlightPageElement();

    if (filteredElements.length === 0) {
        resultsEl.innerHTML = `<div id="focus-finder-empty">No matching elements</div>`;
        return;
    }

    resultsEl.innerHTML = filteredElements.map(({ label, meta, icon, kind }, i) => `
        <div class="ff-result-item${i === 0 ? " ff-selected" : ""}" data-index="${i}">
            <div class="ff-result-icon">${escHtml(icon)}</div>
            <div class="ff-result-text">
                <div class="ff-result-label">${highlightMatch(label, q)}</div>
                ${meta ? `<div class="ff-result-meta">${escHtml(meta)}</div>` : ""}
            </div>
            <span class="ff-result-tag">${escHtml(kind)}</span>
        </div>
    `).join("");

    resultsEl.querySelectorAll(".ff-result-item").forEach((row) => {
        row.addEventListener("click", () => {
            selectedIndex = parseInt(row.dataset.index, 10);
            confirmSelection();
        });
        row.addEventListener("mouseenter", () => {
            selectedIndex = parseInt(row.dataset.index, 10);
            resultsEl.querySelectorAll(".ff-result-item").forEach((r, i) => {
                r.classList.toggle("ff-selected", i === selectedIndex);
            });
            highlightPageElement();
        });
    });
}

function moveSelection(delta) {
    if (filteredElements.length === 0) return;
    selectedIndex = ((selectedIndex + delta) + filteredElements.length) % filteredElements.length;
    const resultsEl = document.getElementById("focus-finder-results");
    resultsEl.querySelectorAll(".ff-result-item").forEach((row, i) => {
        row.classList.toggle("ff-selected", i === selectedIndex);
    });
    resultsEl.querySelector(".ff-selected")?.scrollIntoView({ block: "nearest" });
    highlightPageElement();
}

function confirmSelection() {
    if (selectedIndex < 0 || selectedIndex >= filteredElements.length) return;
    const { el } = filteredElements[selectedIndex];
    closePalette();
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
}

function collectFocusableElements() {
    const results = [];
    const seen = new Set();

    document.querySelectorAll(
        'input:not([type="hidden"]), textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])'
    ).forEach((el) => {
        if (seen.has(el) || !isVisible(el)) return;
        seen.add(el);
        const info = getElementInfo(el);
        if (info) results.push(info);
    });

    return results;
}

function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
}

function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || "").toLowerCase();
    const label = getLabel(el);

    if (tag === "input") {
        const meta = el.placeholder || el.name || "";
        if (!label && !meta) return null;
        return { el, label: label || meta, meta: label ? meta : "", icon: inputIcon(type), kind: type || "text" };
    }
    if (tag === "textarea") {
        const meta = el.placeholder || el.name || "";
        if (!label && !meta) return null;
        return { el, label: label || meta, meta: label ? meta : "", icon: "¶", kind: "textarea" };
    }
    if (tag === "select") {
        const meta = el.name || "";
        if (!label && !meta) return null;
        return { el, label: label || meta, meta: label ? meta : "", icon: "▾", kind: "select" };
    }
    if (tag === "button") {
        const text = label || el.textContent.trim().slice(0, 60);
        if (!text) return null;
        return { el, label: text, meta: "", icon: "↵", kind: "button" };
    }
    if (tag === "a") {
        const text = label || el.textContent.trim().slice(0, 60);
        if (!text) return null;
        let meta = "";
        try { meta = new URL(el.href).pathname; } catch {}
        return { el, label: text, meta, icon: "→", kind: "link" };
    }
    const text = label || el.textContent.trim().slice(0, 60);
    if (!text) return null;
    return { el, label: text, meta: "", icon: "◉", kind: "interactive" };
}

function getLabel(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
        const text = labelledBy.split(" ")
            .map(id => document.getElementById(id)?.textContent.trim())
            .filter(Boolean).join(" ");
        if (text) return text;
    }

    if (el.id) {
        const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl) return labelEl.textContent.trim();
    }

    const wrappingLabel = el.closest("label");
    if (wrappingLabel) {
        const clone = wrappingLabel.cloneNode(true);
        clone.querySelectorAll("input, textarea, select").forEach(f => f.remove());
        return clone.textContent.trim().slice(0, 60);
    }

    return el.title?.trim() || "";
}

function inputIcon(type) {
    return { text: "T", email: "@", password: "**", search: "⌕", number: "#", tel: "☏", url: "url", checkbox: "☐", radio: "◎", submit: "↵", reset: "↺" }[type] || "T";
}

function highlightMatch(text, query) {
    if (!query) return escHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(escaped, "i"));
    if (!match) return escHtml(text);
    const i = match.index;
    return escHtml(text.slice(0, i)) + `<mark>${escHtml(match[0])}</mark>` + escHtml(text.slice(i + match[0].length));
}

function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const DEFAULT_SHORTCUT = { code: "KeyC", ctrl: false, shift: false, alt: false, meta: false };
let shortcut = DEFAULT_SHORTCUT;
let lastDoublePressTime = 0;

chrome.storage.local.get("shortcut", ({ shortcut: stored }) => {
    if (stored) shortcut = stored;
});

chrome.storage.onChanged.addListener(({ shortcut: change }) => {
    if (change) shortcut = change.newValue;
});

document.addEventListener("keydown", (e) => {
    if (overlay) return;

    if (shortcut.type === "double") {
        if (e.key !== shortcut.modifier) { lastDoublePressTime = 0; return; }
        const now = Date.now();
        if (now - lastDoublePressTime < 400) {
            e.preventDefault();
            lastDoublePressTime = 0;
            onOpenFocusFinder();
        } else {
            lastDoublePressTime = now;
        }
        return;
    }

    if (e.code !== shortcut.code) return;
    if (e.ctrlKey !== shortcut.ctrl || e.shiftKey !== shortcut.shift ||
        e.altKey !== shortcut.alt || e.metaKey !== shortcut.meta) return;

    const active = document.activeElement;
    const tag = active?.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || active?.isContentEditable) return;

    e.preventDefault();
    onOpenFocusFinder();
}, true);

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggle") {
        onOpenFocusFinder();
    }
});
