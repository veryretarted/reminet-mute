(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const KEYWORDS_KEY = "mutedKeywords";
  const ENABLED_KEY = "muteEnabled";
  const STATS_KEY = "coalStats";
  const PROCESSED_ATTR = "data-rm-mute-processed";
  const MUTED_CLASS = "rm-mute-hidden";
  const BTN_CLASS = "rm-mute-btn";
  const STATUS_ID = "rm-mute-status";
  const SPACER_ID = "rm-mute-assist-spacer";

  /** @type {Set<string>} */
  let muted = new Set();
  /**
   * Keyword entries: { text: string, partial: boolean }
   * @type {Array<{text: string, partial: boolean}>}
   */
  let keywords = [];
  let muteEnabled = true;
  let chatReady = false;
  let historyAssist = false;
  let assistRunning = false;
  let observer = null;
  let applyScheduled = false;
  let scrollBound = false;

  const SEEN_POSTS_KEY = "coalSeenPosts";
  const SEEN_WORDS_KEY = "coalSeenWords";

  /** Unique message ids already counted (persisted). */
  const seenPostIds = new Set();
  const seenWordIds = new Set();
  let lifetimePosts = 0;
  let lifetimeWords = 0;
  let statsChain = Promise.resolve();

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function emptyStats() {
    return {
      posts: { all: 0, byDay: {} },
      words: { all: 0, byDay: {} },
    };
  }

  function loadStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STATS_KEY, SEEN_POSTS_KEY, SEEN_WORDS_KEY],
        (result) => {
          const stats = result[STATS_KEY] || emptyStats();
          lifetimePosts = stats.posts?.all || 0;
          lifetimeWords = stats.words?.all || 0;
          const posts = result[SEEN_POSTS_KEY] || {};
          const words = result[SEEN_WORDS_KEY] || {};
          for (const id of Object.keys(posts)) seenPostIds.add(id);
          for (const id of Object.keys(words)) seenWordIds.add(id);
          resolve();
        }
      );
    });
  }

  function loadMuted() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        [STORAGE_KEY, ENABLED_KEY, KEYWORDS_KEY],
        (result) => {
          const list = Array.isArray(result[STORAGE_KEY])
            ? result[STORAGE_KEY]
            : [];
          muted = new Set(list.map((h) => String(h).toLowerCase()));
          muteEnabled = result[ENABLED_KEY] !== false;
          keywords = normalizeKeywordList(result[KEYWORDS_KEY]);
          resolve();
        }
      );
    });
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

  function saveMuted() {
    chrome.storage.sync.set({ [STORAGE_KEY]: Array.from(muted) });
  }

  function saveKeywords() {
    chrome.storage.sync.set({ [KEYWORDS_KEY]: keywords });
  }

  function normalize(handle) {
    if (!handle) return "";
    return String(handle)
      .trim()
      .replace(/^~/, "")
      .replace(/^@/, "")
      .toLowerCase();
  }

  /** Filtering active for any reason (users and/or keywords). */
  function hasActiveFilters() {
    return muted.size > 0 || keywords.length > 0;
  }

  function shouldHide() {
    return chatReady && muteEnabled && hasActiveFilters();
  }

  /**
   * Message body text only. Never includes username/handle, timestamps,
   * or other row chrome. Returns "" if nothing usable is left.
   */
  function getMessageBodyText(row) {
    const handle = extractHandle(row);
    const clone = row.cloneNode(true);
    if (clone.querySelector) {
      clone
        .querySelectorAll(
          [
            ".author-chip",
            "[class*='author-chip']",
            "[class*='AuthorChip']",
            "a[href*='~']",
            "." + BTN_CLASS,
            ".message-actions",
            ".message-action-bar",
            ".message-row__secondary",
            ".message-row__meta",
            "time",
            "[datetime]",
          ].join(", ")
        )
        .forEach((el) => el.remove());
    }

    const bodyEl = clone.querySelector(
      [
        ".message-row__body",
        ".message-body",
        ".message-text",
        ".draft-message__text",
        ".draft-message__body",
        "[class*='message-body']",
        "[class*='MessageBody']",
      ].join(", ")
    );
    // Do NOT use .message-row__content — that wrapper includes the author chip
    let text = (
      (bodyEl || clone).innerText ||
      (bodyEl || clone).textContent ||
      ""
    ).toLowerCase();

    if (handle) {
      const h = handle.toLowerCase();
      text = text.split(h).join(" ");
      text = text.split("@" + h).join(" ");
      text = text.split("~" + h).join(" ");
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function rowMatchesKeyword(row) {
    if (!keywords.length) return false;
    const text = getMessageBodyText(row);
    if (text === null || text === "") return false;

    for (const { text: kw, partial } of keywords) {
      if (!kw) continue;
      if (partial) {
        if (text.includes(kw)) return true;
      } else {
        // whole word: unicode-aware-ish boundary
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(
          `(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`,
          "iu"
        );
        if (re.test(text)) return true;
      }
    }
    return false;
  }

  function rowMatchesUser(row) {
    const h = row.dataset.rmHandle || extractHandle(row);
    return !!(h && muted.has(h));
  }

  function muteHandle(handle) {
    const h = normalize(handle);
    if (!h) return;
    muted.add(h);
    saveMuted();
    scheduleApply();
  }

  function unmuteHandle(handle) {
    const h = normalize(handle);
    if (!h) return;
    muted.delete(h);
    saveMuted();
    scheduleApply();
  }

  function extractHandle(row) {
    const links = row.querySelectorAll('a[href*="~"]');
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/(?:^|\/)~([a-zA-Z0-9_.\-]+)/);
      if (m) return normalize(m[1]);
    }
    const dataAuthor =
      row.getAttribute("data-author") || row.getAttribute("data-handle");
    if (dataAuthor) return normalize(dataAuthor);
    return "";
  }

  function findMessageRows(root = document) {
    const nodeList = root.querySelectorAll?.(
      "div.message-row[data-message-id], div.message-row, div.draft-message"
    );
    if (!nodeList || !nodeList.length) return [];
    const seen = new Set();
    const out = [];
    for (const el of nodeList) {
      if (seen.has(el)) continue;
      const parentRow = el.parentElement?.closest?.(
        ".message-row, .draft-message"
      );
      if (parentRow && parentRow !== el) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function isDraftRow(row) {
    return row.classList?.contains("draft-message");
  }

  function getScroller() {
    return document.querySelector(".message-list__scroll") || null;
  }

  function getContent() {
    return document.querySelector(".message-list__content") || null;
  }

  function getMessageList() {
    return document.querySelector(".message-list") || null;
  }

  function isSystemWelcomePresent() {
    const root =
      document.querySelector(".message-list") ||
      document.querySelector(".global-chat-panel") ||
      document.body;
    if (!root) return false;
    const text = root.innerText || root.textContent || "";
    if (/welcome to remilianet global chat/i.test(text)) return true;
    return (
      document.querySelectorAll("div.message-row[data-message-id]").length >= 20
    );
  }

  function markChatReadyIfNeeded() {
    if (chatReady) return false;
    if (!isSystemWelcomePresent()) return false;
    chatReady = true;
    return true;
  }

  function countLoaded() {
    const rows = document.querySelectorAll("div.message-row[data-message-id]");
    let total = 0;
    let posts = 0;
    let words = 0;
    for (const row of rows) {
      total += 1;
      const byUser = rowMatchesUser(row);
      const byKw = rowMatchesKeyword(row);
      if (byUser) posts += 1;
      if (byKw) words += 1;
    }
    return {
      total,
      posts,
      words,
      mutedCount: posts + words,
      visible: total - Math.min(total, posts + words),
    };
  }

  function bumpStats(kind, messageId) {
    if (!messageId) return;
    const seen = kind === "post" ? seenPostIds : seenWordIds;
    if (seen.has(messageId)) return;
    seen.add(messageId);
    if (kind === "post") lifetimePosts += 1;
    else lifetimeWords += 1;

    statsChain = statsChain.then(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.get(
            [STATS_KEY, SEEN_POSTS_KEY, SEEN_WORDS_KEY],
            (result) => {
              const stats = result[STATS_KEY] || emptyStats();
              const seenKey = kind === "post" ? SEEN_POSTS_KEY : SEEN_WORDS_KEY;
              const seenMap = result[seenKey] || {};
              if (seenMap[messageId]) {
                resolve();
                return;
              }
              seenMap[messageId] = todayKey();
              const bucket = kind === "post" ? "posts" : "words";
              stats[bucket] = stats[bucket] || { all: 0, byDay: {} };
              stats[bucket].all = (stats[bucket].all || 0) + 1;
              stats[bucket].byDay = stats[bucket].byDay || {};
              const day = todayKey();
              stats[bucket].byDay[day] = (stats[bucket].byDay[day] || 0) + 1;
              chrome.storage.local.set(
                { [STATS_KEY]: stats, [seenKey]: seenMap },
                () => resolve()
              );
            }
          );
        })
    );
  }

  function ensureMuteButton(row, handle) {
    if (!handle || isDraftRow(row)) return;
    if (row.querySelector(`.${BTN_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.dataset.handle = handle;
    const listed = muted.has(handle);
    btn.textContent = listed ? "Unmute" : "Mute";
    btn.title = listed ? `Unmute @${handle}` : `Mute @${handle}`;
    btn.setAttribute("aria-label", btn.title);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const h = btn.dataset.handle;
      if (muted.has(h)) unmuteHandle(h);
      else muteHandle(h);
    });

    const actions =
      row.querySelector(".message-actions") ||
      row.querySelector(".message-action-bar") ||
      row.querySelector(".message-row__secondary") ||
      row.querySelector(".message-row__content");

    if (actions) actions.appendChild(btn);
    else row.appendChild(btn);
  }

  function processRow(row) {
    if (!(row instanceof Element)) return;
    if (
      !row.classList.contains("message-row") &&
      !row.classList.contains("draft-message")
    ) {
      return;
    }

    const handle = extractHandle(row);
    if (handle) {
      row.setAttribute(PROCESSED_ATTR, handle);
      row.dataset.rmHandle = handle;
    } else if (!row.hasAttribute(PROCESSED_ATTR)) {
      row.setAttribute(PROCESSED_ATTR, "pending");
    }

    const byUser = shouldHide() && handle && muted.has(handle);
    // Keywords: only when body text is available — never whole-row fallback
    const byKw = shouldHide() && rowMatchesKeyword(row);
    const hide = !!(byUser || byKw);
    row.classList.toggle(MUTED_CLASS, hide);

    if (hide && !isDraftRow(row)) {
      const mid =
        row.getAttribute("data-message-id") ||
        row.dataset.messageId ||
        "";
      if (byUser) bumpStats("post", mid || `u:${handle}:${row.textContent?.slice(0, 40)}`);
      if (byKw) bumpStats("word", mid || `k:${row.textContent?.slice(0, 40)}`);
    }

    if (handle && !isDraftRow(row)) {
      ensureMuteButton(row, handle);
      const btn = row.querySelector(`.${BTN_CLASS}`);
      if (btn) {
        const listed = muted.has(handle);
        btn.textContent = listed ? "Unmute" : "Mute";
        btn.title = listed ? `Unmute @${handle}` : `Mute @${handle}`;
      }
    }
  }

  function formatStatus(posts, words) {
    const life = lifetimePosts + lifetimeWords;
    const lifeBit = `(lifetime coal: ${life})`;
    let loaded = "";
    if (posts > 0 && words > 0) {
      const p = posts === 1 ? "1 coalpost" : `${posts} coalposts`;
      const w = words === 1 ? "1 coalword" : `${words} coalwords`;
      loaded = `${p} and ${w} avoided in loaded chat`;
    } else if (posts > 0) {
      loaded =
        posts === 1
          ? "1 coalpost avoided in loaded chat"
          : `${posts} coalposts avoided in loaded chat`;
    } else if (words > 0) {
      loaded =
        words === 1
          ? "1 coalword avoided in loaded chat"
          : `${words} coalwords avoided in loaded chat`;
    }
    if (loaded) return `${loaded} ${lifeBit}`;
    if (life > 0) return lifeBit;
    return "";
  }

  function updateStatusChip() {
    const list = getMessageList();
    const scroller = getScroller();
    let chip = document.getElementById(STATUS_ID);

    if (chip && scroller && scroller.contains(chip)) {
      chip.remove();
      chip = null;
    }

    // Show the bar whenever filters exist so the user can pause/resume from chat
    if (!(chatReady && hasActiveFilters())) {
      if (chip) chip.hidden = true;
      return;
    }

    const { posts, words } = countLoaded();
    if (!list) return;

    if (!chip) {
      chip = document.createElement("div");
      chip.id = STATUS_ID;
      chip.className = "rm-mute-status";
      if (scroller && scroller.parentElement === list) {
        list.insertBefore(chip, scroller);
      } else {
        list.prepend(chip);
      }
    }

    // Ensure toggle button exists
    let btn = chip.querySelector(".rm-mute-status-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rm-mute-status-toggle";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        muteEnabled = !muteEnabled;
        chrome.storage.sync.set({ [ENABLED_KEY]: muteEnabled });
        scheduleApply();
      });
      chip.appendChild(btn);
    }
    btn.textContent = muteEnabled ? "Pause" : "Resume";
    btn.title = muteEnabled
      ? "Temporarily show everyone (lists kept)"
      : "Resume hiding muted users and keywords";

    if (historyAssist) {
      chip.hidden = false;
      chip.dataset.paused = muteEnabled ? "0" : "1";
      // keep existing text nodes but set status text before the button
      setChipText(chip, "Loading older messages…");
      return;
    }

    const label = formatStatus(posts, words);
    chip.dataset.paused = muteEnabled ? "0" : "1";
    if (label || !muteEnabled) {
      chip.hidden = false;
      const pausedNote = muteEnabled ? "" : " · paused";
      setChipText(chip, (label || "No matches in loaded chat") + pausedNote);
    } else {
      chip.hidden = true;
    }
  }

  function setChipText(chip, text) {
    // Preserve the toggle button; replace only the text node
    let textNode = chip.querySelector(".rm-mute-status-text");
    if (!textNode) {
      textNode = document.createElement("span");
      textNode.className = "rm-mute-status-text";
      chip.insertBefore(textNode, chip.firstChild);
    }
    textNode.textContent = text;
  }

  function ensureAssistSpacer(on) {
    const content = getContent();
    let spacer = document.getElementById(SPACER_ID);
    if (!on) {
      spacer?.remove();
      return;
    }
    if (!content) return;
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.id = SPACER_ID;
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.cssText =
        "height:1200px;width:100%;flex-shrink:0;pointer-events:none;opacity:0;";
      content.insertBefore(spacer, content.firstChild);
    }
  }

  function scrollToBottom(scroller) {
    if (!scroller) return;
    const jump = () => {
      scroller.scrollTop = scroller.scrollHeight;
    };
    jump();
    requestAnimationFrame(() => {
      jump();
      requestAnimationFrame(jump);
    });
    setTimeout(jump, 50);
    setTimeout(jump, 200);
  }

  function nudgeHistoryLoader() {
    const scroller = getScroller();
    if (!scroller) return;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    scroller.scrollTop = Math.min(scroller.scrollHeight, 90);
    requestAnimationFrame(() => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
  }

  async function runHistoryAssist({ rounds = 6, returnToBottom = true } = {}) {
    if (assistRunning) return;
    // Any active filter (users or keywords) can short the list
    if (!chatReady || !muteEnabled || !hasActiveFilters()) return;

    const scroller = getScroller();
    if (!scroller) return;

    assistRunning = true;
    historyAssist = true;
    updateStatusChip();
    ensureAssistSpacer(true);
    applyAllNow();

    let idle = 0;
    for (let i = 0; i < rounds; i++) {
      const before = document.querySelectorAll(
        "div.message-row[data-message-id]"
      ).length;
      nudgeHistoryLoader();
      await new Promise((r) => setTimeout(r, 400));
      for (const row of findMessageRows()) processRow(row);
      const after = document.querySelectorAll(
        "div.message-row[data-message-id]"
      ).length;
      if (after <= before) idle += 1;
      else idle = 0;
      if (after >= 100) break;
      if (idle >= 3) break;
    }

    ensureAssistSpacer(false);
    historyAssist = false;
    applyAllNow();

    if (returnToBottom) {
      scrollToBottom(scroller);
    }

    assistRunning = false;
    updateStatusChip();
  }

  function listIsTooShort() {
    const scroller = getScroller();
    if (!scroller) return false;
    if (scroller.scrollHeight <= scroller.clientHeight + 24) return true;
    const { total, posts, words } = countLoaded();
    const hidden = Math.min(total, posts + words);
    const visible = total - hidden;
    return visible < 12;
  }

  function bindScrollAssist() {
    if (scrollBound) return;
    const scroller = getScroller();
    if (!scroller) return;
    scrollBound = true;

    scroller.addEventListener(
      "scroll",
      () => {
        if (!shouldHide()) return;
        if (scroller.scrollTop < 120) {
          for (const row of findMessageRows()) processRow(row);
          updateStatusChip();
        }
      },
      { passive: true }
    );
  }

  function applyAllNow() {
    const rows = findMessageRows();
    for (const row of rows) processRow(row);
    updateStatusChip();
    const scroller = getScroller();
    scroller?.classList.toggle("rm-mute-filtering", shouldHide());
  }

  function applyAll() {
    const becameReady = markChatReadyIfNeeded();
    applyAllNow();
    bindScrollAssist();

    if (becameReady && muteEnabled && hasActiveFilters()) {
      requestAnimationFrame(() => {
        if (listIsTooShort()) {
          runHistoryAssist({ rounds: 8, returnToBottom: true });
        }
      });
    } else if (
      chatReady &&
      muteEnabled &&
      hasActiveFilters() &&
      listIsTooShort() &&
      !assistRunning
    ) {
      runHistoryAssist({ rounds: 6, returnToBottom: true });
    }
  }

  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      applyAll();
    });
  }

  function onMutations(mutations) {
    let needs = false;
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("div.message-row, div.draft-message")) {
          processRow(node);
          needs = true;
        } else if (node.querySelector?.("div.message-row, div.draft-message")) {
          needs = true;
        }
      }
    }
    if (markChatReadyIfNeeded()) {
      scheduleApply();
      return;
    }
    if (needs) updateStatusChip();
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(onMutations);
    const root =
      document.querySelector(".message-list") ||
      document.querySelector(".global-chat-panel") ||
      document.documentElement;
    observer.observe(root, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let dirty = false;
    if (changes[STORAGE_KEY]) {
      const list = Array.isArray(changes[STORAGE_KEY].newValue)
        ? changes[STORAGE_KEY].newValue
        : [];
      muted = new Set(list.map((h) => String(h).toLowerCase()));
      dirty = true;
    }
    if (changes[KEYWORDS_KEY]) {
      keywords = normalizeKeywordList(changes[KEYWORDS_KEY].newValue);
      dirty = true;
    }
    if (changes[ENABLED_KEY]) {
      muteEnabled = changes[ENABLED_KEY].newValue !== false;
      dirty = true;
    }
    if (dirty) scheduleApply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GET_MUTED") {
      sendResponse({
        muted: Array.from(muted),
        keywords,
        enabled: muteEnabled,
        chatReady,
      });
      return true;
    }
    if (msg?.type === "UNMUTE") {
      unmuteHandle(msg.handle);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "MUTE") {
      muteHandle(msg.handle);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "CLEAR_ALL") {
      muted.clear();
      saveMuted();
      scheduleApply();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "SET_ENABLED") {
      muteEnabled = msg.enabled !== false;
      chrome.storage.sync.set({ [ENABLED_KEY]: muteEnabled });
      scheduleApply();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "SET_LIST") {
      const list = Array.isArray(msg.handles) ? msg.handles : [];
      muted = new Set(list.map((h) => String(h).toLowerCase()));
      saveMuted();
      scheduleApply();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === "SET_KEYWORDS") {
      keywords = normalizeKeywordList(msg.keywords);
      saveKeywords();
      scheduleApply();
      sendResponse({ ok: true });
      return true;
    }
  });

  async function init() {
    await loadMuted();
    await loadStats();
    applyAll();
    startObserver();

    const readyPoll = setInterval(() => {
      if (markChatReadyIfNeeded()) {
        applyAll();
        clearInterval(readyPoll);
      }
    }, 300);

    setInterval(() => {
      const pending = document.querySelectorAll(
        `div.message-row:not([${PROCESSED_ATTR}]), div.message-row[${PROCESSED_ATTR}="pending"], div.draft-message:not([${PROCESSED_ATTR}]), div.draft-message[${PROCESSED_ATTR}="pending"]`
      );
      if (pending.length) {
        for (const row of pending) processRow(row);
      }
      if (chatReady && muteEnabled && hasActiveFilters()) updateStatusChip();
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
