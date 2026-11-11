# Focus Finder

A Chrome extension that opens a keyboard-driven palette for finding and focusing any interactive element on the page — inputs, buttons, links, selects — without touching the mouse.

## Usage

Press **Shift + Shift** (double-tap Shift) on any page to open the palette.

- Type to filter elements by label, placeholder, name, or type
- **↑ / ↓** or **Tab / Shift+Tab** to navigate
- **Enter** to focus the selected element
- **Esc** to close

The selected element is highlighted on the page as you navigate the list.

## Changing the shortcut

Click the extension icon to open settings. Click **Change** and press any key or combination — modifier+key (e.g. Cmd+Shift+F) or a double-tap of a modifier key (e.g. Shift+Shift, Ctrl+Ctrl). The shortcut is saved immediately.

## Installing

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

## Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `shortcut.js` | Shortcut defaults and storage, shared by the content script and the popup |
| `focus.js` | Content script: element discovery, the palette, and the trigger shortcut |
| `styles.css` | Palette styles injected into pages |
| `settings.html` / `settings.css` / `settings.js` | Settings popup for changing the shortcut |

There is no build step. After editing a file, reload the extension on `chrome://extensions` and refresh the page.
