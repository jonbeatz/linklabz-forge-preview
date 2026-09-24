/* LinkLabz Forge — charcoal / amber / gold review board
   Static SPA. Persistence: localStorage key linklabz-forge-v1
*/
(() => {
  "use strict";

  const STORAGE_KEY = "linklabz-forge-v1.2";
  const UNDO_MS = 7000;
  const PROJECTS_BASE = [
    "Website-Templates",
    "DigitalStudioz",
    "Vader Desk",
    "VideoLab",
    "reWavz",
    "reWavz Studio",
    "PromptLab",
    "MSC",
    "Other",
  ];
  const BOOKMARK_TYPES = [
    "Design",
    "Template",
    "Tutorial",
    "YouTube harvest",
    "Skill",
    "Reference",
  ];
  const ACTIONS = ["implement", "cherrypick", "reference", "evaluate", "done", "pass"];
  const LANES = [
    { id: "inbox", label: "Inbox" },
    { id: "try", label: "Try It" },
    { id: "parked", label: "Parked" },
    { id: "skipped", label: "Skipped" },
  ];
  const HARDWARE_FITS = [
    "No hardware dependency",
    "RTX 5060 Ti 16GB",
    "RTX 4090 reference",
    "GTX 1660",
    "Spare PC",
  ];
  const RATING_RUBRIC = {
    1: "archive",
    2: "weak reference",
    3: "useful",
    4: "test/harvest",
    5: "strategic fit",
  };

  /** @type {{cards:any[],bookmarks:any[],spitballs:any[],todos:any[],version?:number}} */
  let state = { version: 1, cards: [], bookmarks: [], spitballs: [], todos: [] };

  let ui = {
    view: "board",
    layout: "sections",
    search: "",
    filterLane: "",
    filterCategory: "",
    filterPromoted: false,
    filterFavorites: false,
    filterProject: "",
    sort: "rating",
    drawerId: null,
    undoTimer: null,
    undoPayload: null,
    paletteOpen: false,
    paletteQuery: "",
    paletteIndex: 0,
    paletteItems: [],
    filterBookmarkType: "",
    searchOpen: false,
    todoStatusFilter: "all",
    todoProjectFilter: "",
    conceptSwapOrder: null,
    conceptFlowId: null,
    filtersOpen: false,
  };

  /** @type {string|null} */
  let sessionBaseline = null;
  let exportedThisSession = false;
  let backupNudgeShown = false;

  function normalizeCard(c) {
    if (!c || typeof c !== "object") return c;
    if (c.screenshotDriveUrl === undefined) c.screenshotDriveUrl = null;
    if (c.screenshot === undefined) c.screenshot = null;
    if (c.foundBy === undefined) c.foundBy = "";
    if (c.hardwareFit === undefined) c.hardwareFit = "No hardware dependency";
    if (c.revisitDate === undefined) c.revisitDate = "";
    if (!c.lane) c.lane = "inbox";
    if (!Array.isArray(c.cherryPick)) c.cherryPick = c.cherryPick ? [String(c.cherryPick)] : [];
    if (!Array.isArray(c.evidence)) c.evidence = [];
    if (c.protected === undefined) c.protected = false;
    if (c.linkedTodoId === undefined) c.linkedTodoId = null;
    if (c.fromSpitballId === undefined) c.fromSpitballId = null;
    return c;
  }

  function normalizeBookmark(b) {
    if (!b || typeof b !== "object") return b;
    if (b.bookmarkType === undefined) b.bookmarkType = "";
    if (b.favorite === undefined) b.favorite = false;
    return b;
  }

  function normalizeTodo(t) {
    if (!t || typeof t !== "object") return t;
    if (t.done === undefined) t.done = false;
    if (t.parked === undefined) t.parked = false;
    if (t.severity === undefined) t.severity = "med";
    if (t.goesTo === undefined) t.goesTo = t.project || "";
    if (t.order === undefined) t.order = 0;
    if (t.linkedCardId === undefined) t.linkedCardId = null;
    return t;
  }

  function projectList() {
    const set = new Set(PROJECTS_BASE);
    for (const c of state.cards) {
      if (c.goesTo) set.add(c.goesTo);
    }
    for (const t of state.todos || []) {
      if (t.goesTo) set.add(t.goesTo);
    }
    return [...set].sort((a, b) => {
      const ia = PROJECTS_BASE.indexOf(a);
      const ib = PROJECTS_BASE.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return { version: 1, cards: [], bookmarks: [], spitballs: [], todos: [] };
    }
    const cardsSrc = Array.isArray(raw.cards)
      ? raw.cards
      : Array.isArray(raw.reviews)
        ? raw.reviews
        : [];
    return {
      version: Number(raw.version) || 1,
      cards: cardsSrc.map(normalizeCard),
      bookmarks: (Array.isArray(raw.bookmarks) ? raw.bookmarks : []).map(normalizeBookmark),
      spitballs: Array.isArray(raw.spitballs) ? raw.spitballs : [],
      todos: (Array.isArray(raw.todos) ? raw.todos : []).map(normalizeTodo),
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
    updateSessionChip();
  }

  function fingerprintState() {
    return JSON.stringify(exportPayload());
  }

  function markSessionClean() {
    sessionBaseline = fingerprintState();
    updateSessionChip();
  }

  function updateSessionChip() {
    const chip = document.getElementById("session-chip");
    const label = document.getElementById("session-label");
    if (!chip) return;
    const dirty = sessionBaseline != null && fingerprintState() !== sessionBaseline;
    chip.classList.toggle("dirty", dirty);
    chip.title = dirty
      ? "Session · Dirty — unsaved changes vs last clean baseline"
      : "Session · Clean — matches last export/load/reset baseline";
    if (label) label.textContent = dirty ? "Session · Dirty" : "Session · Clean";
    maybeBackupNudge(dirty);
  }

  function maybeBackupNudge(dirty) {
    if (!dirty || exportedThisSession || backupNudgeShown) return;
    backupNudgeShown = true;
    setTimeout(() => {
      if (!exportedThisSession && sessionBaseline != null && fingerprintState() !== sessionBaseline) {
        toast("Session · Dirty — Download workspace when ready", {
          actionLabel: "Download",
          action: () => exportJson(),
        });
      }
    }, 1800);
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async function loadSeed() {
    const res = await fetch("data/seed.json");
    if (!res.ok) throw new Error("seed fetch failed");
    return normalizeState(await res.json());
  }

  async function init() {
    const stored = loadFromStorage();
    if (stored && Array.isArray(stored.cards) && stored.cards.length) {
      state = stored;
    } else {
      try {
        state = await loadSeed();
        for (const c of state.cards) c.protected = true;
        save();
      } catch (e) {
        console.error(e);
        toast("Could not load seed.json — serve via static server.");
      }
    }
    bindChrome();
    markSessionClean();
    render();
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function isMacPlatform() {
    return (
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "") ||
      /Mac OS/i.test(navigator.userAgent || "")
    );
  }

  function starsHtml(rating, emptyClass = "empty") {
    const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    let s = "";
    for (let i = 1; i <= 5; i++) {
      s += `<span class="${i <= r ? "" : emptyClass}">★</span>`;
    }
    return `<span class="stars" aria-label="${r} of 5 stars">${s}</span>`;
  }


  /** LinkLabz Forge title style: last word amber italic (or whole word if one). */
  function brandTitle(text) {
    const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return `<em>${escapeHtml(parts[0])}</em>`;
    const last = parts.pop();
    return `${parts.map(escapeHtml).join(" ")} <em>${escapeHtml(last)}</em>`;
  }


  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, { undo, action, actionLabel } = {}) {
    const host = document.getElementById("toast-host");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span>${escapeHtml(message)}</span>`;
    const fn = action || undo;
    if (fn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel || (undo ? "Undo" : "OK");
      btn.addEventListener("click", () => {
        fn();
        el.remove();
        if (undo && ui.undoTimer) {
          clearTimeout(ui.undoTimer);
          ui.undoTimer = null;
          ui.undoPayload = null;
        }
      });
      el.appendChild(btn);
    }
    host.appendChild(el);
    setTimeout(() => el.remove(), fn ? UNDO_MS + 200 : 3200);
  }

  function categories() {
    const set = new Set(state.cards.map((c) => c.category).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function cardSupportsPreview(c) {
    if (!c || !c.url || c.url === "#") return false;
    const cat = String(c.category || "").toLowerCase();
    const goes = String(c.goesTo || "");
    const url = String(c.url || "").toLowerCase();
    return (
      cat.includes("design") ||
      cat.includes("website") ||
      cat.includes("template") ||
      goes === "Website-Templates" ||
      url.includes("godui") ||
      url.includes("ui.glass")
    );
  }

  function screenshotSrc(c) {
    return c.screenshot || c.screenshotDriveUrl || null;
  }


  function parseSearchQuery(raw) {
    const ops = { lane: "", project: "", hardware: "", found: "", action: "", text: "" };
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    const textBits = [];
    for (const p of parts) {
      const m = /^(lane|project|hardware|found|action):(.+)$/i.exec(p);
      if (m) {
        const key = m[1].toLowerCase();
        const val = m[2].trim();
        if (key === "lane") ops.lane = val.toLowerCase();
        else if (key === "project") ops.project = val.toLowerCase();
        else if (key === "hardware") ops.hardware = val.toLowerCase();
        else if (key === "found") ops.found = val.toLowerCase();
        else if (key === "action") ops.action = val.toLowerCase();
      } else {
        textBits.push(p);
      }
    }
    ops.text = textBits.join(" ").toLowerCase();
    return ops;
  }

  function cardMatchesOps(c, ops) {
    if (ops.lane) {
      const lane = String(c.lane || "").toLowerCase();
      if (lane !== ops.lane && !(ops.lane === "try" && lane === "try it")) return false;
    }
    if (ops.project) {
      if (!String(c.goesTo || "").toLowerCase().includes(ops.project)) return false;
    }
    if (ops.hardware) {
      if (!String(c.hardwareFit || "").toLowerCase().includes(ops.hardware)) return false;
    }
    if (ops.found) {
      if (!String(c.foundBy || "").toLowerCase().includes(ops.found)) return false;
    }
    if (ops.action) {
      if (!String(c.action || "").toLowerCase().includes(ops.action)) return false;
    }
    if (ops.text) {
      const cherries = Array.isArray(c.cherryPick) ? c.cherryPick.join(" ") : "";
      const evidence = Array.isArray(c.evidence) ? c.evidence.map((e) => e.text || "").join(" ") : "";
      const hay = [
        c.title, c.category, c.recommendation, c.gradingSummary, c.goesTo, cherries,
        c.notes, c.relatedNotes, c.foundBy, c.hardwareFit, c.action, evidence, c.cursorBrief,
      ].join(" ").toLowerCase();
      if (!hay.includes(ops.text)) return false;
    }
    return true;
  }

  function filteredCards() {
    let list = [...state.cards];
    const ops = parseSearchQuery(ui.search);
    if (ops.lane || ops.project || ops.hardware || ops.found || ops.action || ops.text) {
      list = list.filter((c) => cardMatchesOps(c, ops));
    }
    if (ui.filterLane) list = list.filter((c) => c.lane === ui.filterLane);
    if (ui.filterCategory) list = list.filter((c) => c.category === ui.filterCategory);
    if (ui.filterPromoted) list = list.filter((c) => c.promoted);
    if (ui.filterFavorites) list = list.filter((c) => c.favorite);
    if (ui.filterProject) list = list.filter((c) => c.goesTo === ui.filterProject);

    if (ui.sort === "rating") {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title));
    } else if (ui.sort === "newest") {
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }

  function syncFilterChrome() {
    const laneSel = document.getElementById("filter-lane");
    if (laneSel) laneSel.value = ui.filterLane || "";
    const sortSel = document.getElementById("sort-by");
    if (sortSel) sortSel.value = ui.sort || "rating";
    const promo = document.getElementById("filter-promoted");
    if (promo) {
      promo.classList.toggle("on", ui.filterPromoted);
      promo.setAttribute("aria-pressed", String(ui.filterPromoted));
    }
    const fav = document.getElementById("filter-favorites");
    if (fav) {
      fav.classList.toggle("on", ui.filterFavorites);
      fav.setAttribute("aria-pressed", String(ui.filterFavorites));
    }
    document.querySelectorAll(".layout-toggle button").forEach((x) => {
      x.classList.toggle("active", x.dataset.layout === ui.layout);
    });
  }

  const dialogStack = [];
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function isFocusable(el) {
    if (!el || el.closest("[inert]")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest("[aria-hidden='true']")) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function focusableIn(root) {
    return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isFocusable);
  }

  function partialLockEls() {
    const roots = [
      document.querySelector(".island-brand"),
      document.querySelector(".island-overflow"),
      document.getElementById("nav"),
      document.getElementById("board-layout"),
      document.getElementById("board-surface"),
      document.getElementById("stats-strip"),
      document.getElementById("island-filters"),
    ].filter(Boolean);
    const tools = [...document.querySelectorAll("#island-tools button, #island-tools input, #island-tools select")]
      .filter((el) => el.id !== "btn-help");
    return [...roots, ...tools];
  }

  function clearPartialLock() {
    for (const el of partialLockEls()) {
      el.removeAttribute("inert");
      if (el.dataset.dialogLock === "1") {
        el.removeAttribute("aria-hidden");
        delete el.dataset.dialogLock;
      }
    }
  }

  function applyDialogBackground() {
    const app = document.getElementById("app");
    const open = dialogStack.length > 0;
    document.body.classList.toggle("scroll-lock", open);
    if (!open) {
      clearPartialLock();
      app?.removeAttribute("inert");
      app?.removeAttribute("aria-hidden");
      return;
    }
    const drawerOnly = dialogStack.every((entry) => entry.el.id === "drawer");
    if (drawerOnly) {
      app?.removeAttribute("inert");
      app?.removeAttribute("aria-hidden");
      for (const el of partialLockEls()) {
        el.setAttribute("inert", "");
        if (!el.dataset.dialogLock) {
          el.dataset.dialogLock = "1";
          el.setAttribute("aria-hidden", "true");
        }
      }
      return;
    }
    clearPartialLock();
    if (app) {
      app.setAttribute("inert", "");
      app.setAttribute("aria-hidden", "true");
    }
  }

  function beginDialog(dialogEl, opts = {}) {
    if (!dialogEl) return;
    const host = opts.host || dialogEl;
    const fresh = !dialogStack.some((entry) => entry.el === dialogEl);
    host.removeAttribute("inert");
    dialogEl.removeAttribute("inert");
    dialogEl.setAttribute("aria-modal", "true");
    dialogEl.setAttribute("aria-hidden", "false");
    if (!fresh) return;
    dialogStack.push({
      el: dialogEl,
      host,
      prevFocus: document.activeElement,
      close: typeof opts.close === "function" ? opts.close : null,
    });
    const picked = typeof opts.initial === "function" ? opts.initial() : opts.initial;
    const target = (picked && dialogEl.contains(picked) && picked) || focusableIn(dialogEl)[0] || dialogEl;
    if (typeof target.focus === "function") target.focus();
    applyDialogBackground();
    requestAnimationFrame(() => {
      if (dialogStack[dialogStack.length - 1]?.el !== dialogEl) return;
      if (dialogEl.contains(document.activeElement)) return;
      if (typeof target.focus === "function") target.focus();
    });
  }

  function endDialog(dialogEl) {
    if (!dialogEl) return;
    const idx = dialogStack.findIndex((entry) => entry.el === dialogEl);
    if (idx < 0) {
      dialogEl.setAttribute("aria-hidden", "true");
      dialogEl.setAttribute("inert", "");
      return;
    }
    const [entry] = dialogStack.splice(idx, 1);
    applyDialogBackground();
    const top = dialogStack[dialogStack.length - 1];
    const prev = entry.prevFocus;
    if (top) {
      const next = (prev && top.el.contains(prev) && prev) || focusableIn(top.el)[0] || top.el;
      if (typeof next.focus === "function") next.focus();
    } else if (prev && document.contains(prev)) {
      prev.focus();
    } else {
      document.getElementById("canvas")?.focus();
    }
    dialogEl.setAttribute("aria-hidden", "true");
    const host = entry.host || dialogEl;
    host.setAttribute("inert", "");
    if (host !== dialogEl) dialogEl.setAttribute("inert", "");
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !dialogStack.length) return;
    const top = dialogStack[dialogStack.length - 1].el;
    const nodes = focusableIn(top);
    if (!nodes.length) {
      e.preventDefault();
      top.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !top.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !top.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }, true);

  function openPalette() {
    ui.paletteOpen = true;
    ui.paletteQuery = "";
    ui.paletteIndex = 0;
    const backdrop = document.getElementById("palette-backdrop");
    const palette = document.getElementById("palette");
    const input = document.getElementById("palette-input");
    backdrop.classList.add("open");
    input.value = "";
    renderPaletteResults();
    beginDialog(palette, { host: backdrop, initial: input, close: closePalette });
  }

  function openHelp() {
    const backdrop = document.getElementById("help-backdrop");
    const help = document.getElementById("help");
    const already = dialogStack.some((entry) => entry.el === help);
    backdrop.classList.add("open");
    beginDialog(help, {
      host: backdrop,
      initial: document.getElementById("help-close"),
      close: closeHelp,
    });
    if (!already) toast("Opened Forge reference · Esc to close");
  }

  function closeHelp() {
    document.getElementById("help-backdrop").classList.remove("open");
    endDialog(document.getElementById("help"));
  }

  function closePalette() {
    ui.paletteOpen = false;
    ui.paletteItems = [];
    const backdrop = document.getElementById("palette-backdrop");
    backdrop.classList.remove("open");
    endDialog(document.getElementById("palette"));
  }

  function applyLaneFilter(lane) {
    ui.view = "board";
    ui.filterLane = lane;
    syncFilterChrome();
    render();
    toast(lane ? `Lane filter → ${LANES.find((l) => l.id === lane)?.label || lane}` : "All lanes");
  }

  function buildPaletteItems(query) {
    const q = query.trim().toLowerCase();
    const match = (text) => !q || String(text || "").toLowerCase().includes(q);
    const items = [];

    const views = [
      { id: "board", label: "Reviews", icon: "▦" },
      { id: "bookmarks", label: "Bookmarks", icon: "⎋" },
      { id: "favorites", label: "Favorites", icon: "★" },
      { id: "spitballs", label: "Spitballs", icon: "◎" },
      { id: "todo", label: "To-do", icon: "☑" },
      { id: "tools", label: "Tools", icon: "⚒" },
    ];
    for (const v of views) {
      if (match(`jump to ${v.label}`) || match(v.label)) {
        items.push({
          id: `view-${v.id}`, group: "Jump to view", label: v.label, icon: v.icon, meta: "view",
          run: () => { ui.view = v.id; closeDrawer(); render(); },
        });
      }
    }

    for (const c of state.cards) {
      const cherries = Array.isArray(c.cherryPick) ? c.cherryPick.join(" ") : "";
      const hay = [c.title, c.category, c.recommendation, cherries, c.goesTo].join(" ");
      if (match(hay) || match(`jump ${c.title}`)) {
        items.push({
          id: `card-${c.id}`, group: "Jump to review", label: c.title, icon: "◈",
          meta: c.category || c.lane || "",
          run: () => { ui.view = "board"; render(); openDrawer(c.id); },
        });
      }
    }

    for (const b of state.bookmarks) {
      if (match(b.title) || match(`bookmark ${b.title}`)) {
        items.push({
          id: `bm-${b.id}`, group: "Jump to review", label: b.title, icon: "⎋", meta: "bookmark",
          run: () => { ui.view = "bookmarks"; closeDrawer(); render(); toast(`Bookmarks · ${b.title}`); },
        });
      }
    }
    for (const s of state.spitballs) {
      if (match(s.title) || match(`spitball ${s.title}`)) {
        items.push({
          id: `sb-${s.id}`, group: "Jump to review", label: s.title, icon: "◎", meta: "spitball",
          run: () => { ui.view = "spitballs"; closeDrawer(); render(); toast(`Spitballs · ${s.title}`); },
        });
      }
    }
    for (const t of state.todos) {
      if (match(t.text) || match(`todo ${t.text}`)) {
        items.push({
          id: `todo-${t.id}`, group: "Jump to review", label: t.text, icon: "☑", meta: "to-do",
          run: () => { ui.view = "todo"; closeDrawer(); render(); toast(`To-do · ${t.text}`); },
        });
      }
    }

    if (ui.drawerId) {
      const card = getCard(ui.drawerId);
      if (card) {
        for (const lane of LANES) {
          if (match(`set lane ${lane.label}`) || match(lane.label) || match("lane")) {
            items.push({
              id: `lane-${lane.id}`, group: "Set lane", label: `Set lane → ${lane.label}`,
              icon: "→", meta: card.title,
              run: () => {
                card.lane = lane.id; save(); render(); openDrawer(card.id);
                toast(`Lane → ${lane.label}`);
              },
            });
          }
        }
      }
    }

    // Quick capture: "todo …" / "t …" and standing "Add to-do from search…"
    const rawQ = query.trim();
    const captureMatch = /^(?:todo|t)\s+(.+)$/i.exec(rawQ);
    const captureText = captureMatch ? captureMatch[1].trim() : "";
    if (rawQ) {
      const fromSearch = captureText || rawQ;
      items.unshift({
        id: "qa-add-todo-from-search",
        group: "Quick capture",
        label: "Add to-do from search…",
        icon: "☑",
        meta: fromSearch.length > 42 ? fromSearch.slice(0, 42) + "…" : fromSearch,
        run: () => addTodoQuick(fromSearch),
      });
    }
    if (captureText) {
      items.unshift({
        id: "qa-capture-todo",
        group: "Quick capture",
        label: `Add to-do: ${captureText}`,
        icon: "☑",
        meta: "↵ create",
        run: () => addTodoQuick(captureText),
      });
    }

    const actions = [
      { id: "qa-add-card", label: "Add review", icon: "+", keys: "add card new review", run: () => openAddCardModal() },
      { id: "qa-add-bm", label: "Add bookmark", icon: "+", keys: "add bookmark new",
        run: () => { ui.view = "bookmarks"; render(); openAddBookmarkModal(); } },
      { id: "qa-add-sb", label: "Add spitball", icon: "+", keys: "add spitball new",
        run: () => { ui.view = "spitballs"; render(); openAddSpitballModal(); } },
      { id: "qa-add-todo", label: "Add to-do", icon: "+", keys: "add todo new",
        run: () => { ui.view = "todo"; render(); openAddTodoModal(); } },
      { id: "qa-export", label: "Download workspace", icon: "↓", keys: "export json download workspace", run: () => exportJson() },
      { id: "qa-toggle-layout",
        label: "Cycle board layout",
        icon: "⧉", keys: "toggle grid sections layout bento lanes cover browse",
        run: () => {
          const order = ["sections", "grid", "cover"];
          const names = { sections: "Lanes", grid: "Bento", cover: "Cover" };
          const i = Math.max(0, order.indexOf(ui.layout));
          ui.layout = order[(i + 1) % order.length];
          syncFilterChrome(); ui.view = "board"; render();
          toast(`Layout → ${names[ui.layout] || ui.layout}`);
        } },
      { id: "qa-layout-cover",
        label: "Board layout → Cover",
        icon: "⧉", keys: "cover flow browse",
        run: () => {
          ui.layout = "cover";
          syncFilterChrome(); ui.view = "board"; render();
          toast("Layout → Cover");
        } },
    ];
    for (const a of actions) {
      if (match(a.label) || match(a.keys)) {
        items.push({ id: a.id, group: "Quick actions", label: a.label, icon: a.icon, meta: "action", run: a.run });
      }
    }

    // Operator shortcuts — typing lane:try in palette also matches via keys
    if (/^lane:(inbox|try|parked|skipped)\b/i.test(q) || match("lane:")) {
      for (const lane of LANES) {
        items.push({
          id: `op-lane-${lane.id}`, group: "Search operators",
          label: `lane:${lane.id}`, icon: "⌕", meta: lane.label,
          run: () => {
            ui.view = "board";
            ui.search = `lane:${lane.id}`;
            document.getElementById("search").value = ui.search;
            closePalette(); render();
          },
        });
      }
    }
    if (match("project:") || q.startsWith("project:")) {
      for (const p of projectList().slice(0, 12)) {
        if (!q.startsWith("project:") || p.toLowerCase().includes(q.slice(8))) {
          items.push({
            id: `op-proj-${p}`, group: "Search operators",
            label: `project:${p}`, icon: "⌕", meta: "goes to",
            run: () => {
              ui.view = "board";
              ui.search = `project:${p.replace(/\s+/g, "")}`;
              // keep readable form with original casing/spaces
              ui.search = `project:${p}`;
              document.getElementById("search").value = ui.search;
              closePalette(); render();
            },
          });
        }
      }
    }

    const filters = [
      { id: "f-lane-inbox", label: "Filter lane: Inbox", keys: "filter inbox lane", run: () => applyLaneFilter("inbox") },
      { id: "f-lane-try", label: "Filter lane: Try It", keys: "filter try it lane", run: () => applyLaneFilter("try") },
      { id: "f-lane-parked", label: "Filter lane: Parked", keys: "filter parked lane", run: () => applyLaneFilter("parked") },
      { id: "f-lane-skipped", label: "Filter lane: Skipped", keys: "filter skipped lane", run: () => applyLaneFilter("skipped") },
      { id: "f-lane-all", label: "Clear lane filter", keys: "filter all lanes clear", run: () => applyLaneFilter("") },
      { id: "f-clear-all", label: "Clear all filters", keys: "clear filters reset search", run: () => clearFilters() },
      { id: "f-promoted", label: "Filter: Promoted only", keys: "filter promoted only",
        run: () => { ui.view = "board"; ui.filterPromoted = true; syncFilterChrome(); render(); toast("Promoted only"); } },
      { id: "f-fav", label: "Filter: Favorites only", keys: "filter favorites only",
        run: () => { ui.view = "board"; ui.filterFavorites = true; syncFilterChrome(); render(); toast("Favorites only"); } },
    ];
    for (const f of filters) {
      if (match(f.label) || match(f.keys)) {
        items.push({ id: f.id, group: "Filter shortcuts", label: f.label, icon: "⌁", meta: "filter", run: f.run });
      }
    }
    return items;
  }

  function renderPaletteResults() {
    const items = buildPaletteItems(ui.paletteQuery);
    ui.paletteItems = items;
    if (ui.paletteIndex >= items.length) ui.paletteIndex = Math.max(0, items.length - 1);
    if (ui.paletteIndex < 0) ui.paletteIndex = 0;
    const host = document.getElementById("palette-results");
    if (!items.length) {
      host.innerHTML = `<div class="palette-empty">No matches</div>`;
      return;
    }
    const groups = {};
    const order = [];
    for (const item of items) {
      if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    }
    let html = "";
    let flatIdx = 0;
    for (const g of order) {
      html += `<div class="palette-group"><div class="palette-group-label">${escapeHtml(g)}</div>`;
      for (const item of groups[g]) {
        const active = flatIdx === ui.paletteIndex ? "active" : "";
        html += `<button type="button" class="palette-item ${active}" role="option" data-pi="${flatIdx}" aria-selected="${flatIdx === ui.paletteIndex}">
            <span class="pi-icon">${escapeHtml(item.icon || "·")}</span>
            <span class="pi-label">${escapeHtml(item.label)}</span>
            ${item.meta ? `<span class="pi-meta">${escapeHtml(item.meta)}</span>` : ""}
          </button>`;
        flatIdx++;
      }
      html += `</div>`;
    }
    host.innerHTML = html;
    host.querySelectorAll("[data-pi]").forEach((btn) => {
      btn.addEventListener("click", () => runPaletteItem(Number(btn.dataset.pi)));
      btn.addEventListener("mouseenter", () => {
        ui.paletteIndex = Number(btn.dataset.pi);
        host.querySelectorAll(".palette-item").forEach((el, idx) => {
          el.classList.toggle("active", idx === ui.paletteIndex);
        });
      });
    });
    const active = host.querySelector(".palette-item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function runPaletteItem(index) {
    const item = ui.paletteItems[index];
    if (!item) return;
    closePalette();
    item.run();
  }


  function clearFilters() {
    ui.filterLane = "";
    ui.filterCategory = "";
    ui.filterPromoted = false;
    ui.filterFavorites = false;
    ui.filterProject = "";
    ui.filterBookmarkType = "";
    ui.filtersOpen = false;
    ui.todoStatusFilter = "all";
    ui.todoProjectFilter = "";
    ui.search = "";
    const search = document.getElementById("search");
    if (search) search.value = "";
    syncFilterChrome();
    render();
    toast("Filters cleared");
  }

  function setSearchOpen(open) {
    ui.searchOpen = open;
    const island = document.getElementById("island");
    const btn = document.getElementById("btn-search-toggle");
    if (island) island.classList.toggle("search-open", open);
    if (btn) btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const input = document.getElementById("search");
      if (input) requestAnimationFrame(() => input.focus());
    }
  }

  function bindChrome() {
    const kbdLabel = document.getElementById("kbd-chip-label");
    if (kbdLabel) kbdLabel.textContent = isMacPlatform() ? "⌘K" : "Ctrl+K";

    const searchToggle = document.getElementById("btn-search-toggle");
    if (searchToggle) {
      searchToggle.addEventListener("click", () => setSearchOpen(!ui.searchOpen));
    }

    document.getElementById("nav").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (!btn) return;
      ui.view = btn.dataset.view;
      closeDrawer();
      render();
    });

    document.getElementById("search").addEventListener("input", (e) => {
      ui.search = e.target.value;
      renderCanvas();
      updateCounts();
    });

    document.getElementById("filter-lane").addEventListener("change", (e) => {
      ui.filterLane = e.target.value;
      renderCanvas();
      updateCounts();
    });
    document.getElementById("filter-category").addEventListener("change", (e) => {
      ui.filterCategory = e.target.value;
      renderCanvas();
    });
    document.getElementById("filter-promoted").addEventListener("click", () => {
      ui.filterPromoted = !ui.filterPromoted;
      syncFilterChrome();
      renderCanvas();
    });
    document.getElementById("filter-favorites").addEventListener("click", () => {
      ui.filterFavorites = !ui.filterFavorites;
      syncFilterChrome();
      renderCanvas();
    });
    document.getElementById("sort-by").addEventListener("change", (e) => {
      ui.sort = e.target.value;
      renderCanvas();
    });

    document.querySelectorAll(".layout-toggle button").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.layout = btn.dataset.layout;
        syncFilterChrome();
        renderCanvas();
      });
    });

    document.getElementById("project-strip").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-project]");
      if (!chip) return;
      ui.filterProject = chip.dataset.project;
      renderProjectStrip();
      renderCanvas();
    });

    document.getElementById("btn-add-card").addEventListener("click", () => {
      if (ui.view === "bookmarks") openAddBookmarkModal();
      else if (ui.view === "spitballs") openAddSpitballModal();
      else if (ui.view === "todo") openAddTodoModal();
      else openAddCardModal();
    });

    document.getElementById("btn-cmd-palette").addEventListener("click", openPalette);
    document.getElementById("btn-help").addEventListener("click", openHelp);
    document.getElementById("btn-filters").addEventListener("click", () => {
      ui.filtersOpen = !ui.filtersOpen;
      render();
    });
    document.getElementById("help-close").addEventListener("click", closeHelp);
    document.getElementById("help-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "help-backdrop") closeHelp();
    });

    const moreBtn = document.getElementById("btn-more");
    const moreDrop = document.getElementById("more-dropdown");
    function closeMoreMenu() {
      moreDrop.setAttribute("hidden", "");
      moreBtn.setAttribute("aria-expanded", "false");
    }
    function openMoreMenu() {
      moreDrop.removeAttribute("hidden");
      moreBtn.setAttribute("aria-expanded", "true");
    }
    closeMoreMenu(); // never land with menu open
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (moreDrop.hasAttribute("hidden")) openMoreMenu();
      else closeMoreMenu();
    });
    document.addEventListener("click", closeMoreMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMoreMenu();
    });
    moreDrop.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("btn-export").addEventListener("click", () => {
      closeMoreMenu();
      exportJson();
    });
    document.getElementById("btn-import").addEventListener("click", () => {
      closeMoreMenu();
      document.getElementById("import-file").click();
    });
    document.getElementById("import-file").addEventListener("change", importJson);
    document.getElementById("btn-reset").addEventListener("click", () => {
      closeMoreMenu();
      resetToSeed();
    });
    const clearBtn = document.getElementById("btn-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        closeMoreMenu();
        clearFilters();
      });
    }

    document.getElementById("drawer-close").addEventListener("click", closeDrawer);
    document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

    document.getElementById("palette-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "palette-backdrop") closePalette();
    });
    document.getElementById("palette-input").addEventListener("input", (e) => {
      ui.paletteQuery = e.target.value;
      ui.paletteIndex = 0;
      renderPaletteResults();
    });
    document.getElementById("palette-input").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        ui.paletteIndex = Math.min(ui.paletteIndex + 1, ui.paletteItems.length - 1);
        renderPaletteResults();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        ui.paletteIndex = Math.max(ui.paletteIndex - 1, 0);
        renderPaletteResults();
      } else if (e.key === "Enter") {
        e.preventDefault();
        runPaletteItem(ui.paletteIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
      }
    });

    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });

    document.addEventListener("keydown", (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ui.paletteOpen) closePalette();
        else openPalette();
        return;
      }
      if (e.key === "Escape") {
        const top = dialogStack[dialogStack.length - 1];
        const helpEntry = dialogStack.find((entry) => entry.el.id === "help");
        if (top?.el?.id === "drawer" && helpEntry?.close) {
          e.preventDefault();
          helpEntry.close();
          return;
        }
        if (top?.close) {
          e.preventDefault();
          top.close();
        }
      }
    });
  }

  function render() {
    document.querySelectorAll(".pill").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === ui.view);
    });

    const boardFilters = document.getElementById("board-filters");
    const projectStrip = document.getElementById("project-strip");
    const search = document.getElementById("search");
    const showBoardChrome = ui.view === "board";
    boardFilters.classList.toggle("hidden", !showBoardChrome);
    projectStrip.classList.toggle("hidden", !showBoardChrome && ui.view !== "favorites");
    const boardLayout = document.getElementById("board-layout");
    if (boardLayout) boardLayout.classList.toggle("hidden", !showBoardChrome);
    const filtersActive = !!(ui.filterLane || ui.filterCategory || ui.filterPromoted || ui.filterFavorites || ui.filterProject);
    const showFilterPanel = (ui.filtersOpen || filtersActive) && (showBoardChrome || ui.view === "favorites");
    document.getElementById("island").classList.toggle("filters-open", showFilterPanel);
    const filtersBtn = document.getElementById("btn-filters");
    if (filtersBtn) {
      const showFiltersBtn = showBoardChrome || ui.view === "favorites";
      filtersBtn.classList.toggle("hidden", !showFiltersBtn);
      filtersBtn.setAttribute("aria-expanded", String(showFilterPanel));
      filtersBtn.classList.toggle("on", showFilterPanel);
    }
    const metrics = document.getElementById("stats-strip");
    if (metrics) metrics.classList.toggle("hidden", !showBoardChrome);

    search.placeholder =
      ui.view === "board" ? "Search… lane:try project:reWavz hardware:rtx"
      : ui.view === "bookmarks" ? "Search bookmarks…"
      : ui.view === "spitballs" ? "Search spitballs…"
      : ui.view === "todo" ? "Search to-dos…"
      : ui.view === "tools" ? "Tools shelf"
      : "Search favorites…";

    const addBtn = document.getElementById("btn-add-card");
    const label =
      ui.view === "bookmarks" ? " Bookmark"
      : ui.view === "spitballs" ? " Spitball"
      : ui.view === "todo" ? " To-do"
      : ui.view === "tools" ? " Add"
      : " Add";
    addBtn.innerHTML = `<span class="btn-ico" aria-hidden="true">+</span><span class="btn-label">${label}</span>`;
    addBtn.classList.toggle("hidden", ui.view === "tools");

    const catSel = document.getElementById("filter-category");
    const cur = catSel.value;
    catSel.innerHTML =
      `<option value="">All categories</option>` +
      categories().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...catSel.options].some((o) => o.value === cur)) catSel.value = cur;
    else ui.filterCategory = "";

    syncFilterChrome();
    renderProjectStrip();
    renderCanvas();
    updateCounts();
    if (ui.drawerId && !getCard(ui.drawerId)) closeDrawer();
  }

  function renderProjectStrip() {
    const strip = document.getElementById("project-strip");
    if (ui.view !== "board" && ui.view !== "favorites") {
      strip.innerHTML = "";
      return;
    }
    strip.innerHTML =
      `<button type="button" class="project-chip ${ui.filterProject === "" ? "on" : ""}" data-project="">All projects</button>` +
      projectList().map(
        (p) =>
          `<button type="button" class="project-chip ${ui.filterProject === p ? "on" : ""}" data-project="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      ).join("");
  }

  function updateCounts() {
    document.getElementById("count-board").textContent = String(state.cards.length);
    document.getElementById("count-bookmarks").textContent = String(state.bookmarks.length);
    const favCards = state.cards.filter((c) => c.favorite).length;
    const favBm = state.bookmarks.filter((b) => b.favorite).length;
    document.getElementById("count-favorites").textContent = String(favCards + favBm);
    document.getElementById("count-spitballs").textContent = String(state.spitballs.length);
    document.getElementById("count-todo").textContent = String(state.todos.filter((t) => !t.done).length);

    document.getElementById("stat-total").textContent = String(state.cards.length);
    document.getElementById("stat-try").textContent = String(state.cards.filter((c) => c.lane === "try").length);
    document.getElementById("stat-parked").textContent = String(state.cards.filter((c) => c.lane === "parked").length);
    document.getElementById("stat-skipped").textContent = String(state.cards.filter((c) => c.lane === "skipped").length);
    document.getElementById("stat-briefs").textContent = String(state.cards.filter((c) => (c.cursorBrief || "").trim()).length);
    document.getElementById("stat-promoted").textContent = String(state.cards.filter((c) => c.promoted).length);
    document.getElementById("stat-favs").textContent = String(favCards + favBm);
  }

  function renderCanvas() {
    stopConceptMotion();
    const canvas = document.getElementById("canvas");
    if (ui.view === "board") canvas.innerHTML = renderBoard();
    else if (ui.view === "bookmarks") canvas.innerHTML = renderBookmarks();
    else if (ui.view === "favorites") canvas.innerHTML = renderFavorites();
    else if (ui.view === "spitballs") canvas.innerHTML = renderSpitballs();
    else if (ui.view === "todo") canvas.innerHTML = renderTodos();
    else if (ui.view === "tools") canvas.innerHTML = renderTools();
    wireCanvasEvents(canvas);
  }

  function monogram(title) {
    const parts = String(title || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function cardEl(c) {
    const cherries = Array.isArray(c.cherryPick) ? c.cherryPick : [];
    const favLabel = `${c.favorite ? "Unfavorite" : "Favorite"} ${c.title}`;
    const tags = [];
    if (c.category) tags.push(`<span class="badge cat">${escapeHtml(c.category)}</span>`);
    if (c.goesTo) tags.push(`<span class="badge goes">${escapeHtml(c.goesTo)}</span>`);
    if (cherries.length) tags.push(`<span class="badge">${cherries.length} cherry-pick${cherries.length > 1 ? "s" : ""}</span>`);
    const shown = tags.slice(0, 2).join("");
    const extra = tags.length - 2;
    const more = extra > 0 ? `<span class="badge more" title="${extra} more">+${extra}</span>` : "";
    const shot = screenshotSrc(c);
    const mono = monogram(c.title);
    const thumb = shot
      ? `<img src="${escapeHtml(shot)}" alt="" />`
      : `<span class="monogram">${escapeHtml(mono)}</span>`;
    return `
      <article class="card${c.promoted ? " is-promoted" : ""}">
        <div class="card-thumb" data-mono="${escapeHtml(mono)}" aria-hidden="true">${thumb}</div>
        <div class="card-top">
          <h3 class="card-title"><button type="button" class="card-open" data-card-id="${escapeHtml(c.id)}" aria-label="Open ${escapeHtml(c.title)}">${escapeHtml(c.title)}</button></h3>
          ${c.protected ? `<span class="badge lock" title="Protected seed">🔒</span>` : ""}
          <button type="button" class="card-fav ${c.favorite ? "on" : ""}" data-fav="${escapeHtml(c.id)}" aria-label="${escapeHtml(favLabel)}" title="Favorite">${c.favorite ? "★" : "☆"}</button>
        </div>
        <div class="card-meta">
          ${starsHtml(c.rating)}
          ${shown}
          ${more}
        </div>
        <p class="card-rec">${escapeHtml(c.recommendation || "")}</p>
        <div class="card-footer">
          ${c.action ? `<span class="action-label">${escapeHtml(c.action)}</span>` : ""}
        </div>
      </article>`;
  }

  /* GodUI-inspired test layouts (vanilla CSS transforms + rAF). Not the production board. */
  let conceptCleanups = [];

  function stopConceptMotion() {
    for (const fn of conceptCleanups) {
      try { fn(); } catch (_) { /* teardown is best-effort */ }
    }
    conceptCleanups = [];
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function urlHost(url) {
    const raw = String(url || "").trim();
    if (!raw || raw === "#") return "no link";
    try {
      return new URL(raw).host.replace(/^www\./, "");
    } catch {
      return raw.replace(/^https?:\/\//i, "").split("/")[0] || "link";
    }
  }

  function laneName(id) {
    return LANES.find((l) => l.id === id)?.label || "Inbox";
  }

  function coverDeck() {
    const all = filteredCards();
    const preferred = all.filter((c) => c.lane === "try" || c.promoted || c.favorite);
    return { cards: preferred.length ? preferred : all, preferred: preferred.length > 0 };
  }

  function spotlightCards() {
    return state.cards
      .filter((c) => c.lane === "try")
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.title).localeCompare(String(b.title)))
      .slice(0, 3);
  }

  function ratingBits(c) {
    const n = Number(c.rating);
    if (!Number.isFinite(n) || n <= 0) return "";
    const label = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `${starsHtml(n)}<span class="concept-rating">${escapeHtml(label)}</span>`;
  }

  function conceptFace(c) {
    const recommendation = String(c.recommendation || c.gradingSummary || "").trim();
    const action = String(c.action || "").trim();
    const rate = ratingBits(c);
    return `
      <div class="concept-card-face">
        <div class="concept-card-top">
          <span class="badge lane-chip ${escapeHtml(c.lane || "inbox")}">${escapeHtml(laneName(c.lane))}</span>
          ${action ? `<span class="action-label">${escapeHtml(action)}</span>` : ""}
        </div>
        <p class="concept-title">${escapeHtml(c.title)}</p>
        ${rate ? `<div class="concept-rate">${rate}</div>` : ""}
        <p class="concept-snippet">${escapeHtml(recommendation || "No recommendation yet.")}</p>
        <p class="concept-host">${escapeHtml(urlHost(c.url))}</p>
      </div>`;
  }

  function renderCardSwap(list) {
    const cards = list.map((c) => `
      <div class="swap-card" data-swap-card data-review-id="${escapeHtml(c.id)}" data-title="${escapeHtml(c.title)}">
        <button type="button" class="concept-hit">${conceptFace(c)}</button>
      </div>`).join("");
    return `
      <section class="concept-block spotlight-block" id="spotlight" aria-labelledby="spotlight-title">
        <div class="concept-block-head">
          <h3 id="spotlight-title">${brandTitle("Spotlight")}</h3>
          <span class="concept-test-badge">Experimental</span>
          <p>Manual stack of the top Try It reviews. Arrows only — not a board mode.</p>
        </div>
        <div class="swap-stage" data-card-swap data-swap-interval="0" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Spotlight">
          <p class="sr-only" data-swap-live aria-live="polite"></p>
          <div class="swap-row">
            <button type="button" class="concept-nav" data-swap-prev aria-label="Previous card">‹</button>
            <div class="swap-perspective">
              <div class="swap-tilt">${cards}</div>
            </div>
            <button type="button" class="concept-nav" data-swap-next aria-label="Next card">›</button>
          </div>
          <div class="concept-count" data-swap-count>1 / ${list.length}</div>
        </div>
      </section>`;
  }

  function renderCoverFlow(list) {
    const slides = list.map((c, i) => `
      <div class="flow-item" data-flow-index="${i}" data-review-id="${escapeHtml(c.id)}" data-title="${escapeHtml(c.title)}">
        <button type="button" class="concept-hit">${conceptFace(c)}</button>
      </div>`).join("");
    return `
      <section class="concept-block cover-board" id="concept-flow" aria-label="Cover browse">
        <p class="cover-note"><span class="concept-test-badge">Experimental</span> Snap a card to center to open it in the detail drawer. Arrow keys move between cards.</p>
        <div class="flow-wrap" data-cover-flow>
          <p class="sr-only" data-flow-live aria-live="polite"></p>
          <div class="flow-stage" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Cover flow">${slides}</div>
          <div class="concept-controls">
            <button type="button" class="concept-nav" data-flow-prev aria-label="Previous slide">‹</button>
            <span class="concept-count" data-flow-count>1 / ${list.length}</span>
            <button type="button" class="concept-nav" data-flow-next aria-label="Next slide">›</button>
          </div>
        </div>
      </section>`;
  }

  function mountConceptLayouts(canvas) {
    const swap = canvas.querySelector("[data-card-swap]");
    const flow = canvas.querySelector("[data-cover-flow]");
    if (swap) mountCardSwap(swap);
    if (flow) mountCoverFlow(flow);
  }

  function mountCardSwap(root) {
    const reduce = prefersReducedMotion();
    const cards = [...root.querySelectorAll("[data-swap-card]")];
    const n = cards.length;
    const prevBtn = root.querySelector("[data-swap-prev]");
    const nextBtn = root.querySelector("[data-swap-next]");
    const countEl = root.querySelector("[data-swap-count]");
    const live = root.querySelector("[data-swap-live]");
    const tilt = root.querySelector(".swap-tilt");
    if (!n || !tilt) return;

    const OFFSET_X = 22;
    const OFFSET_Y = 28;
    const SCALE_STEP = 0.06;
    const ids = cards.map((el) => el.dataset.reviewId);
    let order = ids.map((_, i) => i);
    if (Array.isArray(ui.conceptSwapOrder) && ui.conceptSwapOrder.length) {
      const saved = ui.conceptSwapOrder.filter((id) => ids.includes(id));
      const rest = ids.filter((id) => !saved.includes(id));
      const seq = [...saved, ...rest];
      if (seq.length === n) order = seq.map((id) => ids.indexOf(id));
    }

    let paused = false;
    let hovering = false;
    let focused = false;
    let timer = 0;
    let tiltRaf = 0;
    let tx = 0;
    let ty = 0;
    let gx = 0;
    let gy = 0;

    function remember() {
      ui.conceptSwapOrder = order.map((i) => ids[i]);
    }

    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = 0;
    }

    function startTimer() {
      stopTimer();
    }

    function tiltEnabled() {
      return !prefersReducedMotion() && window.innerWidth >= 768;
    }

    function syncPause() {
      const next = hovering || focused;
      if (next === paused) return;
      paused = next;
      if (paused) stopTimer();
      else startTimer();
    }

    function apply(fromUser) {
      const rankOf = new Array(n);
      order.forEach((itemIndex, rank) => { rankOf[itemIndex] = rank; });
      const activeEl = document.activeElement;
      cards.forEach((el, i) => {
        const r = rankOf[i] ?? 0;
        const btn = el.querySelector(".concept-hit");
        const x = r * OFFSET_X;
        const y = -r * OFFSET_Y;
        const scale = 1 - r * SCALE_STEP;
        el.style.zIndex = String(n - r);
        el.style.pointerEvents = r === 0 ? "auto" : "none";
        if (reduce) {
          el.style.transition = "none";
          el.style.transform = "none";
          el.style.opacity = r === 0 ? "1" : "0";
        } else {
          el.style.transition = "transform 620ms cubic-bezier(0.22, 1.15, 0.36, 1), opacity 420ms ease";
          el.style.transform = `translate3d(${x}px, ${y}px, 0) rotateZ(${r * -2.5}deg) scale(${scale})`;
          el.style.opacity = r > 4 ? "0" : "1";
        }
        el.classList.toggle("is-front", r === 0);
        el.setAttribute("aria-hidden", r === 0 ? "false" : "true");
        if (btn) {
          btn.tabIndex = r === 0 ? 0 : -1;
          const title = el.dataset.title || "Review";
          btn.setAttribute("aria-label", r === 0 ? `Open ${title}` : title);
        }
      });
      const front = order[0];
      if (countEl) countEl.textContent = `${front + 1} / ${n}`;
      if (prevBtn) prevBtn.disabled = n < 2;
      if (nextBtn) nextBtn.disabled = n < 2;
      remember();
      if (fromUser && live) {
        live.textContent = `${cards[front].dataset.title || "Review"}, ${front + 1} of ${n}`;
      }
      if (
        fromUser &&
        activeEl &&
        activeEl.classList.contains("concept-hit") &&
        root.contains(activeEl)
      ) {
        const frontBtn = cards[front].querySelector(".concept-hit");
        if (frontBtn) frontBtn.focus();
      }
    }

    function advance(fromUser) {
      if (n < 2) return;
      order = [...order.slice(1), order[0]];
      apply(fromUser);
    }

    function retreat(fromUser) {
      if (n < 2) return;
      order = [order[order.length - 1], ...order.slice(0, -1)];
      apply(fromUser);
    }

    function tiltTick() {
      tx += (gx - tx) * 0.18;
      ty += (gy - ty) * 0.18;
      tilt.style.transform = `rotateX(${tx.toFixed(2)}deg) rotateY(${ty.toFixed(2)}deg)`;
      if (Math.abs(gx - tx) > 0.05 || Math.abs(gy - ty) > 0.05) {
        tiltRaf = requestAnimationFrame(tiltTick);
      } else {
        tilt.style.transform = `rotateX(${gx}deg) rotateY(${gy}deg)`;
        tiltRaf = 0;
      }
    }

    function kickTilt() {
      if (!tiltEnabled()) return;
      if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltTick);
    }

    function onPointerMove(e) {
      if (!tiltEnabled() || e.pointerType === "touch") {
        gx = 0;
        gy = 0;
        tilt.style.transform = "none";
        return;
      }
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      gx = -py * 12;
      gy = px * 14;
      kickTilt();
    }

    function onPointerEnter(e) {
      if (e.pointerType === "touch") return;
      hovering = true;
      syncPause();
    }

    function onPointerLeave(e) {
      if (e.pointerType === "touch") return;
      hovering = false;
      gx = 0;
      gy = 0;
      kickTilt();
      syncPause();
    }

    function onFocusIn() {
      focused = true;
      syncPause();
    }

    function onFocusOut(e) {
      if (root.contains(e.relatedTarget)) return;
      focused = false;
      syncPause();
    }

    function onKeyDown(e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        retreat(true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advance(true);
      } else if ((e.key === "Enter" || e.key === " ") && e.target === root) {
        e.preventDefault();
        openDrawer(cards[order[0]].dataset.reviewId);
      }
    }

    function onPrev(e) {
      e.stopPropagation();
      retreat(true);
    }

    function onNext(e) {
      e.stopPropagation();
      advance(true);
    }

    cards.forEach((el) => {
      const btn = el.querySelector(".concept-hit");
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (el !== cards[order[0]]) return;
        openDrawer(el.dataset.reviewId);
      });
    });

    function onVisibility() {
      if (!document.hidden) return;
      if (tiltRaf) cancelAnimationFrame(tiltRaf);
      tiltRaf = 0;
      gx = 0;
      gy = 0;
      tx = 0;
      ty = 0;
      tilt.style.transform = "none";
    }

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerenter", onPointerEnter);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);
    if (prevBtn) prevBtn.addEventListener("click", onPrev);
    if (nextBtn) nextBtn.addEventListener("click", onNext);

    apply(false);

    conceptCleanups.push(() => {
      stopTimer();
      if (tiltRaf) cancelAnimationFrame(tiltRaf);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerenter", onPointerEnter);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      if (prevBtn) prevBtn.removeEventListener("click", onPrev);
      if (nextBtn) nextBtn.removeEventListener("click", onNext);
    });
  }

  function mountCoverFlow(wrap) {
    const reduce = prefersReducedMotion();
    const stage = wrap.querySelector(".flow-stage");
    const items = [...wrap.querySelectorAll(".flow-item")];
    const prevBtn = wrap.querySelector("[data-flow-prev]");
    const nextBtn = wrap.querySelector("[data-flow-next]");
    const countEl = wrap.querySelector("[data-flow-count]");
    const live = wrap.querySelector("[data-flow-live]");
    const count = items.length;
    if (!stage || !count) return;

    const ids = items.map((el) => el.dataset.reviewId);
    let index = Math.min(2, count - 1);
    if (ui.conceptFlowId) {
      const found = ids.indexOf(ui.conceptFlowId);
      if (found >= 0) index = found;
    }
    let pos = index;
    let target = index;
    let vel = 0;
    let running = false;
    let raf = 0;
    let last = 0;
    let dragging = false;
    let spacing = 200;
    let booted = false;
    let announced = -1;
    let primed = false;
    let openOnSettle = false;

    function clampIndex(v) {
      return Math.max(0, Math.min(count - 1, v));
    }

    function measure() {
      const narrow = window.innerWidth < 768;
      const parent = wrap.parentElement || wrap;
      const avail = parent.clientWidth || window.innerWidth;
      let itemW = 260;
      if (narrow) itemW = Math.round(Math.min(300, Math.max(210, avail * 0.82)));
      const itemH = Math.round(itemW * (320 / 260));
      const stageW = narrow ? avail : Math.min(avail, Math.round(itemW * 3));
      const stageH = itemH + (narrow ? 36 : 56);
      stage.style.width = narrow ? "100%" : `${stageW}px`;
      stage.style.height = `${stageH}px`;
      if (!reduce) stage.style.perspective = "1200px";
      else stage.style.perspective = "none";
      items.forEach((el) => {
        el.style.width = `${itemW}px`;
        el.style.height = `${itemH}px`;
        el.style.marginLeft = `${-itemW / 2}px`;
        el.style.marginTop = `${-itemH / 2}px`;
        el.style.top = "50%";
      });
      spacing = itemW * 0.72 + 16;
    }

    function placement(offset) {
      const sign = Math.sign(offset) || 0;
      const abs = Math.abs(offset);
      if (reduce) {
        return {
          x: 0,
          rotateY: 0,
          z: 0,
          scale: 1,
          opacity: abs < 0.45 ? 1 : 0,
        };
      }
      const near = Math.min(abs, 1);
      const far = Math.max(abs - 1, 0);
      return {
        x: sign * (near * spacing + far * spacing * 0.55),
        rotateY: -Math.max(-1, Math.min(1, offset)) * 52,
        z: -Math.min(abs, 3) * 130,
        scale: 1 - Math.min(abs, 3) * 0.08,
        opacity: abs > 3.4 ? 0 : Math.max(0.15, 1 - Math.max(abs - 1, 0) * 0.28),
      };
    }

    function layout() {
      items.forEach((el, i) => {
        const offset = i - pos;
        const abs = Math.abs(offset);
        const p = placement(offset);
        el.style.transition = reduce && primed ? "opacity 180ms linear" : "none";
        el.style.transform = reduce
          ? "translate3d(0, 0, 0)"
          : `translate3d(${p.x}px, 0, ${p.z}px) rotateY(${p.rotateY}deg) scale(${p.scale})`;
        el.style.opacity = String(p.opacity);
        el.style.zIndex = String(Math.round(100 - abs * 10));
        el.style.pointerEvents = p.opacity < 0.08 ? "none" : "auto";
        el.classList.toggle("is-front", abs < 0.45);
      });
      primed = true;
    }

    function syncChrome(announce) {
      items.forEach((el, i) => {
        const btn = el.querySelector(".concept-hit");
        const title = el.dataset.title || "Review";
        const on = i === index;
        if (!btn) return;
        btn.tabIndex = on ? 0 : -1;
        btn.setAttribute("aria-label", on ? `Open ${title}` : `Show ${title}`);
        el.setAttribute("aria-hidden", reduce && !on ? "true" : "false");
      });
      if (prevBtn) prevBtn.disabled = index <= 0;
      if (nextBtn) nextBtn.disabled = index >= count - 1;
      if (countEl) countEl.textContent = `${index + 1} / ${count}`;
      ui.conceptFlowId = ids[index];
      if (!announce || announced === index) return;
      announced = index;
      if (booted && live) {
        live.textContent = `${items[index].dataset.title || "Review"}, ${index + 1} of ${count}`;
      }
    }

    function stopSpring() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function tick(now) {
      if (!running) return;
      const dt = Math.min(0.032, (now - last) / 1000) || 0.016;
      last = now;
      const acc = (-320 * (pos - target) - 32 * vel) / 0.9;
      vel += acc * dt;
      pos += vel * dt;
      if (Math.abs(pos - target) < 0.001 && Math.abs(vel) < 0.02) {
        pos = target;
        vel = 0;
        running = false;
        layout();
        syncChrome(true);
        if (openOnSettle) {
          openOnSettle = false;
          openDrawer(ids[index]);
        }
        return;
      }
      layout();
      raf = requestAnimationFrame(tick);
    }

    function finishGo() {
      layout();
      syncChrome(true);
      if (openOnSettle) {
        openOnSettle = false;
        openDrawer(ids[index]);
      }
    }

    function goTo(i, immediate, openOnSnap) {
      index = clampIndex(i);
      target = index;
      ui.conceptFlowId = ids[index];
      openOnSettle = !!(openOnSnap && booted);
      if (immediate || reduce || (Math.abs(pos - target) < 0.001 && Math.abs(vel) < 0.02)) {
        stopSpring();
        pos = target;
        vel = 0;
        finishGo();
        return;
      }
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    let startX = 0;
    let startPos = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragMoved = 0;
    let downItem = null;

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      dragMoved = 0;
      downItem = e.target.closest?.(".flow-item") || null;
      startX = lastX = e.clientX;
      startPos = pos;
      lastT = performance.now();
      velocity = 0;
      stopSpring();
      vel = 0;
      stage.classList.add("is-dragging");
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - startX;
      dragMoved = Math.max(dragMoved, Math.abs(dx));
      const inst = (e.clientX - lastX) / Math.max(8, now - lastT);
      velocity = velocity * 0.55 + inst * 0.45;
      lastX = e.clientX;
      lastT = now;
      let raw = startPos - dx / spacing;
      if (raw < 0) raw *= 0.35;
      else if (raw > count - 1) raw = (count - 1) + (raw - (count - 1)) * 0.35;
      pos = raw;
      layout();
      if (dragMoved > 6) e.preventDefault();
    }

    let ignoreClickUntil = 0;

    function finishDrag() {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("is-dragging");
      const item = downItem;
      downItem = null;
      if (dragMoved < 8) {
        ignoreClickUntil = performance.now() + 400;
        if (item) {
          const i = Number(item.dataset.flowIndex);
          if (i === index) openDrawer(item.dataset.reviewId);
          else goTo(i, reduce, true);
        }
        return;
      }
      ignoreClickUntil = performance.now() + 80;
      let dest = Math.round(pos);
      if (Math.abs(velocity) > 0.6) dest -= Math.sign(velocity);
      dest = clampIndex(dest);
      goTo(dest, reduce, dest !== index);
    }

    function onPointerUp() { finishDrag(); }
    function onPointerCancel() {
      if (!dragging) return;
      dragging = false;
      downItem = null;
      stage.classList.remove("is-dragging");
      goTo(Math.round(pos), reduce);
    }

    function onClick(e) {
      const item = e.target.closest(".flow-item");
      if (!item || !wrap.contains(item)) return;
      if (performance.now() < ignoreClickUntil) {
        e.preventDefault();
        return;
      }
      const i = Number(item.dataset.flowIndex);
      if (i === index) openDrawer(item.dataset.reviewId);
      else goTo(i, reduce, true);
    }

    function onKeyDown(e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1, reduce);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1, reduce);
      } else if ((e.key === "Enter" || e.key === " ") && e.target === stage) {
        e.preventDefault();
        openDrawer(items[index].dataset.reviewId);
      }
    }

    function onResize() {
      measure();
      layout();
    }

    function onVisibility() {
      if (!document.hidden) return;
      dragging = false;
      downItem = null;
      stage.classList.remove("is-dragging");
      openOnSettle = false;
      stopSpring();
      pos = target;
      vel = 0;
      layout();
      syncChrome(false);
    }

    items.forEach((el) => {
      const btn = el.querySelector(".concept-hit");
      if (!btn) return;
      btn.addEventListener("click", onClick);
    });
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerCancel);
    wrap.addEventListener("keydown", onKeyDown);
    if (prevBtn) prevBtn.addEventListener("click", () => goTo(index - 1, reduce));
    if (nextBtn) nextBtn.addEventListener("click", () => goTo(index + 1, reduce));
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    measure();
    goTo(index, true);
    booted = true;

    conceptCleanups.push(() => {
      stopSpring();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerCancel);
      wrap.removeEventListener("keydown", onKeyDown);
    });
  }

  function renderBoard() {
    if (ui.layout === "cover") {
      const deck = coverDeck();
      const list = deck.cards;
      const scope = deck.preferred ? "Try It, promoted, and favorites" : "current review set";
      const header = `
        <div class="canvas-header">
          <div>
            <h2>${brandTitle("Reviews")}</h2>
            <p>${list.length} card${list.length === 1 ? "" : "s"} · Cover browse · ${scope}</p>
          </div>
        </div>`;
      if (!list.length) return header + `<div class="empty-state"><p>Nothing in this stack</p><p class="empty-hint">Cover Browse shows Try It, Promoted, or Favorites. Star or promote a review, or switch the stack filter.</p><button type="button" class="btn-gold" data-empty-browse>Browse Reviews</button><button type="button" class="btn-ghost" data-empty-favorites>Show Favorites</button></div>`;
      return header + renderCoverFlow(list);
    }
    const list = filteredCards();
    const header = `
      <div class="canvas-header">
        <div>
          <h2>${brandTitle("Reviews")}</h2>
          <p>${list.length} card${list.length === 1 ? "" : "s"} · magazine lanes · amber forge</p>
        </div>
      </div>`;
    if (!list.length) return header + `<div class="empty-state"><p>No cards match filters.</p><button type="button" class="btn-ghost" data-empty-clear>Clear filters</button></div>`;
    if (ui.layout === "grid") return header + `<div class="bento">${list.map(cardEl).join("")}</div>`;

    let html = header + `<div class="lanes">`;
    for (const lane of LANES) {
      const items = list.filter((c) => c.lane === lane.id);
      if (ui.filterLane && ui.filterLane !== lane.id) continue;
      if (!items.length) continue;
      html += `
        <section class="lane-col ${lane.id}">
          <div class="lane-head">
            <span class="lane-dot"></span>
            <h3>${brandTitle(lane.label)}</h3>
            <span class="lane-count">${items.length}</span>
          </div>
          <div class="lane-stack">
            ${items.length ? items.map(cardEl).join("") : `<div class="empty-state" style="padding:16px;font-size:0.8rem">Empty lane</div>`}
          </div>
        </section>`;
    }
    html += `</div>`;
    return html;
  }


  function renderBookmarks() {
    const q = ui.search.trim().toLowerCase();
    let list = [...state.bookmarks];
    if (ui.filterBookmarkType) list = list.filter((b) => b.bookmarkType === ui.filterBookmarkType);
    if (q) list = list.filter((b) => [b.title, b.url, b.note, b.bookmarkType].join(" ").toLowerCase().includes(q));
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const typeChips = BOOKMARK_TYPES.map((t) =>
      `<button type="button" class="chip ${ui.filterBookmarkType === t ? "on" : ""}" data-btype="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ).join("");
    return `
      <div class="canvas-header"><div><h2>${brandTitle("Bookmarks")}</h2><p>Lightweight quick-saves — title, link, type, one-liner.</p></div></div>
      <div class="project-strip" style="margin-bottom:12px">
        <button type="button" class="chip ${ui.filterBookmarkType === "" ? "on" : ""}" data-btype="">All types</button>
        ${typeChips}
      </div>
      <div class="shelf-toolbar"><button type="button" class="btn-gold" id="btn-add-bookmark">+ Add bookmark</button></div>
      <div class="shelf">
        ${list.length ? list.map((b) => `
            <div class="shelf-item" data-bm-id="${escapeHtml(b.id)}">
              <div class="shelf-item-top">
                <h4>${escapeHtml(b.title)}</h4>
                ${b.bookmarkType ? `<span class="badge type">${escapeHtml(b.bookmarkType)}</span>` : ""}
                <button type="button" class="card-fav ${b.favorite ? "on" : ""}" data-bm-fav="${escapeHtml(b.id)}">${b.favorite ? "★" : "☆"}</button>
                <button type="button" class="btn-ghost" data-bm-del="${escapeHtml(b.id)}" style="padding:4px 8px;font-size:0.75rem">Delete</button>
              </div>
              <a class="link-out" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.url)}</a>
              <p>${escapeHtml(b.note || "")}</p>
            </div>`).join("") : `<div class="empty-state"><p>No bookmarks yet.</p><button type="button" class="btn-gold" id="btn-add-bookmark-empty">+ Add bookmark</button></div>`}
      </div>`;
  }

  function renderFavorites() {
    const q = ui.search.trim().toLowerCase();
    let cards = state.cards.filter((c) => c.favorite);
    let bms = state.bookmarks.filter((b) => b.favorite);
    if (ui.filterProject) cards = cards.filter((c) => c.goesTo === ui.filterProject);
    if (q) {
      cards = cards.filter((c) => [c.title, c.category, c.recommendation].join(" ").toLowerCase().includes(q));
      bms = bms.filter((b) => [b.title, b.url, b.note].join(" ").toLowerCase().includes(q));
    }
    return `
      <div class="canvas-header"><div><h2>${brandTitle("Favorites")}</h2><p>Cross-shelf: favorited reviews + bookmarks.</p></div></div>
      <h3 class="section-kicker">${brandTitle("Reviews")}</h3>
      ${cards.length ? `<div class="bento">${cards.map(cardEl).join("")}</div>` : `<div class="empty-state"><p>No favorite reviews.</p><button type="button" class="btn-ghost" data-empty-goto-board>Browse reviews</button></div>`}
      <h3 class="section-kicker" style="margin-top:22px">${brandTitle("Bookmarks")}</h3>
      <div class="shelf">
        ${bms.length ? bms.map((b) => `
            <div class="shelf-item">
              <div class="shelf-item-top"><h4>${escapeHtml(b.title)}</h4>${b.bookmarkType ? `<span class="badge type">${escapeHtml(b.bookmarkType)}</span>` : ""}</div>
              <a class="link-out" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.url)}</a>
              <p>${escapeHtml(b.note || "")}</p>
            </div>`).join("") : `<div class="empty-state"><p>No favorite bookmarks.</p></div>`}
      </div>`;
  }

  function renderSpitballs() {
    const q = ui.search.trim().toLowerCase();
    let list = [...state.spitballs];
    if (q) list = list.filter((s) => [s.title, s.body].join(" ").toLowerCase().includes(q));
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const gradLabel = (s) => {
      const stage = s.stage || "spitball";
      if (stage === "spitball") return "Graduate to reviewed";
      if (stage === "reviewed") return "Graduate to promoted";
      return "Already promoted";
    };
    return `
      <div class="canvas-header"><div><h2>${brandTitle("Spitballs")}</h2><p>Raw future-project ideas. Funnel: Spitball → Reviewed (Inbox) → Promoted.</p></div></div>
      <div class="funnel-note">Spitball → Reviewed lands a card in Inbox · then Promote</div>
      <div class="shelf-toolbar"><button type="button" class="btn-gold" id="btn-add-spitball">+ Add spitball</button></div>
      <div class="shelf">
        ${list.length ? list.map((s) => `
            <div class="shelf-item" data-sb-id="${escapeHtml(s.id)}">
              <div class="shelf-item-top">
                <h4>${escapeHtml(s.title)}</h4>
                <span class="stage-pill ${escapeHtml(s.stage || "spitball")}">${escapeHtml(s.stage || "spitball")}</span>
              </div>
              <p>${escapeHtml(s.body || "")}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                <button type="button" class="btn-ghost grad-btn" data-sb-grad="${escapeHtml(s.id)}" ${(s.stage || "spitball") === "promoted" ? "disabled" : ""}>${gradLabel(s)}</button>
                <button type="button" class="btn-danger" data-sb-del="${escapeHtml(s.id)}" style="font-size:0.78rem;padding:6px 10px">Delete</button>
              </div>
            </div>`).join("") : `<div class="empty-state"><p>No spitballs.</p><button type="button" class="btn-gold" id="btn-add-spitball-empty">+ Add spitball</button></div>`}
      </div>`;
  }

  function renderTodos() {
    const q = ui.search.trim().toLowerCase();
    const status = ui.todoStatusFilter || "all";
    const proj = ui.todoProjectFilter || "";
    let list = state.todos.map(normalizeTodo);
    if (q) list = list.filter((t) => {
      const hay = [t.text, t.goesTo, t.severity].join(" ").toLowerCase();
      return hay.includes(q);
    });
    if (proj === "__none__") list = list.filter((t) => !t.goesTo);
    else if (proj) list = list.filter((t) => t.goesTo === proj);

    if (status === "active") list = list.filter((t) => !t.done && !t.parked);
    else if (status === "high") list = list.filter((t) => String(t.severity || "").toLowerCase() === "high");
    else if (status === "parked") list = list.filter((t) => !!t.parked);
    else if (status === "done") list = list.filter((t) => !!t.done);
    else if (status === "unassigned") list = list.filter((t) => !t.goesTo);

    let active = [];
    let parked = [];
    let showParkedZone = false;
    if (status === "all") {
      active = list.filter((t) => !t.parked);
      parked = list.filter((t) => t.parked);
      showParkedZone = true;
    } else if (status === "parked") {
      parked = list;
      showParkedZone = true;
    } else {
      active = list;
    }
    active.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    parked.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const statusChips = [
      ["all", "All"],
      ["active", "Active"],
      ["high", "High"],
      ["parked", "Parked"],
      ["done", "Done"],
      ["unassigned", "Unassigned"],
    ].map(([id, label]) =>
      `<button type="button" class="chip ${status === id ? "on" : ""}" data-todo-status="${id}">${label}</button>`
    ).join("");

    const projectChips =
      `<button type="button" class="chip ${proj === "" ? "on" : ""}" data-todo-project="">All projects</button>` +
      `<button type="button" class="chip ${proj === "__none__" ? "on" : ""}" data-todo-project="__none__">No project</button>` +
      projectList().map((p) =>
        `<button type="button" class="chip ${proj === p ? "on" : ""}" data-todo-project="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      ).join("");

    const item = (t) => `
      <div class="shelf-item todo-item" data-todo-id="${escapeHtml(t.id)}">
        <button type="button" class="todo-check ${t.done ? "done" : ""}" data-todo-toggle="${escapeHtml(t.id)}" aria-label="Toggle done">${t.done ? "✓" : ""}</button>
        <span class="todo-text ${t.done ? "struck" : ""}" data-todo-edit="${escapeHtml(t.id)}" title="Tap to edit">${escapeHtml(t.text)}</span>
        ${t.goesTo ? `<span class="badge goes todo-goes">${escapeHtml(t.goesTo)}</span>` : `<span class="badge todo-goes dim">—</span>`}
        <span class="sev ${escapeHtml(t.severity || "med")}">${escapeHtml(t.severity || "med")}</span>
        <div class="todo-controls">
          <button type="button" data-todo-up="${escapeHtml(t.id)}" title="Move up">↑</button>
          <button type="button" data-todo-down="${escapeHtml(t.id)}" title="Move down">↓</button>
          <button type="button" data-todo-park="${escapeHtml(t.id)}" title="${t.parked ? "Unpark" : "Park for later"}">${t.parked ? "↩" : "⏸"}</button>
          <button type="button" data-todo-del="${escapeHtml(t.id)}" title="Delete">✕</button>
        </div>
      </div>`;

    const doneCount = state.todos.filter((t) => t.done).length;
    return `
      <div class="canvas-header"><div><h2>${brandTitle("To-do")}</h2><p>Personal tracker — projects, severity, inline edit, parking lane.</p></div></div>
      <div class="todo-filter-strip" aria-label="To-do status filters">${statusChips}</div>
      <div class="todo-project-strip" aria-label="To-do project filters">${projectChips}</div>
      <div class="shelf-toolbar">
        <button type="button" class="btn-gold" id="btn-add-todo">+ Add to-do</button>
        <button type="button" class="btn-ghost" id="btn-clear-done" ${doneCount ? "" : "disabled"} title="Remove completed to-dos">Clear done${doneCount ? ` (${doneCount})` : ""}</button>
      </div>
      <div class="shelf">${(status === "parked" ? parked : active).length
        ? (status === "parked" ? parked : active).map(item).join("")
        : `<div class="empty-state"><p>${status === "all" ? "Inbox clear." : "Nothing matches."}</p><button type="button" class="btn-gold" id="btn-add-todo-empty">+ Add to-do</button></div>`}</div>
      ${showParkedZone && status === "all" ? `
      <div class="parked-zone">
        <div class="label">Parking lane</div>
        <div class="shelf">${parked.length ? parked.map(item).join("") : `<div class="empty-state" style="padding:16px">Nothing parked.</div>`}</div>
      </div>` : ""}`;
  }

  function renderTools() {
    const tools = [
      { id: "download", ico: "↓", title: "Download workspace", desc: "Export the full Forge JSON (reviews, bookmarks, spitballs, todos).", run: "export" },
      { id: "load", ico: "↑", title: "Load workspace", desc: "Import a previously downloaded Forge workspace JSON.", run: "import" },
      { id: "reset", ico: "↺", title: "Reset to seed", desc: "Restore the amber seed board and clear local edits.", run: "reset" },
      { id: "clear", ico: "⌀", title: "Clear filters", desc: "Drop lane, project, search, and chip filters.", run: "clear" },
      { id: "palette", ico: "⌘", title: "Open command palette", desc: "Jump, filter with operators, add, or export without leaving the board.", run: "palette" },
    ];
    return `
      <div class="canvas-header"><div><h2>${brandTitle("Tools")}</h2><p>Workspace utilities — amber forge shelf, not a Muse clone.</p></div></div>
      <div class="tools-grid">
        ${tools.map((t) => `
          <button type="button" class="tool-card" data-tool="${t.run}">
            <span class="tool-ico" aria-hidden="true">${t.ico}</span>
            <h3>${escapeHtml(t.title)}</h3>
            <p>${escapeHtml(t.desc)}</p>
          </button>`).join("")}
      </div>
      ${(() => {
        const spot = spotlightCards();
        if (!spot.length) {
          return `<section class="concept-block spotlight-block" id="spotlight"><div class="concept-block-head"><h3>${brandTitle("Spotlight")}</h3><span class="concept-test-badge">Experimental</span></div><div class="empty-state"><p>No tools pinned</p><p class="empty-hint">Spotlight holds up to three tools you choose. Pin from Tools — Card Swap stays here, not on the board.</p><p class="empty-hint">Nothing pinned yet.</p></div></section>`;
        }
        return renderCardSwap(spot);
      })()}
      <div class="tools-tip" role="note">
        <strong>Install / Add to Home Screen</strong>
        <p>On phone or tablet: open the browser share/menu → <em>Add to Home Screen</em> / <em>Install app</em>. Forge installs as a standalone board (PWA manifest linked).</p>
      </div>`;
  }

  function wireCanvasEvents(canvas) {
    canvas.querySelectorAll(".card-thumb img").forEach((img) => {
      img.addEventListener("error", () => {
        const thumb = img.closest(".card-thumb");
        const mono = thumb?.dataset.mono || "·";
        img.remove();
        if (thumb && !thumb.querySelector(".monogram")) {
          const mark = document.createElement("span");
          mark.className = "monogram";
          mark.textContent = mono;
          thumb.appendChild(mark);
        }
      });
    });
    canvas.querySelectorAll("[data-card-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]")) return;
        openDrawer(el.dataset.cardId);
      });
    });
    canvas.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.fav); });
    });
    const addBm = canvas.querySelector("#btn-add-bookmark");
    if (addBm) addBm.addEventListener("click", openAddBookmarkModal);
    canvas.querySelectorAll("[data-bm-fav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const b = state.bookmarks.find((x) => x.id === btn.dataset.bmFav);
        if (!b) return;
        b.favorite = !b.favorite; save(); render();
      });
    });
    canvas.querySelectorAll("[data-bm-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteBookmark(btn.dataset.bmDel));
    });
    const addSb = canvas.querySelector("#btn-add-spitball");
    if (addSb) addSb.addEventListener("click", openAddSpitballModal);
    canvas.querySelectorAll("[data-sb-grad]").forEach((btn) => {
      btn.addEventListener("click", () => graduateSpitball(btn.dataset.sbGrad));
    });
    canvas.querySelectorAll("[data-sb-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.spitballs = state.spitballs.filter((s) => s.id !== btn.dataset.sbDel);
        save(); render(); toast("Spitball deleted");
      });
    });
    const addTd = canvas.querySelector("#btn-add-todo");
    if (addTd) addTd.addEventListener("click", openAddTodoModal);
    const clearDone = canvas.querySelector("#btn-clear-done");
    if (clearDone) clearDone.addEventListener("click", clearDoneTodos);
    canvas.querySelectorAll("[data-todo-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.todoStatusFilter = btn.dataset.todoStatus || "all";
        renderCanvas();
      });
    });
    canvas.querySelectorAll("[data-todo-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.todoProjectFilter = btn.dataset.todoProject || "";
        renderCanvas();
      });
    });
    canvas.querySelectorAll("[data-todo-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = state.todos.find((x) => x.id === btn.dataset.todoToggle);
        if (!t) return;
        t.done = !t.done; save(); render();
      });
    });
    canvas.querySelectorAll("[data-todo-edit]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        beginTodoInlineEdit(el, el.dataset.todoEdit);
      });
    });
    canvas.querySelectorAll("[data-todo-up]").forEach((btn) => {
      btn.addEventListener("click", () => moveTodo(btn.dataset.todoUp, -1));
    });
    canvas.querySelectorAll("[data-todo-down]").forEach((btn) => {
      btn.addEventListener("click", () => moveTodo(btn.dataset.todoDown, 1));
    });
    canvas.querySelectorAll("[data-todo-park]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = state.todos.find((x) => x.id === btn.dataset.todoPark);
        if (!t) return;
        t.parked = !t.parked; save(); render();
      });
    });
    canvas.querySelectorAll("[data-todo-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteTodo(btn.dataset.todoDel));
    });
    const addBmEmpty = canvas.querySelector("#btn-add-bookmark-empty");
    if (addBmEmpty) addBmEmpty.addEventListener("click", openAddBookmarkModal);
    const addSbEmpty = canvas.querySelector("#btn-add-spitball-empty");
    if (addSbEmpty) addSbEmpty.addEventListener("click", openAddSpitballModal);
    const addTdEmpty = canvas.querySelector("#btn-add-todo-empty");
    if (addTdEmpty) addTdEmpty.addEventListener("click", openAddTodoModal);
    canvas.querySelectorAll("[data-empty-clear]").forEach((btn) => {
      btn.addEventListener("click", clearFilters);
    });
    canvas.querySelectorAll("[data-empty-goto-board]").forEach((btn) => {
      btn.addEventListener("click", () => { ui.view = "board"; render(); });
    });
    canvas.querySelectorAll("[data-empty-browse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.view = "board";
        ui.layout = "sections";
        render();
      });
    });
    canvas.querySelectorAll("[data-empty-favorites]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.view = "board";
        ui.layout = "cover";
        ui.filterFavorites = true;
        syncFilterChrome();
        render();
      });
    });
    canvas.querySelectorAll("[data-btype]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.filterBookmarkType = btn.dataset.btype || "";
        renderCanvas();
      });
    });
    canvas.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const run = btn.dataset.tool;
        if (run === "export") exportJson();
        else if (run === "import") document.getElementById("import-file").click();
        else if (run === "reset") resetToSeed();
        else if (run === "clear") clearFilters();
        else if (run === "palette") openPalette();
      });
    });
    mountConceptLayouts(canvas);
  }

  function getCard(id) { return state.cards.find((c) => c.id === id); }

  function toggleFavorite(id) {
    const c = getCard(id);
    if (!c) return;
    c.favorite = !c.favorite;
    save(); render();
    if (ui.drawerId === id) openDrawer(id);
  }

  function deleteCard(id) {
    const idx = state.cards.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const target = state.cards[idx];
    if (target.protected) {
      if (!confirm(`“${target.title}” is a protected seed card. Delete anyway?`)) return;
    }
    const [removed] = state.cards.splice(idx, 1);
    save(); closeDrawer(); render();
    if (ui.undoTimer) clearTimeout(ui.undoTimer);
    ui.undoPayload = { type: "card", item: removed, index: idx };
    toast(`Deleted “${removed.title}”`, {
      undo: () => {
        if (!ui.undoPayload || ui.undoPayload.type !== "card") return;
        state.cards.splice(ui.undoPayload.index, 0, ui.undoPayload.item);
        save(); render(); toast("Restored");
      },
    });
    ui.undoTimer = setTimeout(() => { ui.undoPayload = null; }, UNDO_MS);
  }

  function deleteBookmark(id) {
    const idx = state.bookmarks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const [removed] = state.bookmarks.splice(idx, 1);
    save(); render();
    toast(`Deleted bookmark “${removed.title}”`, {
      undo: () => { state.bookmarks.splice(idx, 0, removed); save(); render(); toast("Restored"); },
    });
  }

  function deleteTodo(id) {
    const idx = state.todos.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const [removed] = state.todos.splice(idx, 1);
    save(); render();
    toast("To-do deleted", {
      undo: () => { state.todos.splice(idx, 0, removed); save(); render(); },
    });
  }

  function moveTodo(id, dir) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;
    const bucket = state.todos
      .filter((x) => !!x.parked === !!t.parked)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = bucket.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= bucket.length) return;
    const a = bucket[i];
    const b = bucket[j];
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    if (a.order === b.order) { a.order = i + dir; b.order = i; }
    save(); render();
  }

  function graduateSpitball(id) {
    const s = state.spitballs.find((x) => x.id === id);
    if (!s) return;
    const stage = s.stage || "spitball";
    if (stage === "spitball") {
      const card = normalizeCard({
        id: uid("card"),
        title: s.title,
        url: "#",
        lane: "inbox",
        category: "Other",
        rating: 3,
        recommendation: s.body || "",
        cherryPick: [],
        gradingSummary: "Graduated from spitball",
        relatedNotes: "",
        cursorBrief: `## Cursor brief: ${s.title}\n\n### From spitball\n${s.body || ""}`,
        goesTo: "",
        foundBy: "Spitball graduate",
        hardwareFit: "No hardware dependency",
        revisitDate: "",
        promoted: false,
        favorite: false,
        action: "evaluate",
        createdAt: new Date().toISOString(),
        screenshot: null,
        screenshotDriveUrl: null,
        fromSpitballId: s.id,
        protected: false,
        evidence: [],
      });
      state.cards.unshift(card);
      s.stage = "reviewed";
      s.graduatedCardId = card.id;
      save();
      ui.view = "board";
      ui.filterLane = "inbox";
      syncFilterChrome();
      render();
      openDrawer(card.id);
      toast("Graduated to Inbox · review card created");
      return;
    }
    if (stage === "reviewed") {
      s.stage = "promoted";
      if (s.graduatedCardId) {
        const c = getCard(s.graduatedCardId);
        if (c) c.promoted = true;
      }
      save(); render();
      toast("Stage → promoted");
      return;
    }
    toast("Already promoted");
  }



  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast(okMsg || "Copied");
    }
  }

  function buildCardMarkdown(c) {
    const cherries = Array.isArray(c.cherryPick) ? c.cherryPick : [];
    const evidence = Array.isArray(c.evidence) ? c.evidence : [];
    const lines = [
      `# ${c.title}`,
      "",
      `- **URL:** ${c.url || ""}`,
      `- **Lane:** ${c.lane || ""}`,
      `- **Rating:** ${c.rating || 0}/5 (${RATING_RUBRIC[c.rating] || "—"})`,
      `- **Category:** ${c.category || ""}`,
      `- **Goes to:** ${c.goesTo || "—"}`,
      `- **Action:** ${c.action || "—"}`,
      `- **Found by:** ${c.foundBy || "—"}`,
      `- **Hardware:** ${c.hardwareFit || "—"}`,
      "",
      "## Recommendation",
      c.recommendation || "—",
      "",
      "## Cherry-pick",
      ...(cherries.length ? cherries.map((x) => `- ${x}`) : ["- None"]),
      "",
      "## Grading summary",
      c.gradingSummary || "—",
      "",
      "## Related notes",
      c.relatedNotes || c.notes || "—",
      "",
      "## Cursor brief",
      c.cursorBrief || "—",
      "",
      "## Evidence",
      ...(evidence.length
        ? evidence.map((e) => `- [${e.done ? "x" : " "}] ${e.text || ""}`)
        : ["- None"]),
    ];
    return lines.join("\n");
  }

  function buildBridgeNote(c) {
    const path = c.goesTo || c.category || "—";
    const rec = (c.recommendation || "").trim();
    const next = c.action || (rec ? rec.split(/[.\n]/)[0] : "") || "Review next";
    return [
      `Verdict: ${rec || (RATING_RUBRIC[c.rating] || "—")}`,
      `Path: ${path}`,
      `Lane: ${c.lane || "—"} · ${c.rating || 0}/5`,
      `Next: ${String(next).trim()}`,
      `Link: ${c.url || ""}`,
    ].join("\n");
  }

  function buildShareBlock(c) {
    return [
      c.title || "Untitled",
      c.url || "",
      `Lane: ${c.lane || "—"} · Rating: ${c.rating || 0}/5`,
      c.goesTo ? `Goes to: ${c.goesTo}` : null,
      `Forge · ${c.id}`,
    ].filter(Boolean).join("\n");
  }

  function linkTodoFromCard(c) {
    const text = `Review: ${c.title}`;
    const existing = c.linkedTodoId && state.todos.find((t) => t.id === c.linkedTodoId);
    if (existing) {
      ui.view = "todo";
      closeDrawer();
      render();
      toast("Linked to-do already exists — jumped to To-do");
      return;
    }
    const todo = addTodoQuick(text, {
      severity: "med",
      goesTo: c.goesTo || "",
      linkedCardId: c.id,
      silent: true,
      stayView: true,
    });
    c.linkedTodoId = todo.id;
    save();
    openDrawer(c.id);
    toast("Linked to-do created");
  }

  function isEvaluateAction(action) {
    const a = String(action || "").toLowerCase().trim();
    if (!a) return false;
    return a === "evaluate" || a === "eval" || a.includes("eval");
  }

  function addTodoQuick(text, opts = {}) {
    const cleaned = String(text || "").trim();
    if (!cleaned) {
      toast("Task text required");
      return null;
    }
    const maxOrder = state.todos.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
    const todo = normalizeTodo({
      id: uid("todo"),
      text: cleaned,
      done: false,
      severity: opts.severity || "med",
      parked: !!opts.parked,
      goesTo: opts.goesTo || "",
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      linkedCardId: opts.linkedCardId || null,
    });
    state.todos.push(todo);
    save();
    if (opts.stayView !== true) {
      ui.view = "todo";
    }
    if (!opts.silent) {
      render();
      toast(`To-do added · ${cleaned}`);
    }
    return todo;
  }

  function clearDoneTodos() {
    const removed = state.todos.filter((t) => t.done);
    if (!removed.length) {
      toast("No completed to-dos");
      return;
    }
    if (!confirm(`Clear ${removed.length} completed to-do${removed.length === 1 ? "" : "s"}?`)) return;
    state.todos = state.todos.filter((t) => !t.done);
    save();
    render();
    toast(`Cleared ${removed.length} done`, {
      undo: () => {
        state.todos = state.todos.concat(removed);
        save();
        render();
        toast("Restored completed to-dos");
      },
    });
  }

  function beginTodoInlineEdit(el, id) {
    const t = state.todos.find((x) => x.id === id);
    if (!t || el.isContentEditable) return;
    const original = t.text;
    el.contentEditable = "true";
    el.classList.add("editing");
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      el.contentEditable = "false";
      el.classList.remove("editing");
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      if (commit) {
        const next = el.textContent.replace(/\s+/g, " ").trim();
        if (!next) {
          el.textContent = original;
        } else if (next !== original) {
          t.text = next;
          save();
          render();
          return;
        }
      } else {
        el.textContent = original;
      }
    };
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
  }

  function openDrawer(id) {
    const c = getCard(id);
    if (!c) return;
    ui.drawerId = id;
    const drawer = document.getElementById("drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    document.getElementById("drawer-title").textContent = c.title;
    const cherries = Array.isArray(c.cherryPick) ? c.cherryPick : [];
    const sticky = document.getElementById("drawer-sticky");
    sticky.innerHTML = `
      <div class="sticky-row">
        <div class="star-edit" id="d-stars">
          ${[1, 2, 3, 4, 5].map((n) =>
            `<button type="button" class="${n <= (c.rating || 0) ? "on" : ""}" data-star="${n}" aria-label="${n} stars">★</button>`
          ).join("")}
        </div>
      </div>
      <div class="sticky-row">
        <div class="lane-pills" id="d-lane-pills">
          ${LANES.map((l) =>
            `<button type="button" class="lane-pill ${c.lane === l.id ? `on ${l.id}` : ""}" data-lane="${l.id}">${l.label}</button>`
          ).join("")}
        </div>
        <select class="sticky-action-select" id="d-action-select" aria-label="Action">
          <option value="">Action…</option>
          ${ACTIONS.map((a) => `<option value="${a}" ${c.action === a ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>`;

    const previewEligible = cardSupportsPreview(c);
    const shot = screenshotSrc(c);
    const body = document.getElementById("drawer-body");
    body.innerHTML = `
      <a class="btn-primary drawer-open" href="${escapeHtml(c.url || "#")}" target="_blank" rel="noopener">Open</a>
      <div class="callout callout-rec callout-rec-lead">
        <div class="callout-title">My recommendation</div>
        <p>${escapeHtml(c.recommendation || "—")}</p>
      </div>
      <div class="drawer-actions-row">
        <button type="button" class="btn-ghost" id="d-copy-brief">Copy Cursor brief</button>
        <button type="button" class="btn-ghost" id="d-copy-md">Copy Markdown</button>
        <button type="button" class="btn-ghost" id="d-copy-bridge">Copy bridge note</button>
        <button type="button" class="btn-ghost" id="d-share">Share card</button>
        <button type="button" class="btn-ghost" id="d-link-todo">${c.linkedTodoId ? "Open linked to-do" : (isEvaluateAction(c.action) ? "Add to-do" : "Linked to-do")}</button>
        <button type="button" class="btn-ghost" id="d-fav">${c.favorite ? "★ Favorited" : "☆ Favorite"}</button>
        <button type="button" class="btn-ghost" id="d-promote">${c.promoted ? "↑ Promoted" : "Promote"}</button>
        <button type="button" class="btn-danger" id="d-delete" ${c.protected ? 'title="Protected seed — confirms harder"' : ""}>${c.protected ? "🔒 Delete" : "Delete"}</button>
      </div>
      <div>
        <div class="field-label">Goes to</div>
        <select class="goes-select" id="d-goes">
          <option value="">— none —</option>
          ${projectList().map((p) => `<option value="${escapeHtml(p)}" ${c.goesTo === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
      </div>
      <div class="field-block"><div class="field-label">Category · ${escapeHtml(c.category || "—")}</div></div>
      <div class="meta-grid">
        <label class="field-block"><div class="field-label">Found by</div>
          <input type="text" id="d-found" value="${escapeHtml(c.foundBy || "")}" placeholder="Name or source" /></label>
        <label class="field-block"><div class="field-label">Hardware fit</div>
          <select id="d-hw">${HARDWARE_FITS.map((h) => `<option value="${escapeHtml(h)}" ${c.hardwareFit === h ? "selected" : ""}>${escapeHtml(h)}</option>`).join("")}</select></label>
        <label class="field-block"><div class="field-label">Revisit date</div>
          <input type="date" id="d-revisit" value="${escapeHtml(c.revisitDate || "")}" /></label>
        <div class="field-block"><div class="field-label">Rating rubric</div>
          <p class="rubric-line">${escapeHtml(RATING_RUBRIC[c.rating] || "—")}</p></div>
      </div>
      <div class="callout callout-cherry">
        <div class="callout-title">Cherry-pick</div>
        ${cherries.length ? `<ul>${cherries.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p>None listed.</p>`}
      </div>
      ${previewEligible ? `
      <div class="site-preview" id="d-site-preview">
        <div class="site-preview-bar">
          <button type="button" class="site-preview-toggle" id="d-preview-toggle" aria-expanded="false">▶ Site preview</button>
          <a class="btn-ghost" href="${escapeHtml(c.url)}" target="_blank" rel="noopener" style="font-size:0.78rem;padding:6px 10px;text-decoration:none">Open original ↗</a>
        </div>
        <div class="site-preview-frame-wrap" id="d-preview-frame-wrap"></div>
      </div>` : ""}
      <div class="field-block">
        <div class="field-label">Grading summary</div>
        <p>${escapeHtml(c.gradingSummary || "—")}</p>
      </div>
      <div class="field-block">
        <div class="field-label">Related notes</div>
        <p>${escapeHtml(c.relatedNotes || c.notes || "—")}</p>
      </div>
      <div class="field-block">
        <div class="field-label">Cursor brief</div>
        <pre class="brief-box" id="d-brief">${escapeHtml(c.cursorBrief || "")}</pre>
      </div>
      <div class="field-block">
        <div class="field-label">Evidence checklist</div>
        <div class="evidence-list" id="d-evidence">
          ${(Array.isArray(c.evidence) ? c.evidence : []).map((e, i) => `
            <div class="evidence-row ${e.done ? "done" : ""}">
              <label class="evidence-check">
                <input type="checkbox" data-ev-i="${i}" ${e.done ? "checked" : ""} />
                <span>${escapeHtml(e.text || "")}</span>
              </label>
              <button type="button" class="evidence-del" data-ev-del="${i}" title="Remove" aria-label="Remove evidence">✕</button>
            </div>`).join("") || `<p style="color:var(--text-dim);font-size:0.85rem;margin:0">No evidence items yet.</p>`}
        </div>
        <div class="evidence-add">
          <input type="text" id="d-ev-input" placeholder="Add evidence item…" />
          <button type="button" class="btn-ghost" id="d-ev-add">Add</button>
        </div>
      </div>
      <div>
        <div class="field-label">Reference screenshot / comp</div>
        <div class="screenshot-slot" id="d-shot-slot">
          ${shot ? `<img src="${escapeHtml(shot)}" alt="Screenshot" />` : `Screenshot slot<br/><span style="opacity:0.7">Placeholder — paste a Drive image URL below</span>`}
        </div>
        <div class="drive-url-field">
          <div class="field-label">Drive image URL</div>
          <input type="url" id="d-drive-url" placeholder="https://… (Drive / image URL)" value="${escapeHtml(c.screenshotDriveUrl || "")}" />
        </div>
      </div>`;

    drawer.classList.add("open");
    backdrop.classList.add("open");
    beginDialog(drawer, {
      host: drawer,
      initial: document.getElementById("drawer-close"),
      close: closeDrawer,
    });

    document.getElementById("d-copy-brief").addEventListener("click", () => {
      copyText(c.cursorBrief || "", "Cursor brief copied");
    });
    document.getElementById("d-copy-md").addEventListener("click", () => {
      copyText(buildCardMarkdown(c), "Markdown brief copied");
    });
    document.getElementById("d-copy-bridge").addEventListener("click", () => {
      copyText(buildBridgeNote(c), "Bridge note copied");
    });
    document.getElementById("d-share").addEventListener("click", () => {
      copyText(buildShareBlock(c), "Share card copied");
    });
    document.getElementById("d-link-todo").addEventListener("click", () => linkTodoFromCard(c));
    document.getElementById("d-fav").addEventListener("click", () => toggleFavorite(c.id));
    document.getElementById("d-promote").addEventListener("click", () => {
      c.promoted = !c.promoted; save(); render(); openDrawer(c.id);
    });
    document.getElementById("d-delete").addEventListener("click", () => deleteCard(c.id));

    const evList = document.getElementById("d-evidence");
    if (evList) {
      evList.addEventListener("change", (e) => {
        const input = e.target.closest("[data-ev-i]");
        if (!input) return;
        const i = Number(input.dataset.evI);
        if (!Array.isArray(c.evidence) || !c.evidence[i]) return;
        c.evidence[i].done = !!input.checked;
        save();
        openDrawer(c.id);
      });
      evList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ev-del]");
        if (!btn) return;
        const i = Number(btn.dataset.evDel);
        if (!Array.isArray(c.evidence) || !c.evidence[i]) return;
        c.evidence.splice(i, 1);
        save();
        openDrawer(c.id);
      });
    }
    const evAdd = document.getElementById("d-ev-add");
    const evInput = document.getElementById("d-ev-input");
    if (evAdd && evInput) {
      const addEv = () => {
        const text = evInput.value.trim();
        if (!text) return;
        if (!Array.isArray(c.evidence)) c.evidence = [];
        c.evidence.push({ id: uid("ev"), text, done: false });
        save();
        openDrawer(c.id);
      };
      evAdd.addEventListener("click", addEv);
      evInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addEv(); }
      });
    }
    document.getElementById("d-stars").addEventListener("click", (e) => {
      const b = e.target.closest("[data-star]");
      if (!b) return;
      c.rating = Number(b.dataset.star); save(); render(); openDrawer(c.id);
    });
    document.getElementById("d-lane-pills").addEventListener("click", (e) => {
      const b = e.target.closest("[data-lane]");
      if (!b) return;
      c.lane = b.dataset.lane; save(); render(); openDrawer(c.id);
    });
    document.getElementById("d-action-select").addEventListener("change", (e) => {
      const prev = c.action;
      c.action = e.target.value || null;
      save(); render(); openDrawer(c.id);
      if (isEvaluateAction(c.action) && !isEvaluateAction(prev) && !c.linkedTodoId) {
        toast("Add linked to-do?", {
          actionLabel: "Yes",
          action: () => linkTodoFromCard(c),
        });
      }
    });
    document.getElementById("d-goes").addEventListener("change", (e) => {
      c.goesTo = e.target.value; save(); render(); openDrawer(c.id);
    });

    const dFound = document.getElementById("d-found");
    if (dFound) dFound.addEventListener("change", () => { c.foundBy = dFound.value.trim(); save(); });
    const dHw = document.getElementById("d-hw");
    if (dHw) dHw.addEventListener("change", () => { c.hardwareFit = dHw.value; save(); render(); });
    const dRev = document.getElementById("d-revisit");
    if (dRev) dRev.addEventListener("change", () => { c.revisitDate = dRev.value; save(); });
    const driveInput = document.getElementById("d-drive-url");
    let driveTimer = null;
    driveInput.addEventListener("input", () => {
      clearTimeout(driveTimer);
      driveTimer = setTimeout(() => {
        c.screenshotDriveUrl = driveInput.value.trim() || null;
        save();
        const slot = document.getElementById("d-shot-slot");
        const src = screenshotSrc(c);
        if (slot) {
          slot.innerHTML = src
            ? `<img src="${escapeHtml(src)}" alt="Screenshot" />`
            : `Screenshot slot<br/><span style="opacity:0.7">Placeholder — paste a Drive image URL below</span>`;
        }
      }, 280);
    });
    const previewToggle = document.getElementById("d-preview-toggle");
    if (previewToggle) {
      previewToggle.addEventListener("click", () => {
        const wrap = document.getElementById("d-site-preview");
        const frameWrap = document.getElementById("d-preview-frame-wrap");
        const open = wrap.classList.toggle("open");
        previewToggle.setAttribute("aria-expanded", String(open));
        previewToggle.textContent = open ? "▼ Site preview" : "▶ Site preview";
        if (open && !frameWrap.querySelector("iframe")) {
          const iframe = document.createElement("iframe");
          iframe.src = c.url;
          iframe.title = `Preview of ${c.title}`;
          iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups";
          iframe.loading = "lazy";
          iframe.referrerPolicy = "no-referrer";
          frameWrap.appendChild(iframe);
        }
        if (!open) frameWrap.innerHTML = "";
      });
    }
  }

  function closeDrawer() {
    ui.drawerId = null;
    const drawer = document.getElementById("drawer");
    drawer.classList.remove("open");
    document.getElementById("drawer-backdrop").classList.remove("open");
    endDialog(drawer);
    document.getElementById("drawer-sticky").innerHTML = "";
    document.getElementById("drawer-body").innerHTML = "";
  }

  function openModal(title, bodyHtml, footHtml) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHtml;
    document.getElementById("modal-foot").innerHTML = footHtml;
    const backdrop = document.getElementById("modal-backdrop");
    const modal = document.getElementById("modal");
    backdrop.classList.add("open");
    beginDialog(modal, {
      host: backdrop,
      close: closeModal,
      initial: () => {
        const body = document.getElementById("modal-body");
        const field = body && body.querySelector("input, select, textarea");
        if (field) return field;
        const foot = document.getElementById("modal-foot");
        return foot && foot.querySelector("button");
      },
    });
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("open");
    endDialog(document.getElementById("modal"));
  }

  function openAddCardModal() {
    openModal(
      "Add review",
      `<div class="form-grid">
        <label>Title<input id="f-title" required /></label>
        <label>Reviewed URL<input id="f-url" type="url" placeholder="https://" /></label>
        <label>Section<select id="f-lane">${LANES.map((l) => `<option value="${l.id}" ${l.id === "inbox" ? "selected" : ""}>${l.label}</option>`).join("")}</select></label>
        <label>Action<select id="f-action">${ACTIONS.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>
        <label>Category<input id="f-cat" placeholder="Tool / Design / API…" /></label>
        <label>Goes to<select id="f-goes"><option value="">— none —</option>${projectList().map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}</select></label>
        <label>Found by<input id="f-found" placeholder="Name or source" /></label>
        <label>Hardware fit<select id="f-hw">${HARDWARE_FITS.map((h) => `<option value="${h}">${h}</option>`).join("")}</select></label>
        <label>Revisit date<input id="f-revisit" type="date" /></label>
        <label>Rating<select id="f-rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} ★ — ${RATING_RUBRIC[n]}</option>`).join("")}</select></label>
        <label class="full">Recommendation or notes<textarea id="f-rec" placeholder="What should we test, implement, or cherry-pick?"></textarea></label>
        <label class="full">Cherry-pick (one per line)<textarea id="f-cherry"></textarea></label>
        <label class="full">Cursor brief<textarea id="f-brief" rows="4"></textarea></label>
        <p class="form-hint">Rubric: 1 archive · 2 weak reference · 3 useful · 4 test/harvest · 5 strategic fit</p>
      </div>`,
      `<button type="button" class="btn-ghost" id="modal-cancel">Cancel</button>
       <button type="button" class="btn-gold" id="modal-save">Add card</button>`
    );
    document.getElementById("modal-cancel").onclick = closeModal;
    document.getElementById("modal-save").onclick = () => {
      const title = document.getElementById("f-title").value.trim();
      if (!title) { toast("Title required"); return; }
      const url = document.getElementById("f-url").value.trim() || "#";
      const dup = findCardByUrl(url);
      if (dup && url !== "#") {
        toast(`URL already on board — “${dup.title}”`);
        closeModal();
        openDrawer(dup.id);
        return;
      }
      const cherryRaw = document.getElementById("f-cherry").value;
      const card = normalizeCard({
        id: uid("card"), title, url,
        lane: document.getElementById("f-lane").value || "inbox",
        category: document.getElementById("f-cat").value.trim() || "Other",
        rating: Number(document.getElementById("f-rating").value) || 3,
        recommendation: document.getElementById("f-rec").value.trim(),
        cherryPick: cherryRaw.split("\n").map((s) => s.trim()).filter(Boolean),
        gradingSummary: "", relatedNotes: "",
        cursorBrief: document.getElementById("f-brief").value.trim(),
        goesTo: document.getElementById("f-goes").value,
        foundBy: document.getElementById("f-found").value.trim(),
        hardwareFit: document.getElementById("f-hw").value,
        revisitDate: document.getElementById("f-revisit").value,
        promoted: false, favorite: false,
        action: document.getElementById("f-action").value || "evaluate",
        createdAt: new Date().toISOString(),
        screenshot: null, screenshotDriveUrl: null,
      });
      state.cards.unshift(card);
      save(); closeModal(); ui.view = "board"; render(); toast("Review added");
    };
  }

  function openAddBookmarkModal() {
    openModal(
      "Add bookmark",
      `<div class="form-grid">
        <label>Title<input id="f-title" /></label>
        <label>URL<input id="f-url" type="url" placeholder="https://" /></label>
        <label>Bookmark type<select id="f-btype">
          <option value="">— none —</option>
          ${BOOKMARK_TYPES.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select></label>
        <label>One-liner<textarea id="f-note" rows="2"></textarea></label>
      </div>`,
      `<button type="button" class="btn-ghost" id="modal-cancel">Cancel</button>
       <button type="button" class="btn-gold" id="modal-save">Save</button>`
    );
    document.getElementById("modal-cancel").onclick = closeModal;
    document.getElementById("modal-save").onclick = () => {
      const title = document.getElementById("f-title").value.trim();
      const url = document.getElementById("f-url").value.trim();
      if (!title || !url) { toast("Title and URL required"); return; }
      const dup = findBookmarkByUrl(url);
      if (dup) {
        toast(`URL already bookmarked — “${dup.title}”`);
        return;
      }
      state.bookmarks.unshift(normalizeBookmark({
        id: uid("bm"), title, url,
        note: document.getElementById("f-note").value.trim(),
        bookmarkType: document.getElementById("f-btype").value,
        favorite: false, createdAt: new Date().toISOString(),
      }));
      save(); closeModal(); render(); toast("Bookmark saved");
    };
  }

  function openAddSpitballModal() {
    openModal(
      "Add spitball",
      `<div class="form-grid">
        <label>Title<input id="f-title" /></label>
        <label>Idea<textarea id="f-body" rows="3"></textarea></label>
      </div>`,
      `<button type="button" class="btn-ghost" id="modal-cancel">Cancel</button>
       <button type="button" class="btn-gold" id="modal-save">Save</button>`
    );
    document.getElementById("modal-cancel").onclick = closeModal;
    document.getElementById("modal-save").onclick = () => {
      const title = document.getElementById("f-title").value.trim();
      if (!title) { toast("Title required"); return; }
      state.spitballs.unshift({
        id: uid("sb"), title,
        body: document.getElementById("f-body").value.trim(),
        stage: "spitball", createdAt: new Date().toISOString(),
      });
      save(); closeModal(); render(); toast("Spitball added");
    };
  }

  function openAddTodoModal() {
    openModal(
      "Add to-do",
      `<div class="form-grid">
        <label class="full">Task<input id="f-text" /></label>
        <label>Severity<select id="f-sev">
          <option value="high">high</option>
          <option value="med" selected>med</option>
          <option value="low">low</option>
        </select></label>
        <label>Destination project<select id="f-goes">
          <option value="">— none —</option>
          ${projectList().map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
        </select></label>
        <label class="full"><span style="text-transform:none;letter-spacing:normal;color:var(--text-muted)"><input type="checkbox" id="f-park" /> Park for later</span></label>
      </div>`,
      `<button type="button" class="btn-ghost" id="modal-cancel">Cancel</button>
       <button type="button" class="btn-gold" id="modal-save">Save</button>`
    );
    document.getElementById("modal-cancel").onclick = closeModal;
    document.getElementById("modal-save").onclick = () => {
      const text = document.getElementById("f-text").value.trim();
      if (!text) { toast("Task required"); return; }
      addTodoQuick(text, {
        severity: document.getElementById("f-sev").value,
        goesTo: document.getElementById("f-goes").value,
        parked: document.getElementById("f-park").checked,
        silent: true,
      });
      closeModal();
      ui.view = "todo";
      render();
      toast("To-do added");
    };
  }


  function normalizeUrl(u) {
    try {
      const x = new URL(String(u || "").trim());
      x.hash = "";
      let path = x.pathname.replace(/\/+$/, "") || "/";
      return (x.origin + path + x.search).toLowerCase();
    } catch {
      return String(u || "").trim().toLowerCase();
    }
  }

  function findCardByUrl(url, exceptId) {
    const key = normalizeUrl(url);
    if (!key) return null;
    return state.cards.find((c) => c.id !== exceptId && normalizeUrl(c.url) === key) || null;
  }

  function findBookmarkByUrl(url, exceptId) {
    const key = normalizeUrl(url);
    if (!key) return null;
    return state.bookmarks.find((b) => b.id !== exceptId && normalizeUrl(b.url) === key) || null;
  }

  function exportPayload() {
    return {
      version: state.version || 1,
      reviews: state.cards,
      cards: state.cards,
      bookmarks: state.bookmarks,
      spitballs: state.spitballs,
      todos: state.todos,
    };
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `linklabz-forge-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    exportedThisSession = true;
    markSessionClean();
    toast("Workspace downloaded");
  }

  function importJson(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const next = normalizeState(data);
        if (!Array.isArray(next.cards)) {
          toast("Invalid LinkLabz JSON (missing cards/reviews)");
          return;
        }
        state = next;
        save(); closeDrawer();
        markSessionClean();
        render();
        toast(`Workspace loaded · ${state.cards.length} reviews`);
      } catch {
        toast("Could not parse JSON");
      }
    };
    reader.readAsText(file);
  }

  async function resetToSeed() {
    if (!confirm("Reset all Forge data to seed? This clears local changes.")) return;
    try {
      state = await loadSeed();
      for (const c of state.cards) c.protected = true;
      save(); closeDrawer();
      ui.filterLane = ""; ui.filterCategory = "";
      ui.filterPromoted = false; ui.filterFavorites = false;
      ui.filterProject = ""; ui.filterBookmarkType = "";
      ui.todoStatusFilter = "all"; ui.todoProjectFilter = "";
      ui.search = "";
      exportedThisSession = false; backupNudgeShown = false;
      document.getElementById("search").value = "";
      markSessionClean();
      render(); toast("Reset to seed");
    } catch {
      toast("Reset failed — seed.json missing?");
    }
  }

  init();
})();
