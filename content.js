(() => {
  "use strict";

  const STORAGE_KEY = "mutedHandles";
  const KEYWORDS_KEY = "mutedKeywords";
  const ENABLED_KEY = "muteEnabled";
  const REPLACE_KEY = "replaceMode";
  const COAL_ATTACH_KEY = "coalHideAttachments";
  const ATTACH_USERS_KEY = "attachmentHideHandles";
  const COAL_HANDLES = new Set(["gostphost", "njz"]);
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
  /** hide | milady | coal | bible */
  let replaceMode = "hide";
  let coalHideAttachments = false;
  /** @type {Set<string>} */
  let attachmentHide = new Set();
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
        [STORAGE_KEY, ENABLED_KEY, KEYWORDS_KEY, REPLACE_KEY, COAL_ATTACH_KEY, ATTACH_USERS_KEY],
        (result) => {
          const list = Array.isArray(result[STORAGE_KEY])
            ? result[STORAGE_KEY]
            : [];
          muted = new Set(list.map((h) => String(h).toLowerCase()));
          muteEnabled = result[ENABLED_KEY] !== false;
          replaceMode = result[REPLACE_KEY] || "hide";
          coalHideAttachments = result[COAL_ATTACH_KEY] === true;
          attachmentHide = new Set(
            Array.isArray(result[ATTACH_USERS_KEY])
              ? result[ATTACH_USERS_KEY].map((h) => String(h).toLowerCase())
              : []
          );
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

    if (!row.querySelector(".rm-mute-eye")) {
      const eye = document.createElement("button");
      eye.type = "button";
      eye.className = "rm-mute-eye";
      eye.textContent = "👁";
      eye.title = "Show this message for 5 seconds";
      eye.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        revealRow(row);
      });
      if (actions) actions.appendChild(eye);
      else row.appendChild(eye);
    }
  }

  function revealRow(row) {
    row.classList.add("rm-mute-revealed");
    row.classList.remove("rm-mute-soft");
    restoreOriginal(row);
    clearForcedAttachments(row, row.dataset.rmHandle || "");
    clearTimeout(row._rmReveal);
    row._rmReveal = setTimeout(() => {
      row.classList.remove("rm-mute-revealed");
      scheduleApply();
    }, 5000);
  }

  function markKeep(row) {
    row.querySelectorAll(
      "time, [class*='time'], [class*='Time'], [class*='timestamp'], [class*='Timestamp']"
    ).forEach((el) => el.classList.add("rm-mute-keep"));
  }


  const VERSES = [
    ["Genesis 2:1", "Thus the heavens and the earth were finished, and all the host of them."],
    ["Ruth 1:17", "Where thou diest, will I die, and there will I be buried."],
    ["Psalm 19:14", "Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight."],
    ["Psalm 23:4", "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me."],
    ["Psalm 51:7", "Purge me with hyssop, and I shall be clean: wash me, and I shall be whiter than snow."],
    ["Psalm 119:97", "O how love I thy law! it is my meditation all the day."],
    ["Ecclesiastes 6:11", "Seeing there be many things that increase vanity, what is man the better?"],
    ["Ecclesiastes 7:4", "The heart of the wise is in the house of mourning."],
    ["Ecclesiastes 7:10", "Say not thou, What is the cause that the former days were better than these?"],
    ["Ecclesiastes 9:10", "Whatsoever thy hand findeth to do, do it with thy might."],
    ["Isaiah 40:31", "But they that wait upon the Lord shall renew their strength."],
    ["Isaiah 41:10", "Fear thou not; for I am with thee."],
    ["Joel 2:31", "The sun shall be turned into darkness, and the moon into blood."],
    ["Malachi 3:2", "But who may abide the day of his coming?"],
    ["Matthew 19:24", "It is easier for a camel to go through the eye of a needle, than for a rich man to enter into the kingdom of God."],
    ["Luke 1:46", "My soul doth magnify the Lord, and my spirit hath rejoiced in God my Saviour."],
    ["Luke 12:2", "For there is nothing covered, that shall not be revealed."],
    ["Luke 12:32", "Fear not, little flock; for it is your Father's good pleasure to give you the kingdom."],
    ["John 1:17", "For the law was given by Moses, but grace and truth came by Jesus Christ."],
    ["John 11:25", "I am the resurrection, and the life."],
    ["John 16:33", "In the world ye shall have tribulation: but be of good cheer; I have overcome the world."],
    ["Acts 2:20", "The sun shall be turned into darkness, and the moon into blood."],
    ["Romans 8:38", "Neither death, nor life, nor angels, nor principalities, nor powers, shall be able to separate us from the love of God."],
    ["Romans 16:20", "And the God of peace shall bruise Satan under your feet shortly."],
    ["1 Corinthians 4:20", "For the kingdom of God is not in word, but in power."],
    ["1 Corinthians 15:51", "We shall not all sleep, but we shall all be changed."],
    ["2 Corinthians 3:5", "Not that we are sufficient of ourselves; but our sufficiency is of God."],
    ["Ephesians 6:11", "Put on the whole armour of God, that ye may be able to stand against the wiles of the devil."],
    ["Ephesians 6:13", "Take unto you the whole armour of God, that ye may be able to withstand in the evil day."],
    ["Hebrews 1:11", "They shall perish; but thou remainest; and they all shall wax old as doth a garment."],
    ["Hebrews 11:1", "Now faith is the substance of things hoped for, the evidence of things not seen."],
    ["Hebrews 13:6", "The Lord is my helper, and I will not fear what man shall do unto me."],
    ["Revelation 2:9", "I know thy works, and tribulation, and poverty."],
    ["Revelation 3:9", "Behold, I will make them to come and worship before thy feet."],
    ["Sirach 4:28", "Strive for the truth unto death, and the Lord shall fight for thee."]
  ];

  function verseFor(id) {
    let n = 0;
    const s = String(id || "");
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return VERSES[n % VERSES.length];
  }

  function messageBody(row) {
    return (
      row.querySelector(".message-row__body") ||
      row.querySelector(".message-body") ||
      row.querySelector(".message-text") ||
      row.querySelector("[class*='message-body']")
    );
  }

  function stashOriginal(body) {
    if (!body || body.querySelector(":scope > .rm-mute-original")) return;
    const wrap = document.createElement("span");
    wrap.className = "rm-mute-original";
    const kids = [...body.childNodes];
    for (const node of kids) {
      if (node.classList?.contains("rm-mute-swap")) continue;
      wrap.appendChild(node);
    }
    body.insertBefore(wrap, body.firstChild);
  }

  function restoreOriginal(row) {
    row.querySelectorAll(".rm-mute-original").forEach((wrap) => {
      const parent = wrap.parentElement;
      if (!parent) return;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      wrap.remove();
    });
    row.querySelectorAll(".rm-mute-swap, .rm-mute-cross, .rm-mute-cite-name").forEach((el) => el.remove());
    row.querySelectorAll(".rm-mute-avatar-hidden, .rm-mute-avatar-slot, .rm-mute-avatar-img, .rm-mute-name-hidden").forEach((el) => {
      el.classList.remove("rm-mute-avatar-hidden", "rm-mute-avatar-slot", "rm-mute-avatar-img", "rm-mute-name-hidden");
    });
    row.classList.remove("rm-mute-replaced", "is-milady", "is-coal", "is-bible");
  }

  function clearForcedAttachments(row, handle) {
    if (shouldHideAttachments(handle)) return;
    row.classList.remove("rm-coal-no-attach");
    row.querySelectorAll(".rm-coal-attach-hidden").forEach((el) => el.classList.remove("rm-coal-attach-hidden"));
  }

  function applyReplacement(row, on, info) {
    if (!on || row.classList.contains("rm-mute-revealed")) {
      restoreOriginal(row);
      return;
    }
    const body = messageBody(row);
    if (body) stashOriginal(body);
    row.classList.add("rm-mute-replaced");
    row.classList.toggle("is-milady", replaceMode === "milady");
    row.classList.toggle("is-coal", replaceMode === "coal");
    row.classList.toggle("is-bible", replaceMode === "bible");

    const host = body || row.querySelector(".message-row__content") || row;
    let swap = host.querySelector(":scope > .rm-mute-swap");
    if (!swap) {
      swap = document.createElement("span");
      swap.className = "rm-mute-swap";
      host.appendChild(swap);
    }
    const mid = row.getAttribute("data-message-id") || row.dataset.messageId || info.handle || "";
    if (replaceMode === "bible") {
      const [cite, quote] = verseFor(mid);
      swap.className = "rm-mute-swap is-verse";
      swap.textContent = quote;

      const bodyEl = messageBody(row);
      const imgs = [...row.querySelectorAll("img")].filter((img) => !bodyEl?.contains(img));
      const avatar = imgs[0] || null;
      const avatarWrap = avatar?.closest("a") || avatar?.parentElement;
      if (avatarWrap && !row.querySelector(".rm-mute-cross")) {
        avatarWrap.classList.add("rm-mute-avatar-hidden");
        const cross = document.createElement("span");
        cross.className = "rm-mute-cross";
        cross.textContent = "✝️";
        avatarWrap.parentElement?.insertBefore(cross, avatarWrap);
      }

      const name = row.querySelector(".author-chip") ||
        [...row.querySelectorAll("a[href*='~']")].find((a) => !a.querySelector("img") && !bodyEl?.contains(a));
      if (name) {
        name.classList.add("rm-mute-name-hidden");
        if (!row.querySelector(".rm-mute-cite-name")) {
          const citeEl = document.createElement("span");
          citeEl.className = "rm-mute-cite-name";
          citeEl.textContent = cite;
          name.parentElement?.insertBefore(citeEl, name);
        } else {
          row.querySelector(".rm-mute-cite-name").textContent = cite;
        }
      }
    } else if (replaceMode === "coal") {
      swap.className = "rm-mute-swap is-center";
      const who = info.handle ? `@${info.handle}` : "user";
      swap.textContent = info.byUser ? `coalpost by ${who} removed` : "coalposter avoided";
    } else {
      swap.className = "rm-mute-swap is-center";
      swap.textContent = "milady";
    }
  }

  function shouldHideAttachments(handle) {
    if (!handle) return false;
    if (attachmentHide.has(handle)) return true;
    // global on: every muted user, including pause and eye reveal
    if (coalHideAttachments && muted.has(handle)) return true;
    return false;
  }

  function applyCoalAttachmentFilter(row, handle, force) {
    if (row.classList.contains("rm-mute-revealed")) {
      row.classList.remove("rm-coal-no-attach");
      row.querySelectorAll(".rm-coal-attach-hidden").forEach((el) => el.classList.remove("rm-coal-attach-hidden"));
      return;
    }
    const on = !!force || shouldHideAttachments(handle);
    row.classList.toggle("rm-coal-no-attach", on);
    const body = messageBody(row);
    const nodes = row.querySelectorAll(
      "img, video, audio, [class*='attachment'], [class*='Attachment'], [class*='media'], [class*='Media']"
    );
    nodes.forEach((el) => {
      if (el.classList.contains("rm-mute-avatar-img")) return;
      if (el.closest(".author-chip, a[href*='~']") && !body?.contains(el)) return;
      el.classList.toggle("rm-coal-attach-hidden", on);
    });
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
    const mode = replaceMode || "hide";
    const draft = isDraftRow(row);
    // drafts (typing previews) are always fully hidden — never overlay or grey the chat
    const useSoft = hide && !draft && mode === "soft";
    const useReplace = hide && !draft && mode !== "hide" && mode !== "soft";
    row.classList.toggle(MUTED_CLASS, hide && !useReplace && !useSoft);
    row.classList.toggle("rm-mute-soft", useSoft);
    if (!useSoft) row.classList.remove("rm-mute-soft");
    markKeep(row);
    applyReplacement(row, useReplace, { byUser, byKw, handle, mode });

    if (hide && !isDraftRow(row)) {
      const mid =
        row.getAttribute("data-message-id") ||
        row.dataset.messageId ||
        "";
      if (byUser) bumpStats("post", mid || `u:${handle}:${row.textContent?.slice(0, 40)}`);
      if (byKw) bumpStats("word", mid || `k:${row.textContent?.slice(0, 40)}`);
    }

    applyCoalAttachmentFilter(row, handle, useReplace);

    if (handle && !isDraftRow(row)) {
      ensureMuteButton(row, handle);
      const btn = row.querySelector(`.${BTN_CLASS}`);
      if (btn) {
        const listed = muted.has(handle);
        btn.textContent = listed ? "Unmute" : "Mute";
        btn.title = listed ? `Unmute @${handle}` : `Mute @${handle}`;
      }
      const eye = row.querySelector(".rm-mute-eye");
      if (eye) eye.hidden = !(hide || useSoft || useReplace);
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
    if (changes[REPLACE_KEY]) {
      replaceMode = changes[REPLACE_KEY].newValue || "hide";
      dirty = true;
    }
    if (changes[COAL_ATTACH_KEY]) {
      coalHideAttachments = changes[COAL_ATTACH_KEY].newValue === true;
      dirty = true;
    }
    if (changes[ATTACH_USERS_KEY]) {
      const next = changes[ATTACH_USERS_KEY].newValue;
      attachmentHide = new Set(
        Array.isArray(next) ? next.map((h) => String(h).toLowerCase()) : []
      );
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
