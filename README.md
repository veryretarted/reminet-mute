# remiNET mute

**v0.11** · Chrome & Firefox

RemiliaNET global chat got too much coal?

**remiNET mute** filters the global chat in *your* browser. One click removes known coalposters, mute anyone you don’t want to see, and hide their live typing previews. Your list stays local — other people are unaffected, and muted users can still post.

---

## Features

- **Mute from chat** — hover a message → **Mute**

- **Keyword mute** — block any message containing a word or phrase

- Hides **sent messages** and **live typing drafts**

- **Remove coal** — one click mutes known coalposters

- **Pause toggle** — show everyone temporarily without clearing the list

- **Export / Import** your mute list and keyword list

- Saves your list in browser storage (syncs when your browser account allows it)

---

## Remove coal

**Remove coal** mutes a built-in list of known coalposters.

In **v0.11**:

- `@stud`
- `@gostphost`
- `@whiterose`

It only *adds* those handles — it won’t clear people you muted yourself. Future versions may add more names to the same button.

Unmute anyone from the list, or pause all mutes with the toggle.

---

## Install

Download the build for your browser from [Releases](https://github.com/veryretarted/reminet-mute/releases):

- **Chrome:** `reminet-mute-chrome-v0.11.zip`

- **Firefox:** `reminet-mute-firefox-v0.11.zip`

### Chrome

1. Unzip the Chrome package

2. Chrome → `chrome://extensions`

3. Enable **Developer mode**

4. **Load unpacked** → select the unzipped folder

5. Open [remilia.net](https://www.remilia.net) → global chat

6. Hover a message → **Mute**, or open the toolbar icon → **Remove coal**

### Firefox

1. Unzip the Firefox package

2. Firefox → `about:debugging#/runtime/this-firefox`

3. **Load Temporary Add-on…**

4. Select `manifest.json` inside the unzipped folder

5. Open [remilia.net](https://www.remilia.net) → global chat

6. Hover a message → **Mute**, or open the toolbar icon → **Remove coal**

Firefox temporary add-ons are removed when the browser restarts — load again after a restart (or use a signed AMO build for a permanent install).

You can also clone this repo and load the folder directly in Chrome.

---

## Usage

| Action | How |

| --- | --- |

| Mute user | Hover message → **Mute**, or type a handle in the popup |

| Block keyword | Popup → **Blocked keywords** → type a word → **Block** |

| Remove coal | Popup → **Remove coal** |

| Unmute user | Popup → **Unmute** next to the handle |

| Remove keyword | Popup → **Remove** next to the keyword |

| Pause mutes | Popup toggle (lists are kept) |

| Clear mute list | Popup → **Clear all** (under Muted users) |

| Clear keyword list | Popup → **Clear all** (under Blocked keywords) |

| Backup / restore | **Export list** / **Import list** (includes both handles and keywords) |

---

## Updating

To keep your mute list:

1. Replace files in the **same folder**

2. Reload the extension (Chrome: **Reload** on the card; Firefox: load the temporary add-on again)

Don’t remove the extension and load it from a new path every time — that can create a new empty list.

---

## Notes

- Mutes apply after the SYSTEM *“Welcome to RemiliaNET global chat…”* line appears.

- A status bar under Global Chat shows how many messages (by handle or keyword) were hidden in the loaded history.

- Keyword matching is case-insensitive and partial — blocking `egg` also hides messages containing `eggpost`.

- On first load with mutes on (or after **Remove coal** if the list is very short), the chat may **briefly scroll up and back down** once so older history can load. After that, scrolling works normally.

- This is client-side only. It is not a server ban and does not affect other users or official clients.

---

## Permissions

- **storage** — mute list and pause state

No accounts, no third-party servers, no analytics.

---

## License

[CC0 1.0](./LICENSE) — public domain. Use it however you want.

---

```
⠀ ⠀⣠⠶⠾⠟⠃⠀⠀⠀⠀⠀⠀⠀⠈⠙⠳⣆
⠀⣤⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ ⢠⣴⣶⣶⡌
⠘⠁⢠⢶⢾⣯⣍⡁⠀⠀⠀⠀⠀⠀⢰⣧⣨⣿⢸⠄
⠀⣠⢾⣷⣾⣿⣿⣷⠀⠀⠀⠀⠀⠀⢠⢿⣿⡿⡎
⠀⠃⢹⡘⢿⣿⡟⣹⠀⠀⠀⠀⠀⠀⠘⢤⣉⣑⠁
⠀⠀⠀⠙⣦⣤⠔⠋⠀
```

milady.
