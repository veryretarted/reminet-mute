(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const ENABLED_KEY = "muteEnabled";
  const PROCESSED_ATTR = "data-rm-mute-processed";
  const MUTED_CLASS = "rm-mute-hidden";
  const BTN_CLASS = "rm-mute-btn";
  const STATUS_ID = "rm-mute-status";
  const SPACER_ID = "rm-mute-assist-spacer";

  /** @type {Set<string>} */
  let muted = new Set();
  let muteEnabled = true;
  /** Wait for SYSTEM welcome before filtering */
  let chatReady = false;
  /** UI-only: status chip shows loading; muted rows stay hidden */
  let historyAssist = false;
  let assistRunning = false;
  let observer = null;
  let applyScheduled = false;
  let scrollBound = false;

  function loadMuted() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEY, ENABLED_KEY], (result) => {
        const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        muted = new Set(list.map((h) => String(h).toLowerCase()));
        muteEnabled = result[ENABLED_KEY] !== false;
        resolve(muted);
      });
    });
  }

  function saveMuted() {
    chrome.storage.sync.set({ [STORAGE_KEY]: Array.from(muted) });
  }

  function normalize(handle) {
    if (!handle) return "";
    return String(handle)
      .trim()
      .replace(/^~/, "")
      .replace(/^@/, "")
      .toLowerCase();
  }

  function shouldHide() {
    return chatReady && muteEnabled && muted.size > 0;
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
      const parentRow = el.parentElement?.closest?.(".message-row, .draft-message");
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
    return document.querySelectorAll("div.message-row[data-message-id]").length >= 20;
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
    let mutedCount = 0;
    for (const row of rows) {
      total += 1;
      const h = row.dataset.rmHandle || extractHandle(row);
      if (h && muted.has(h)) mutedCount += 1;
    }
    return { total, mutedCount, visible: total - mutedCount };
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
    if (!handle) {
      if (!row.hasAttribute(PROCESSED_ATTR)) {
        row.setAttribute(PROCESSED_ATTR, "pending");
      }
      return;
    }

    row.setAttribute(PROCESSED_ATTR, handle);
    row.dataset.rmHandle = handle;

    const hide = shouldHide() && muted.has(handle);
    row.classList.toggle(MUTED_CLASS, hide);

    if (!isDraftRow(row)) {
      ensureMuteButton(row, handle);
      const btn = row.querySelector(`.${BTN_CLASS}`);
      if (btn) {
        const listed = muted.has(handle);
        btn.textContent = listed ? "Unmute" : "Mute";
        btn.title = listed ? `Unmute @${handle}` : `Mute @${handle}`;
      }
    }
  }

  function updateStatusChip() {
    const list = getMessageList();
    const scroller = getScroller();
    let chip = document.getElementById(STATUS_ID);

    if (chip && scroller && scroller.contains(chip)) {
      chip.remove();
      chip = null;
    }

    if (!(chatReady && muteEnabled && muted.size > 0)) {
      if (chip) chip.hidden = true;
      return;
    }

    const { mutedCount } = countLoaded();
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

    if (historyAssist) {
      chip.hidden = false;
      chip.textContent = "Loading older messages…";
      return;
    }

    if (mutedCount > 0) {
      chip.hidden = false;
      chip.textContent =
        mutedCount === 1
          ? "1 coalpost avoided"
          : `${mutedCount} coalposts avoided`;
    } else {
      chip.hidden = true;
    }
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
    // Catch late layout after muted rows collapse
    setTimeout(jump, 50);
    setTimeout(jump, 200);
  }

  /** Nudge Remilia's top-sentinel loader. */
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

  /**
   * Buffer older history without showing muted users.
   * Uses a tall invisible spacer so the list can scroll and Remilia's
   * sentinel can fire; muted rows stay display:none the whole time.
   */
  async function runHistoryAssist({ rounds = 6, returnToBottom = true } = {}) {
    if (assistRunning) return;
    if (!chatReady || !muteEnabled || muted.size === 0) return;

    const scroller = getScroller();
    if (!scroller) return;

    assistRunning = true;
    historyAssist = true;
    updateStatusChip();
    ensureAssistSpacer(true);

    // Keep mutes applied — never unhide coal during assist
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
    const { visible } = countLoaded();
    return visible < 12;
  }

  function bindScrollAssist() {
    if (scrollBound) return;
    const scroller = getScroller();
    if (!scroller) return;
    scrollBound = true;

    // Do NOT run history assist while the user scrolls — that blanked the
    // chat when new chunks loaded. After the initial assist, Remilia's own
    // sentinel handles older pages; we only hide new muted rows as they appear.
    scroller.addEventListener(
      "scroll",
      () => {
        if (!shouldHide()) return;
        // Keep filtered state consistent if React recycled nodes
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

    if (becameReady && muteEnabled && muted.size > 0) {
      requestAnimationFrame(() => {
        if (listIsTooShort()) {
          runHistoryAssist({ rounds: 8, returnToBottom: true });
        }
      });
    } else if (
      chatReady &&
      muteEnabled &&
      muted.size > 0 &&
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
    if (changes[ENABLED_KEY]) {
      muteEnabled = changes[ENABLED_KEY].newValue !== false;
      dirty = true;
    }
    if (dirty) scheduleApply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GET_MUTED") {
      sendResponse({ muted: Array.from(muted), enabled: muteEnabled, chatReady });
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
  });

  async function init() {
    await loadMuted();
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
      if (chatReady && muteEnabled && muted.size > 0) updateStatusChip();
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
