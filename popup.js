(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const KEYWORDS_KEY = "mutedKeywords";
  const ENABLED_KEY = "muteEnabled";
  const STATS_KEY = "coalStats";

  /** Known coalposters — "Remove coal" mutes these. Future versions may add more. */
  const COAL_HANDLES = ["gostphost", "njz"];

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
  const containsToggle = document.getElementById("containsToggle");
  const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
  const clearKeywordsConfirm = document.getElementById("clearKeywordsConfirm");
  const clearKeywordsYes = document.getElementById("clearKeywordsYes");
  const clearKeywordsCancel = document.getElementById("clearKeywordsCancel");
  const shortKeywordConfirm = document.getElementById("shortKeywordConfirm");
  const shortKeywordMsg = document.getElementById("shortKeywordMsg");
  const shortKeywordYes = document.getElementById("shortKeywordYes");
  const shortKeywordCancel = document.getElementById("shortKeywordCancel");

  const itemConfirm = document.getElementById("itemConfirm");
  const itemConfirmMsg = document.getElementById("itemConfirmMsg");
  const itemConfirmKeep = document.getElementById("itemConfirmKeep");
  const itemConfirmCoal = document.getElementById("itemConfirmCoal");

  const statsTotal = document.getElementById("statsTotal");
  const statsBreakdown = document.getElementById("statsBreakdown");
  const statsRangeEl = document.getElementById("statsRange");

  let pendingShort = null;
  let pendingItem = null;
  let statsRange = "all";

  function normalize(handle) {
    return String(handle || "")
      .trim()
      .replace(/^~/, "")
      .replace(/^@/, "")
      .toLowerCase();
  }

  function normalizeKeywordList(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      let text = "";
      let partial = true;
      if (typeof item === "string") {
        text = item.trim().toLowerCase();
      } else if (item && typeof item === "object") {
        text = String(item.text || item.keyword || "")
          .trim()
          .toLowerCase();
        partial = item.partial !== false;
      }
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ text, partial: !!partial });
    }
    return out;
  }

  function modeLabel(partial) {
    return partial ? "Contains" : "Whole word";
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
      toggleHint.textContent = "Hiding muted users & keywords in chat";
    } else {
      toggleTitle.textContent = "Mutes paused";
      toggleHint.textContent = "Showing everyone · lists kept";
    }
  }

  function hideConfirms() {
    clearConfirm.hidden = true;
    clearKeywordsConfirm.hidden = true;
    shortKeywordConfirm.hidden = true;
    itemConfirm.hidden = true;
  }

  function askItemConfirm(kind, value) {
    hideConfirms();
    pendingItem = { kind, value };
    if (kind === "user") {
      itemConfirmMsg.textContent = `Are you sure you want to unmute ~${value} coalposts?`;
    } else {
      itemConfirmMsg.textContent = `Are you sure you want to stop filtering “${value}”?`;
    }
    itemConfirm.hidden = false;
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
      btn.addEventListener("click", () => askItemConfirm("user", h));

      li.appendChild(span);
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  function renderKeywords(list) {
    const sorted = normalizeKeywordList(list).sort((a, b) =>
      a.text.localeCompare(b.text)
    );
    keywordListEl.innerHTML = "";
    keywordEmptyEl.classList.toggle("hidden", sorted.length > 0);

    for (const entry of sorted) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "keyword";
      span.textContent = entry.text;

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "mode-chip";
      chip.textContent = modeLabel(entry.partial);
      chip.title = entry.partial
        ? "Contains — matches inside other words. Click to use whole word only."
        : "Whole word only. Click to match inside other words.";
      chip.addEventListener("click", () =>
        requestKeywordMode(entry.text, !entry.partial)
      );

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unmute";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => askItemConfirm("keyword", entry.text));

      li.appendChild(span);
      li.appendChild(chip);
      li.appendChild(btn);
      keywordListEl.appendChild(li);
    }
  }

  async function getList() {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function getKeywords() {
    const result = await chrome.storage.sync.get([KEYWORDS_KEY]);
    return normalizeKeywordList(result[KEYWORDS_KEY]);
  }

  async function setList(handles, { merge } = { merge: true }) {
    let next = handles.map(normalize).filter(Boolean);
    if (merge) {
      const existing = await getList();
      next = Array.from(new Set([...existing.map(normalize), ...next]));
    } else {
      next = Array.from(new Set(next));
    }
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    notifyTab({ type: "SET_LIST", handles: next });
    render(next);
    return next;
  }

  async function setKeywords(list) {
    const next = normalizeKeywordList(list);
    await chrome.storage.sync.set({ [KEYWORDS_KEY]: next });
    notifyTab({ type: "SET_KEYWORDS", keywords: next });
    renderKeywords(next);
    return next;
  }

  async function upsertKeyword(text, partial) {
    const kw = String(text || "").trim().toLowerCase();
    if (!kw) return;
    const existing = await getKeywords();
    const idx = existing.findIndex((e) => e.text === kw);
    if (idx >= 0) {
      existing[idx] = { text: kw, partial: !!partial };
      await setKeywords(existing);
      return;
    }
    await setKeywords([...existing, { text: kw, partial: !!partial }]);
  }

  function requestKeywordMode(text, partial) {
    const kw = String(text || "").trim().toLowerCase();
    if (!kw) return;
    if (kw.length < 4) {
      pendingShort = { text: kw, partial, fromToggle: true };
      const mode = modeLabel(partial);
      shortKeywordMsg.textContent = `"${kw}" is only ${kw.length} letter${
        kw.length === 1 ? "" : "s"
      }. Switch to ${mode}? Short keywords can hide most of chat.`;
      hideConfirms();
      shortKeywordConfirm.hidden = false;
      return;
    }
    upsertKeyword(kw, partial);
  }

  function sumDays(byDay, days) {
    if (!byDay) return 0;
    if (days == null) {
      return Object.values(byDay).reduce((a, b) => a + (b || 0), 0);
    }
    const now = new Date();
    let total = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      total += byDay[d.toISOString().slice(0, 10)] || 0;
    }
    return total;
  }

  async function renderStats() {
    const result = await chrome.storage.local.get([STATS_KEY]);
    const stats = result[STATS_KEY] || {
      posts: { all: 0, byDay: {} },
      words: { all: 0, byDay: {} },
    };
    let posts = 0;
    let words = 0;
    if (statsRange === "all") {
      posts = stats.posts?.all || 0;
      words = stats.words?.all || 0;
    } else if (statsRange === "7d") {
      posts = sumDays(stats.posts?.byDay, 7);
      words = sumDays(stats.words?.byDay, 7);
    } else {
      posts = sumDays(stats.posts?.byDay, 1);
      words = sumDays(stats.words?.byDay, 1);
    }
    statsTotal.textContent = String(posts + words);
    statsBreakdown.textContent = `${posts} coalpost${
      posts === 1 ? "" : "s"
    } · ${words} coalword${words === 1 ? "" : "s"}`;
  }

  function setStatsRange(range) {
    statsRange = range;
    for (const btn of statsRangeEl.querySelectorAll(".range-tab")) {
      btn.classList.toggle("is-active", btn.dataset.range === range);
    }
    renderStats();
  }

  async function load() {
    const result = await chrome.storage.sync.get([
      STORAGE_KEY,
      ENABLED_KEY,
      KEYWORDS_KEY,
    ]);
    const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    render(list);
    renderKeywords(result[KEYWORDS_KEY]);
    setToggleUi(result[ENABLED_KEY] !== false);
    await renderStats();
  }

  muteBtn.addEventListener("click", async () => {
    const h = normalize(inputEl.value);
    if (!h) return;
    inputEl.value = "";
    const list = await getList();
    if (!list.map(normalize).includes(h)) {
      await setList([h], { merge: true });
    } else {
      render(list);
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") muteBtn.click();
  });

  clearBtn.addEventListener("click", () => {
    hideConfirms();
    clearConfirm.hidden = false;
  });
  clearCancel.addEventListener("click", () => {
    clearConfirm.hidden = true;
  });
  clearYes.addEventListener("click", async () => {
    clearConfirm.hidden = true;
    await chrome.storage.sync.set({ [STORAGE_KEY]: [] });
    notifyTab({ type: "CLEAR_ALL" });
    render([]);
  });

  itemConfirmKeep.addEventListener("click", () => {
    itemConfirm.hidden = true;
    pendingItem = null;
  });
  itemConfirmCoal.addEventListener("click", async () => {
    const job = pendingItem;
    pendingItem = null;
    itemConfirm.hidden = true;
    if (!job) return;
    if (job.kind === "user") {
      const list = await getList();
      const next = list.map(normalize).filter((x) => x && x !== job.value);
      await chrome.storage.sync.set({ [STORAGE_KEY]: next });
      notifyTab({ type: "SET_LIST", handles: next });
      render(next);
    } else {
      const existing = await getKeywords();
      await setKeywords(existing.filter((e) => e.text !== job.value));
    }
  });

  enabledToggle.addEventListener("change", async () => {
    const enabled = enabledToggle.checked;
    await chrome.storage.sync.set({ [ENABLED_KEY]: enabled });
    notifyTab({ type: "SET_ENABLED", enabled });
    setToggleUi(enabled);
  });

  coalBtn.addEventListener("click", async () => {
    const list = await getList();
    const have = new Set(list.map(normalize));
    let added = 0;
    for (const h of COAL_HANDLES) {
      if (!have.has(h)) {
        have.add(h);
        added += 1;
      }
    }
    const next = Array.from(have);
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    notifyTab({ type: "SET_LIST", handles: next });
    render(next);
    const label = coalBtn.textContent;
    coalBtn.textContent = added ? `Muted ${added}` : "Already muted";
    setTimeout(() => {
      coalBtn.textContent = label;
    }, 1200);
  });

  async function tryAddKeyword() {
    const kw = String(keywordInputEl.value || "").trim().toLowerCase();
    if (!kw) return;
    const partial = containsToggle.checked;
    if (kw.length < 4) {
      pendingShort = { text: kw, partial, fromToggle: false };
      shortKeywordMsg.textContent = `"${kw}" is only ${kw.length} letter${
        kw.length === 1 ? "" : "s"
      }. Short keywords can hide most of chat. Block anyway as ${modeLabel(
        partial
      )}?`;
      hideConfirms();
      shortKeywordConfirm.hidden = false;
      return;
    }
    keywordInputEl.value = "";
    await upsertKeyword(kw, partial);
  }

  addKeywordBtn.addEventListener("click", () => tryAddKeyword());
  keywordInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryAddKeyword();
  });

  shortKeywordCancel.addEventListener("click", () => {
    shortKeywordConfirm.hidden = true;
    pendingShort = null;
  });
  shortKeywordYes.addEventListener("click", async () => {
    shortKeywordConfirm.hidden = true;
    if (pendingShort) {
      if (!pendingShort.fromToggle) keywordInputEl.value = "";
      await upsertKeyword(pendingShort.text, pendingShort.partial);
      pendingShort = null;
    }
  });

  clearKeywordsBtn.addEventListener("click", () => {
    hideConfirms();
    clearKeywordsConfirm.hidden = false;
  });
  clearKeywordsCancel.addEventListener("click", () => {
    clearKeywordsConfirm.hidden = true;
  });
  clearKeywordsYes.addEventListener("click", async () => {
    clearKeywordsConfirm.hidden = true;
    await setKeywords([]);
  });

  statsRangeEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".range-tab");
    if (!btn) return;
    setStatsRange(btn.dataset.range);
  });

  exportBtn.addEventListener("click", async () => {
    const list = await getList();
    const kws = await getKeywords();
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      mutedHandles: list.map(normalize).filter(Boolean).sort(),
      mutedKeywords: kws,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `remilianet-mute-list-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
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
      let kws = [];

      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          handles = data;
        } else {
          if (Array.isArray(data.mutedHandles)) handles = data.mutedHandles;
          else if (Array.isArray(data.handles)) handles = data.handles;
          if (Array.isArray(data.mutedKeywords)) kws = data.mutedKeywords;
          else if (Array.isArray(data.keywords)) kws = data.keywords;
        }
      } catch {
        handles = text.split(/[\n,]+/).map((s) => s.trim());
      }

      handles = handles.map(normalize).filter(Boolean);
      kws = normalizeKeywordList(kws);

      if (!handles.length && !kws.length) {
        alert("No handles or keywords found in that file.");
        return;
      }

      const parts = [];
      if (handles.length) parts.push(`${handles.length} handle(s)`);
      if (kws.length) parts.push(`${kws.length} keyword(s)`);
      const merge = confirm(
        `Found ${parts.join(" and ")}.\n\nOK = merge with current lists\nCancel = replace current lists`
      );

      if (handles.length) await setList(handles, { merge });
      if (kws.length) {
        if (merge) {
          const existing = await getKeywords();
          const map = new Map(existing.map((e) => [e.text, e]));
          for (const e of kws) map.set(e.text, e);
          await setKeywords(Array.from(map.values()));
        } else {
          await setKeywords(kws);
        }
      }
    } catch (err) {
      alert("Import failed: " + (err?.message || err));
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes[STORAGE_KEY]) {
        const list = Array.isArray(changes[STORAGE_KEY].newValue)
          ? changes[STORAGE_KEY].newValue
          : [];
        render(list);
      }
      if (changes[KEYWORDS_KEY]) {
        renderKeywords(changes[KEYWORDS_KEY].newValue);
      }
      if (changes[ENABLED_KEY]) {
        setToggleUi(changes[ENABLED_KEY].newValue !== false);
      }
    }
    if (area === "local" && changes[STATS_KEY]) {
      renderStats();
    }
  });

  load();
})();
