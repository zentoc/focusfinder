/**
 * Focus Finder content script: a keyboard-driven palette that lists the
 * focusable elements on the page and moves focus to the one you pick.
 *
 * Depends on the `FocusFinderShortcut` global from shortcut.js.
 */
(() => {
    "use strict";

    /** Two taps of the modifier within this window count as a double-press. */
    const DOUBLE_PRESS_WINDOW_MS = 400;
    /** Labels derived from an element's text content are cut to this length. */
    const MAX_LABEL_LENGTH = 60;

    const HIGHLIGHT_CLASS = "ff-page-highlight";
    const SELECTED_CLASS = "ff-selected";
    const ROW_CLASS = "ff-result-item";
    const RESULTS_ID = "focus-finder-results";
    const OPTION_ID_PREFIX = "focus-finder-option-";

    const FOCUSABLE_SELECTOR = [
        'input:not([type="hidden"])',
        "textarea",
        "select",
        "button",
        "a[href]",
        '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const DEFAULT_INPUT_ICON = "T";
    const INPUT_ICONS = Object.freeze({
        text: "T",
        email: "@",
        password: "**",
        search: "⌕",
        number: "#",
        tel: "☏",
        url: "url",
        checkbox: "☐",
        radio: "◎",
        submit: "↵",
        reset: "↺",
    });

    /**
     * One row of the palette.
     *
     * @typedef {object} PaletteItem
     * @property {HTMLElement} el      The page element the row focuses.
     * @property {string} label        Primary text.
     * @property {string} meta         Secondary text; may be empty.
     * @property {string} icon         Glyph shown in the row's icon box.
     * @property {string} kind         Tag shown on the right (e.g. "button").
     * @property {string} searchText   Lower-cased text the query is matched against.
     */

    // ── State ───────────────────────────────────────────────────────────────

    /** @type {{ overlay: HTMLElement, input: HTMLInputElement, results: HTMLElement } | null} */
    let palette = null;
    /** @type {PaletteItem[]} */
    let allItems = [];
    /** @type {PaletteItem[]} */
    let filteredItems = [];
    /** @type {HTMLElement[]} Rendered rows, parallel to `filteredItems`. */
    let rows = [];
    let selectedIndex = -1;
    /** @type {HTMLElement | null} */
    let highlightedEl = null;

    let shortcut = FocusFinderShortcut.DEFAULT;
    let lastTapTime = -Infinity;

    // ── DOM helpers ─────────────────────────────────────────────────────────

    /**
     * @param {string} tag
     * @param {Record<string, string>} [attributes]
     * @param {(Node | string)[]} [children]
     * @returns {HTMLElement}
     */
    function h(tag, attributes = {}, children = []) {
        const el = document.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) {
            el.setAttribute(name, value);
        }
        el.append(...children);
        return el;
    }

    /** @param {string} text */
    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // ── Element discovery ───────────────────────────────────────────────────

    /** @returns {PaletteItem[]} */
    function collectItems() {
        const items = [];
        for (const el of document.querySelectorAll(FOCUSABLE_SELECTOR)) {
            if (!isVisible(el)) continue;
            const item = describeElement(el);
            if (item) items.push(item);
        }
        return items;
    }

    /** @param {HTMLElement} el */
    function isVisible(el) {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    }

    /**
     * @param {HTMLElement} el
     * @returns {PaletteItem | null} `null` when the element has nothing to identify it by.
     */
    function describeElement(el) {
        const label = getLabel(el);

        switch (el.tagName.toLowerCase()) {
            case "input": {
                const type = (el.type || "").toLowerCase();
                const icon = INPUT_ICONS[type] || DEFAULT_INPUT_ICON;
                return describeField(el, label, el.placeholder || el.name || "", icon, type || "text");
            }
            case "textarea":
                return describeField(el, label, el.placeholder || el.name || "", "¶", "textarea");
            case "select":
                return describeField(el, label, el.name || "", "▾", "select");
            case "button":
                return describeByText(el, label, "", "↵", "button");
            case "a":
                return describeByText(el, label, linkPath(el), "→", "link");
            default:
                return describeByText(el, label, "", "◉", "interactive");
        }
    }

    /**
     * Form fields: fall back to the placeholder/name hint when there is no label.
     *
     * @returns {PaletteItem | null}
     */
    function describeField(el, label, hint, icon, kind) {
        if (!label && !hint) return null;
        return createItem(el, label || hint, label ? hint : "", icon, kind);
    }

    /**
     * Buttons, links and other interactive elements: fall back to their text content.
     *
     * @returns {PaletteItem | null}
     */
    function describeByText(el, label, meta, icon, kind) {
        const text = label || el.textContent.trim().slice(0, MAX_LABEL_LENGTH);
        if (!text) return null;
        return createItem(el, text, meta, icon, kind);
    }

    /** @returns {PaletteItem} */
    function createItem(el, label, meta, icon, kind) {
        return { el, label, meta, icon, kind, searchText: `${label} ${meta} ${kind}`.toLowerCase() };
    }

    /** @param {HTMLElement} el */
    function linkPath(el) {
        try {
            return new URL(el.href).pathname;
        } catch {
            return "";
        }
    }

    /**
     * Resolves an element's accessible label: aria-label, aria-labelledby,
     * `<label for>`, a wrapping `<label>`, then the title attribute.
     *
     * @param {HTMLElement} el
     */
    function getLabel(el) {
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel.trim();

        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
            const text = labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent.trim())
                .filter(Boolean)
                .join(" ");
            if (text) return text;
        }

        if (el.id) {
            const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (labelEl) return labelEl.textContent.trim();
        }

        const wrappingLabel = el.closest("label");
        if (wrappingLabel) {
            // Drop nested fields so their values/options don't leak into the label.
            const clone = wrappingLabel.cloneNode(true);
            clone.querySelectorAll("input, textarea, select").forEach((field) => field.remove());
            return clone.textContent.trim().slice(0, MAX_LABEL_LENGTH);
        }

        return el.title?.trim() || "";
    }

    // ── Palette ─────────────────────────────────────────────────────────────

    function openPalette() {
        // Collect before the palette is attached so its own input isn't listed.
        allItems = collectItems();

        const input = h("input", {
            id: "focus-finder-input",
            placeholder: "Focus any element…",
            autocomplete: "off",
            spellcheck: "false",
            role: "combobox",
            "aria-label": "Focus any element",
            "aria-expanded": "true",
            "aria-controls": RESULTS_ID,
            "aria-autocomplete": "list",
        });
        const results = h("div", { id: RESULTS_ID, role: "listbox", "aria-label": "Focusable elements" });
        const overlay = h("div", { id: "focus-finder-overlay" }, [
            h("div", { id: "focus-finder-palette", role: "dialog", "aria-modal": "true", "aria-label": "Focus Finder" }, [
                h("div", { id: "focus-finder-input-wrap" }, [
                    h("span", { id: "focus-finder-icon", "aria-hidden": "true" }, ["⌕"]),
                    input,
                ]),
                results,
                h("div", { id: "focus-finder-footer" }, [
                    buildHint(["↑", "↓"], "navigate"),
                    buildHint(["↵"], "focus"),
                    buildHint(["Esc"], "close"),
                ]),
            ]),
        ]);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closePalette();
        });
        input.addEventListener("input", () => renderResults(input.value));
        input.addEventListener("keydown", onInputKeyDown);
        results.addEventListener("click", onResultsClick);
        results.addEventListener("mouseover", onResultsMouseOver);

        palette = /** @type {NonNullable<typeof palette>} */ ({ overlay, input, results });
        document.body.appendChild(overlay);
        input.focus();
        renderResults("");
    }

    function closePalette() {
        setPageHighlight(null);
        palette?.overlay.remove();
        palette = null;
        allItems = [];
        filteredItems = [];
        rows = [];
        selectedIndex = -1;
    }

    /**
     * @param {string[]} keys
     * @param {string} description
     */
    function buildHint(keys, description) {
        return h("span", { class: "ff-hint" }, [
            ...keys.map((key) => h("span", { class: "ff-key" }, [key])),
            description,
        ]);
    }

    /** @param {string} query */
    function renderResults(query) {
        if (!palette) return;

        const q = query.toLowerCase().trim();
        filteredItems = q ? allItems.filter((item) => item.searchText.includes(q)) : allItems;

        if (filteredItems.length === 0) {
            rows = [];
            palette.results.replaceChildren(h("div", { id: "focus-finder-empty" }, ["No matching elements"]));
            select(-1);
            return;
        }

        const matcher = q ? new RegExp(escapeRegExp(q), "i") : null;
        rows = filteredItems.map((item, index) => buildRow(item, index, matcher));

        const fragment = document.createDocumentFragment();
        for (const row of rows) fragment.appendChild(row);
        palette.results.replaceChildren(fragment);
        select(0);
    }

    /**
     * @param {PaletteItem} item
     * @param {number} index
     * @param {RegExp | null} matcher
     */
    function buildRow(item, index, matcher) {
        const text = h("div", { class: "ff-result-text" }, [
            h("div", { class: "ff-result-label" }, highlightMatch(item.label, matcher)),
        ]);
        if (item.meta) {
            text.append(h("div", { class: "ff-result-meta" }, [item.meta]));
        }

        return h(
            "div",
            {
                class: ROW_CLASS,
                id: `${OPTION_ID_PREFIX}${index}`,
                role: "option",
                "aria-selected": "false",
                "data-index": String(index),
            },
            [
                h("div", { class: "ff-result-icon", "aria-hidden": "true" }, [item.icon]),
                text,
                h("span", { class: "ff-result-tag" }, [item.kind]),
            ],
        );
    }

    /**
     * Splits `text` around the first match so the matched part can be emphasised.
     *
     * @param {string} text
     * @param {RegExp | null} matcher
     * @returns {(Node | string)[]}
     */
    function highlightMatch(text, matcher) {
        const match = matcher ? text.match(matcher) : null;
        if (!match) return [text];

        const start = match.index;
        const end = start + match[0].length;
        return [text.slice(0, start), h("mark", {}, [match[0]]), text.slice(end)];
    }

    // ── Selection ───────────────────────────────────────────────────────────

    /**
     * @param {number} index  Index into `filteredItems`, or -1 for no selection.
     * @param {{ scroll?: boolean }} [options]  `scroll` keeps the row visible in the list.
     */
    function select(index, { scroll = false } = {}) {
        const previousRow = rows[selectedIndex];
        previousRow?.classList.remove(SELECTED_CLASS);
        previousRow?.setAttribute("aria-selected", "false");

        selectedIndex = index;

        const row = rows[index];
        if (row) {
            row.classList.add(SELECTED_CLASS);
            row.setAttribute("aria-selected", "true");
            palette?.input.setAttribute("aria-activedescendant", row.id);
            if (scroll) row.scrollIntoView({ block: "nearest" });
        } else {
            palette?.input.removeAttribute("aria-activedescendant");
        }

        setPageHighlight(filteredItems[index]?.el ?? null);
    }

    /** @param {1 | -1} delta */
    function moveSelection(delta) {
        const count = filteredItems.length;
        if (count === 0) return;
        select((selectedIndex + delta + count) % count, { scroll: true });
    }

    function confirmSelection() {
        const item = filteredItems[selectedIndex];
        if (!item) return;

        closePalette();
        item.el.focus();
        item.el.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    /** @param {HTMLElement | null} el */
    function setPageHighlight(el) {
        highlightedEl?.classList.remove(HIGHLIGHT_CLASS);
        highlightedEl = el;
        highlightedEl?.classList.add(HIGHLIGHT_CLASS);
    }

    // ── Palette events ──────────────────────────────────────────────────────

    /** @param {KeyboardEvent} e */
    function onInputKeyDown(e) {
        switch (e.key) {
            case "Escape":
                closePalette();
                break;
            case "ArrowDown":
                e.preventDefault();
                moveSelection(1);
                break;
            case "ArrowUp":
                e.preventDefault();
                moveSelection(-1);
                break;
            case "Tab":
                e.preventDefault();
                moveSelection(e.shiftKey ? -1 : 1);
                break;
            case "Enter":
                e.preventDefault();
                confirmSelection();
                break;
        }
    }

    /**
     * @param {Event} e
     * @returns {number} Index of the row the event happened in, or -1.
     */
    function rowIndexFromEvent(e) {
        const row = e.target instanceof Element ? e.target.closest(`.${ROW_CLASS}`) : null;
        return row instanceof HTMLElement ? Number(row.dataset.index) : -1;
    }

    /** @param {MouseEvent} e */
    function onResultsClick(e) {
        const index = rowIndexFromEvent(e);
        if (index < 0) return;
        select(index);
        confirmSelection();
    }

    /** @param {MouseEvent} e */
    function onResultsMouseOver(e) {
        const index = rowIndexFromEvent(e);
        if (index < 0 || index === selectedIndex) return;
        select(index);
    }

    // ── Trigger shortcut ────────────────────────────────────────────────────

    /**
     * @param {KeyboardEvent} e
     * @param {string} modifier
     * @returns {boolean} `true` on the second tap of a double-press.
     */
    function isDoublePress(e, modifier) {
        if (e.key !== modifier) {
            lastTapTime = -Infinity;
            return false;
        }
        // A held key auto-repeats on some platforms; that is not a second tap.
        if (e.repeat) return false;

        const now = performance.now();
        if (now - lastTapTime < DOUBLE_PRESS_WINDOW_MS) {
            lastTapTime = -Infinity;
            return true;
        }
        lastTapTime = now;
        return false;
    }

    /**
     * @param {KeyboardEvent} e
     * @param {ComboShortcut} combo
     */
    function matchesCombo(e, combo) {
        return (
            e.code === combo.code &&
            e.ctrlKey === combo.ctrl &&
            e.shiftKey === combo.shift &&
            e.altKey === combo.alt &&
            e.metaKey === combo.meta
        );
    }

    /** @param {Element | null} el */
    function isTextEntry(el) {
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        return tag === "input" || tag === "textarea" || /** @type {HTMLElement} */ (el).isContentEditable;
    }

    /** @param {KeyboardEvent} e */
    function onDocumentKeyDown(e) {
        if (palette) return;

        // Key combos would hijack typing, so they are ignored in text fields.
        // A double-tapped modifier types nothing, so it works everywhere.
        const triggered = FocusFinderShortcut.isDoublePress(shortcut)
            ? isDoublePress(e, shortcut.modifier)
            : matchesCombo(e, shortcut) && !isTextEntry(document.activeElement);
        if (!triggered) return;

        e.preventDefault();
        openPalette();
    }

    // ── Init ────────────────────────────────────────────────────────────────

    FocusFinderShortcut.load().then((stored) => {
        shortcut = stored;
    });
    FocusFinderShortcut.onChange((changed) => {
        shortcut = changed;
    });

    document.addEventListener("keydown", onDocumentKeyDown, true);
})();
