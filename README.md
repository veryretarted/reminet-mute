# remiNET mute

**v0.13.1** · Chrome & Firefox

RemiliaNET global chat got too much coal?

**remiNET mute** filters the global chat in *your* browser. Mute users, block keywords, one-click **Remove coal** for known coalposters, and hide live typing previews. Your lists stay local — other people are unaffected, and muted users can still post.

---

## Features

- **Mute from chat** — hover a message → **Mute**
- **Keyword block** — hide messages containing a word or phrase
- Hides **sent messages** and **live typing drafts**
- **Remove coal** — one click mutes known coalposters
- **Filtering behavior** — full removal, soft removal, milady, coal notice, or bible verse
- **👁** — show one filtered message for 5 seconds
- **Hide attachments** — for everyone on the mute list, or per user
- **Pause** — in the popup or on the status bar under Global Chat
- **Export / Import** handles and keywords
- **Coal avoided** stats in the popup (24h / 7d / all time)
- Saves lists in browser storage (syncs when your browser account allows it)

---

## Filtering behavior

| Mode | What you see |
| --- | --- |
| **Full removal** | Message is gone |
| **Soft removal** | Message stays, greyed out |
| **milady placeholder** | Time, avatar, and name stay. Text becomes `milady` |
| **coal notice** | Time, avatar, and name stay. Text becomes a coal notice |
| **bible verse** | Time, ✝️, citation, and a verse |

Hover a filtered message → **👁** shows the original for 5 seconds.

milady, coal notice, and bible verse always hide attachments.

---

## Attachments

- **Hide attachments** (popup) — hide files from everyone on the mute list, including while paused or revealed
- **files** on a user — hide that user’s attachments even if the global toggle is off
- Off, with no per-user box — attachments show when you pause or use **👁**

---

## Remove coal

**Remove coal** mutes a built-in list of known coalposters.

In **v0.13.1**:

- `@gostphost`
- `@njz`

It only *adds* those handles. It does not clear people you muted yourself. Future versions may add more names to the same button.

---

## Keywords

- **Contains** — matches the letters anywhere (`egg` also matches `eggpost`)
- **Whole word** — only standalone words
- Click the chip on a keyword to switch mode
- Adding the same keyword again with a different mode updates it
- Keywords under 4 letters ask for confirmation

---

## Install

Download the build for your browser from [Releases](https://github.com/veryretarted/reminet-mute/releases):

- **Chrome:** `reminet-mute-chrome-v0.13.1.zip`
- **Firefox:** `reminet-mute-firefox-v0.13.1.zip`

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

Firefox temporary add-ons are removed when the browser restarts. Load again after a restart, or use a signed AMO build for a permanent install.

You can also clone this repo and load the folder directly in Chrome.

---

## Usage

| Action | How |
| --- | --- |
| Mute user | Hover message → **Mute**, or type a handle in the popup |
| Block keyword | Popup → keyword field → **Block** |
| Change look | Popup → **Filtering behavior** |
| Show one message | Hover → **👁** (5 seconds) |
| Remove coal | Popup → **Remove coal** |
| Unmute / remove keyword | Popup list buttons |
| Pause filtering | Popup toggle, or **Pause** on the status bar |
| Hide attachments | Popup toggle, or **files** on a user |
| Clear lists | **Clear all** under users or keywords |
| Backup / restore | **Export list** / **Import list** |

---

## Updating

To keep your mute list:

1. Replace files in the **same folder**
2. Reload the extension (Chrome: **Reload** on the card; Firefox: load the temporary add-on again)

Don’t remove the extension and load it from a new path every time. That can create a new empty list.

---

## Notes

- Filtering starts after the SYSTEM *“Welcome to RemiliaNET global chat…”* line.
- Status under Global Chat shows how many coalposts / coalwords were avoided in the loaded chat, plus a lifetime total.
- **Pause / Resume** sits on that bar.
- On first load with filters on, the chat may briefly scroll up and back down once so older history can load.
- This is local to your browser. It is not a server ban and does not affect other users.

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
