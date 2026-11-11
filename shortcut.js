"use strict";

/**
 * Shortcut configuration shared by the content script and the settings popup.
 *
 * Content scripts cannot be ES modules, so this file is loaded as a classic
 * script in both contexts and exposes a single frozen global instead of exports.
 *
 * @typedef {{ type: "double", modifier: string }} DoublePressShortcut
 *   Double-tap of one modifier key, identified by `KeyboardEvent.key`.
 * @typedef {{ code: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean }} ComboShortcut
 *   A key, identified by `KeyboardEvent.code`, with an exact set of modifiers.
 * @typedef {DoublePressShortcut | ComboShortcut} Shortcut
 */
const FocusFinderShortcut = (() => {
    const STORAGE_KEY = "shortcut";

    /** @type {Readonly<DoublePressShortcut>} */
    const DEFAULT = Object.freeze({ type: "double", modifier: "Shift" });

    /** `KeyboardEvent.key` values that cannot be the main key of a combo. */
    const MODIFIER_KEYS = Object.freeze(["Control", "Shift", "Alt", "Meta", "CapsLock"]);

    /**
     * @param {Shortcut} shortcut
     * @returns {shortcut is DoublePressShortcut}
     */
    function isDoublePress(shortcut) {
        return shortcut.type === "double";
    }

    /** @returns {Promise<Shortcut>} The saved shortcut, or the default if none is saved. */
    async function load() {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        return stored[STORAGE_KEY] ?? DEFAULT;
    }

    /**
     * @param {Shortcut} shortcut
     * @returns {Promise<void>}
     */
    function save(shortcut) {
        return chrome.storage.local.set({ [STORAGE_KEY]: shortcut });
    }

    /**
     * Calls `listener` whenever the saved shortcut changes, in any tab or popup.
     *
     * @param {(shortcut: Shortcut) => void} listener
     */
    function onChange(listener) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
            listener(changes[STORAGE_KEY].newValue ?? DEFAULT);
        });
    }

    return Object.freeze({ DEFAULT, MODIFIER_KEYS, isDoublePress, load, save, onChange });
})();
