# remiNET mute

**v0.1.0** · Chrome extension

RemiliaNET global chat got too much coal?

**remiNET mute** filters the global chat in *your* browser. One click removes known coalposters, mute anyone you don’t want to see, and hide their live typing previews. Your list stays local — other people are unaffected, and muted users can still post.

---

## Features

- **Mute from chat** — hover a message → **Mute**
- Hides **sent messages** and **live typing drafts**
- **Remove coal** — one click mutes known coalposters
- **Pause toggle** — show everyone temporarily without clearing the list
- **Export / Import** your mute list
- Syncs across Chrome when you’re signed in (`chrome.storage.sync`)

---

## Remove coal

**Remove coal** mutes a built-in list of known coalposters.

In **v0.1.0**:

- `@stud`
- `@gostphost`

It only *adds* those handles — it won’t clear people you muted yourself. Future versions may add more names to the same button.

Unmute anyone from the list, or pause all mutes with the toggle.

---

## Install

1. Download or clone this repo
2. Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this folder
5. Open [remilia.net](https://www.remilia.net) → global chat
6. Hover a message → **Mute**, or open the toolbar icon → **Remove coal**

---

## Usage

| Action | How |
| --- | --- |
| Mute | Hover message → **Mute**, or type a handle in the popup |
| Remove coal | Popup → **Remove coal** |
| Unmute | Popup → **Unmute** |
| Pause mutes | Popup toggle (list is kept) |
| Clear list | Popup → **Clear all** |
| Backup / restore | **Export list** / **Import list** |

---

## Updating

To keep your mute list:

1. Replace files in the **same folder**
2. `chrome://extensions` → **Reload** on the existing card

Don’t remove the extension and load it from a new path every time — that can create a new empty list.

---

## Notes

- Mutes apply after the SYSTEM *“Welcome to RemiliaNET global chat…”* line appears.
- A status bar under Global Chat shows how many muted messages are hidden in the loaded history.
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
