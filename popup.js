(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const KEYWORDS_KEY = "mutedKeywords";
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

  const keywordListEl = document.getElementById("keywordList");
  const keywordEmptyEl = document.getElementById("keywordEmpty");
  const keywordInputEl = document.getElementById("keywordInput");
  const addKeywordBtn = document.getElementById("addKeywordBtn");
  const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
  const clearKeywordsConfirm = document.getElementById("clearKeywordsConfirm");
  const clearKeywordsYes = document.getElementById("clearKeywordsYes");
  const clearKeywordsCancel = document.getElementById("clearKeywordsCancel");

  function normalize(handle) {
    return String(handle || "")
      .trim()
      .replace(/^~/, "")
      .replace(/^@/, "")
      .toLowerCase();
  }

  function normalizeKeyword(kw) {
    return String(kw || "").trim().toLowerCase();
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

  function renderKeywords(keywords) {
    const sorted = [...keywords].map(normalizeKeyword).filter(Boolean).sort();
    keywordListEl.innerHTML = "";
    keywordEmptyEl.classList.toggle("hidden", sorted.length > 0);

    for (const kw of sorted) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "keyword";
      span.textContent = kw;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unmute";
      btn.textContent = "Remove";
      btn.addEventListener("click", async () => {
        const next = sorted.filter((x) => x !== kw);
        await chrome.storage.sync.set({ [KEYWORDS_KEY]: next });
        notifyTab({ type: "SET_KEYWORDS", keywords: next });
        renderKeywords(next);
      });

      li.appendChild(span);
      li.appendChild(btn);
      keywordListEl.appendChild(li);
    }
  }

  async function getKeywords() {
    const result = await chrome.storage.sync.get([KEYWORDS_KEY]);
    return Array.isArray(result[KEYWORDS_KEY]) ? result[KEYWORDS_KEY] : [];
  }

  async function addKeyword() {
    const kw = normalizeKeyword(keywordInputEl.value);
    if (!kw) return;
    const list = await getKeywords();
    const set = new Set(list.map(normalizeKeyword));
    set.add(kw);
    const next = Array.from(set);
    await chrome.storage.sync.set({ [KEYWORDS_KEY]: next });
    notifyTab({ type: "SET_KEYWORDS", keywords: next });
    keywordInputEl.value = "";
    renderKeywords(next);
  }

  addKeywordBtn.addEventListener("click", addKeyword);
  keywordInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addKeyword();
  });

  function hideClearKeywordsConfirm() {
    if (clearKeywordsConfirm) clearKeywordsConfirm.hidden = true;
  }

  clearKeywordsBtn.addEventListener("click", () => {
    if (!clearKeywordsConfirm) return;
    clearKeywordsConfirm.hidden = !clearKeywordsConfirm.hidden;
  });

  clearKeywordsCancel?.addEventListener("click", hideClearKeywordsConfirm);

  clearKeywordsYes?.addEventListener("click", async () => {
    hideClearKeywordsConfirm();
    await chrome.storage.sync.set({ [KEYWORDS_KEY]: [] });
    notifyTab({ type: "SET_KEYWORDS", keywords: [] });
    renderKeywords([]);
  });

  async function load() {
    const result = await chrome.storage.sync.get([STORAGE_KEY, ENABLED_KEY, KEYWORDS_KEY]);
    const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const keywords = Array.isArray(result[KEYWORDS_KEY]) ? result[KEYWORDS_KEY] : [];
    const enabled = result[ENABLED_KEY] !== false; // default on
    setToggleUi(enabled);
    render(list);
    renderKeywords(keywords);
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
    const [list, keywords] = await Promise.all([getList(), getKeywords()]);
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mutedHandles: list.map(normalize).filter(Boolean).sort(),
      mutedKeywords: keywords.map(normalizeKeyword).filter(Boolean).sort(),
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
      let keywords = [];

      // JSON export from this extension
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          handles = data;
        } else if (Array.isArray(data.mutedHandles)) {
          handles = data.mutedHandles;
          keywords = Array.isArray(data.mutedKeywords) ? data.mutedKeywords : [];
        } else if (Array.isArray(data.handles)) {
          handles = data.handles;
          keywords = Array.isArray(data.keywords) ? data.keywords : [];
        }
      } catch {
        // plain text: one handle per line
        handles = text.split(/[\n,]+/).map((s) => s.trim());
      }

      handles = handles.map(normalize).filter(Boolean);
      keywords = keywords.map(normalizeKeyword).filter(Boolean);

      if (!handles.length && !keywords.length) {
        alert("No handles or keywords found in that file.");
        return;
      }

      const parts = [];
      if (handles.length) parts.push(`${handles.length} handle(s)`);
      if (keywords.length) parts.push(`${keywords.length} keyword(s)`);
      const merge = confirm(
        `Found ${parts.join(" and ")}.\n\nOK = merge with current lists\nCancel = replace current lists`
      );
      // confirm: OK=true merge, Cancel=false replace

      const [nextHandles, nextKeywords] = await Promise.all([
        (async () => {
          if (!handles.length) return null;
          if (merge) {
            const existing = await getList();
            return Array.from(new Set([...existing.map(normalize), ...handles]));
          }
          return Array.from(new Set(handles));
        })(),
        (async () => {
          if (!keywords.length) return null;
          if (merge) {
            const existing = await getKeywords();
            return Array.from(new Set([...existing.map(normalizeKeyword), ...keywords]));
          }
          return Array.from(new Set(keywords));
        })(),
      ]);

      if (nextHandles !== null) {
        await chrome.storage.sync.set({ [STORAGE_KEY]: nextHandles });
        notifyTab({ type: "SET_LIST", handles: nextHandles });
        render(nextHandles);
      }
      if (nextKeywords !== null) {
        await chrome.storage.sync.set({ [KEYWORDS_KEY]: nextKeywords });
        notifyTab({ type: "SET_KEYWORDS", keywords: nextKeywords });
        renderKeywords(nextKeywords);
      }
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
    if (changes[KEYWORDS_KEY]) {
      const list = Array.isArray(changes[KEYWORDS_KEY].newValue)
        ? changes[KEYWORDS_KEY].newValue
        : [];
      renderKeywords(list);
    }
    if (changes[ENABLED_KEY]) {
      setToggleUi(changes[ENABLED_KEY].newValue !== false);
    }
  });

  load();
})();
