(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const ENABLED_KEY = "muteEnabled";

  /** Known coalposters — "Remove coal" mutes these. Future versions may add more. */
  const COAL_HANDLES = ["stud", "gostphost", "whiterose"];

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const inputEl = document.getElementById("handleInput");
  const muteBtn = document.getElementById("muteBtn");
  const clearBtn = document.getElementById("clearBtn");
  const enabledToggle = document.getElementById("enabledToggle");
  const toggleTitle = document.getElementById("toggleTitle");
  const toggleHint = document.getElementById("toggleHint");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const coalBtn = document.getElementById("coalBtn");
  const clearConfirm = document.getElementById("clearConfirm");
  const clearYes = document.getElementById("clearYes");
  const clearCancel = document.getElementById("clearCancel");

  function normalize(handle) {
    return String(handle || "")
      .trim()
      .replace(/^~/, "")
      .replace(/^@/, "")
      .toLowerCase();
  }

  async function notifyTab(msg) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    } catch (_) {}
  }

  function setToggleUi(enabled) {
    enabledToggle.checked = enabled;
    document.body.classList.toggle("muted-paused", !enabled);
    if (enabled) {
      toggleTitle.textContent = "Mutes active";
      toggleHint.textContent = "Hiding muted users in chat";
    } else {
      toggleTitle.textContent = "Mutes paused";
      toggleHint.textContent = "Showing everyone · list kept";
    }
  }

  function render(handles) {
    const sorted = [...handles].map(normalize).filter(Boolean).sort();
    listEl.innerHTML = "";
    emptyEl.classList.toggle("hidden", sorted.length > 0);

    for (const h of sorted) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "handle";
      span.textContent = h;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unmute";
      btn.textContent = "Unmute";
      btn.addEventListener("click", async () => {
        const next = sorted.filter((x) => x !== h);
        await chrome.storage.sync.set({ [STORAGE_KEY]: next });
        notifyTab({ type: "UNMUTE", handle: h });
        render(next);
      });

      li.appendChild(span);
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  async function getList() {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function setList(handles, { merge = false } = {}) {
    const normalized = handles.map(normalize).filter(Boolean);
    let next = normalized;
    if (merge) {
      const existing = await getList();
      next = Array.from(new Set([...existing.map(normalize), ...normalized]));
    } else {
      next = Array.from(new Set(normalized));
    }
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    notifyTab({ type: "SET_LIST", handles: next });
    render(next);
    return next;
  }

  async function load() {
    const result = await chrome.storage.sync.get([STORAGE_KEY, ENABLED_KEY]);
    const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const enabled = result[ENABLED_KEY] !== false; // default on
    setToggleUi(enabled);
    render(list);
  }

  async function addMute() {
    const h = normalize(inputEl.value);
    if (!h) return;
    const list = await getList();
    const set = new Set(list.map(normalize));
    set.add(h);
    const next = Array.from(set);
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    notifyTab({ type: "MUTE", handle: h });
    inputEl.value = "";
    render(next);
  }

  muteBtn.addEventListener("click", addMute);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMute();
  });

  function hideClearConfirm() {
    if (clearConfirm) clearConfirm.hidden = true;
  }

  clearBtn.addEventListener("click", () => {
    if (!clearConfirm) return;
    clearConfirm.hidden = !clearConfirm.hidden;
  });

  clearCancel?.addEventListener("click", hideClearConfirm);

  clearYes?.addEventListener("click", async () => {
    hideClearConfirm();
    await chrome.storage.sync.set({ [STORAGE_KEY]: [] });
    notifyTab({ type: "CLEAR_ALL" });
    render([]);
  });

  enabledToggle.addEventListener("change", async () => {
    const enabled = enabledToggle.checked;
    setToggleUi(enabled);
    await chrome.storage.sync.set({ [ENABLED_KEY]: enabled });
    notifyTab({ type: "SET_ENABLED", enabled });
  });


  coalBtn.addEventListener("click", async () => {
    const list = await getList();
    const set = new Set(list.map(normalize));
    let added = 0;
    for (const h of COAL_HANDLES) {
      const n = normalize(h);
      if (!set.has(n)) {
        set.add(n);
        added += 1;
      }
    }
    const next = Array.from(set);
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    notifyTab({ type: "SET_LIST", handles: next });
    render(next);
    const label = coalBtn.textContent;
    coalBtn.textContent = added ? `Muted ${added}` : "Already muted";
    setTimeout(() => {
      coalBtn.textContent = label;
    }, 1200);
  });

  exportBtn.addEventListener("click", async () => {
    const list = await getList();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mutedHandles: list.map(normalize).filter(Boolean).sort(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `remilianet-mute-list-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      let handles = [];

      // JSON export from this extension
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          handles = data;
        } else if (Array.isArray(data.mutedHandles)) {
          handles = data.mutedHandles;
        } else if (Array.isArray(data.handles)) {
          handles = data.handles;
        }
      } catch {
        // plain text: one handle per line
        handles = text.split(/[\n,]+/).map((s) => s.trim());
      }

      handles = handles.map(normalize).filter(Boolean);
      if (!handles.length) {
        alert("No handles found in that file.");
        return;
      }

      const merge = confirm(
        `Found ${handles.length} handle(s).\n\nOK = merge with current list\nCancel = replace current list`
      );
      // confirm: OK=true merge, Cancel=false replace
      // Actually confirm returns false on Cancel — use that as replace
      await setList(handles, { merge });
    } catch (err) {
      alert("Import failed: " + (err?.message || err));
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes[STORAGE_KEY]) {
      const list = Array.isArray(changes[STORAGE_KEY].newValue)
        ? changes[STORAGE_KEY].newValue
        : [];
      render(list);
    }
    if (changes[ENABLED_KEY]) {
      setToggleUi(changes[ENABLED_KEY].newValue !== false);
    }
  });

  load();
})();
