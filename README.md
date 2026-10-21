# remiNET mute

**v0.12.2** · Chrome & Firefox

RemiliaNET global chat got too much coal?

**remiNET mute** filters the global chat in *your* browser. Mute users, block keywords, one-click **Remove coal** for known coalposters, and hide live typing previews. Your lists stay local — other people are unaffected, and muted users can still post.

---

## Features

- **Mute from chat** — hover a message → **Mute**
- **Keyword block** — hide messages containing a word or phrase (whole-word or partial)
- Hides **sent messages** and **live typing drafts**
- **Remove coal** — one click mutes known coalposters
- **Pause toggle** — in the popup or on the status bar under Global Chat
- **Export / Import** handles and keywords
- **Coal avoided** stats in the popup (24h / 7d / all time)
- Saves lists in browser storage (syncs when your browser account allows it)

---

## Remove coal

**Remove coal** mutes a built-in list of known coalposters.

In **v0.12.2**:

- `@gostphost`
- `@njz`

It only *adds* those handles — it won’t clear people you muted yourself. Future versions may add more names to the same button.

---

## Keywords

- Matching uses **message text only** — not usernames, handles, timestamps, or other UI
- Blocking the word `x264` does **not** mute a user named `@x264`. Their messages stay visible unless the **message body** contains `x264`
- **Contains** (default): matches the letters anywhere — `egg` also matches `eggpost`
- **Whole word**: only standalone words
- Click the **Contains / Whole word** chip on a keyword to switch mode
- Re-adding the same keyword with a different mode updates that keyword
- Keywords under **4 letters** ask for confirmation (they can hide most of chat)

---

## Install

Download the build for your browser from [Releases](https://github.com/veryretarted/reminet-mute/releases):

- **Chrome:** `reminet-mute-chrome-v0.12.2.zip`
- **Firefox:** `reminet-mute-firefox-v0.12.2.zip`

### Chrome

1. Unzip the Chrome package
2. Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select the unzipped folder
5. Open [remilia.net](https://www.remilia.net) → global chat

### Firefox

1. Unzip the Firefox package
2. Firefox → `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…**
4. Select `manifest.json` inside the unzipped folder
5. Open [remilia.net](https://www.remilia.net) → global chat

Firefox temporary add-ons are removed when the browser restarts — load again after a restart (or use a signed AMO build for a permanent install).

You can also clone this repo and load the folder directly in Chrome.

---

## Usage

| Action | How |
| --- | --- |
| Mute user | Hover message → **Mute**, or type a handle in the popup |
| Block keyword | Popup → keyword field → **Block** (toggle partial/whole word) |
| Remove coal | Popup → **Remove coal** |
| Unmute / remove keyword | Popup list buttons |
| Pause filtering | Popup toggle (lists kept) |
| Clear lists | **Clear all** under users or keywords |
| Backup / restore | **Export list** / **Import list** |

---

## Updating

1. Replace files in the **same folder**
2. Reload the extension (Chrome: **Reload** on the card; Firefox: load the temporary add-on again)

Don’t remove the extension and load it from a new path every time — that can create a new empty list.

---

## Notes

- Filtering applies after the SYSTEM *“Welcome to RemiliaNET global chat…”* line appears.
- Status under Global Chat (one line, same pink as the chat header):
  - users only → `N coalposts avoided in loaded chat (lifetime coal: N)`
  - keywords only → `N coalwords avoided in loaded chat (lifetime coal: N)`
  - both → `N coalposts and N coalwords avoided in loaded chat (lifetime coal: N)`
  - **Pause / Resume** sits on that bar
- Any active filter (users **or** keywords) uses the same history-load helper so the chat stays scrollable when many messages are hidden.
- On first load with filters on, the chat may **briefly scroll up and back down** once so older history can load.
- Client-side only. Not a server ban. Does not affect other users or official clients.

---

## Permissions

- **storage** — mute lists, pause state, local stats

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
