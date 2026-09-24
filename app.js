/* LinkLabz Forge — charcoal / amber / gold review board
   Static SPA. Persistence: localStorage key linklabz-forge-v1
*/
(() => {
  "use strict";

  const STORAGE_KEY = "linklabz-forge-v1";
  const UNDO_MS = 7000;
  const PROJECTS = [
    "Website-Templates",
    "PromptLab",
    "reWavz",
    "DigitalStudioz",
    "MSC",
    "Other",
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
  };

  function normalizeCard(c) {
    if (!c || typeof c !== "object") return c;
    if (c.screenshotDriveUrl === undefined) c.screenshotDriveUrl = null;
    if (c.screenshot === undefined) c.screenshot = null;
    if (c.foundBy === undefined) c.foundBy = "";
    if (c.hardwareFit === undefined) c.hardwareFit = "No hardware dependency";
    if (c.revisitDate === undefined) c.revisitDate = "";
    if (!c.lane) c.lane = "inbox";
    if (!Array.isArray(c.cherryPick)) c.cherryPick = c.cherryPick ? [String(c.cherryPick)] : [];
    return c;
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
      bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
      spitballs: Array.isArray(raw.spitballs) ? raw.spitballs : [],
      todos: Array.isArray(raw.todos) ? raw.todos : [],
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
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
        save();
      } catch (e) {
        console.error(e);
        toast("Could not load seed.json — serve via static server.");
      }
    }
    bindChrome();
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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, { undo } = {}) {
    const host = document.getElementById("toast-host");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span>${escapeHtml(message)}</span>`;
    if (undo) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Undo";
      btn.addEventListener("click", () => {
        undo();
        el.remove();
        if (ui.undoTimer) clearTimeout(ui.undoTimer);
        ui.undoTimer = null;
        ui.undoPayload = null;
      });
      el.appendChild(btn);
    }
    host.appendChild(el);
    setTimeout(() => el.remove(), undo ? UNDO_MS + 200 : 3200);
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


  function filteredCards() {
    let list = [...state.cards];
    const q = ui.search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const cherries = Array.isArray(c.cherryPick) ? c.cherryPick.join(" ") : "";
        const hay = [
          c.title, c.category, c.recommendation, c.gradingSummary, c.goesTo, cherries, c.notes,
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
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

  function openPalette() {
    ui.paletteOpen = true;
    ui.paletteQuery = "";
    ui.paletteIndex = 0;
    const backdrop = document.getElementById("palette-backdrop");
    const input = document.getElementById("palette-input");
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    input.value = "";
    renderPaletteResults();
    requestAnimationFrame(() => input.focus());
  }

  function closePalette() {
    ui.paletteOpen = false;
    ui.paletteItems = [];
    const backdrop = document.getElementById("palette-backdrop");
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
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
        label: ui.layout === "sections" ? "Toggle layout → Bento" : "Toggle layout → Lanes",
        icon: "⧉", keys: "toggle grid sections layout bento lanes",
        run: () => {
          ui.layout = ui.layout === "sections" ? "grid" : "sections";
          syncFilterChrome(); ui.view = "board"; render();
          toast(`Layout → ${ui.layout === "sections" ? "Lanes" : "Bento"}`);
        } },
    ];
    for (const a of actions) {
      if (match(a.label) || match(a.keys)) {
        items.push({ id: a.id, group: "Quick actions", label: a.label, icon: a.icon, meta: "action", run: a.run });
      }
    }

    const filters = [
      { id: "f-lane-try", label: "Filter lane: Try It", keys: "filter try it lane", run: () => applyLaneFilter("try") },
      { id: "f-lane-parked", label: "Filter lane: Parked", keys: "filter parked lane", run: () => applyLaneFilter("parked") },
      { id: "f-lane-skipped", label: "Filter lane: Skipped", keys: "filter skipped lane", run: () => applyLaneFilter("skipped") },
      { id: "f-lane-all", label: "Clear lane filter", keys: "filter all lanes clear", run: () => applyLaneFilter("") },
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


  function bindChrome() {
    const kbdLabel = document.getElementById("kbd-chip-label");
    if (kbdLabel) kbdLabel.textContent = isMacPlatform() ? "⌘K" : "Ctrl+K";

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
        if (ui.paletteOpen) { closePalette(); return; }
        if (document.getElementById("modal-backdrop").classList.contains("open")) {
          closeModal(); return;
        }
        if (ui.drawerId) closeDrawer();
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

    search.placeholder =
      ui.view === "board" ? "Search title, category, recommendation…"
      : ui.view === "bookmarks" ? "Search bookmarks…"
      : ui.view === "spitballs" ? "Search spitballs…"
      : ui.view === "todo" ? "Search to-dos…"
      : "Search favorites…";

    const addBtn = document.getElementById("btn-add-card");
    if (ui.view === "bookmarks") addBtn.textContent = "+ Bookmark";
    else if (ui.view === "spitballs") addBtn.textContent = "+ Spitball";
    else if (ui.view === "todo") addBtn.textContent = "+ To-do";
    else addBtn.textContent = "+ Add";

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
      PROJECTS.map(
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
    const canvas = document.getElementById("canvas");
    if (ui.view === "board") canvas.innerHTML = renderBoard();
    else if (ui.view === "bookmarks") canvas.innerHTML = renderBookmarks();
    else if (ui.view === "favorites") canvas.innerHTML = renderFavorites();
    else if (ui.view === "spitballs") canvas.innerHTML = renderSpitballs();
    else if (ui.view === "todo") canvas.innerHTML = renderTodos();
    wireCanvasEvents(canvas);
  }

  function cardEl(c) {
    const cherries = Array.isArray(c.cherryPick) ? c.cherryPick : [];
    return `
      <article class="card" tabindex="0" data-card-id="${escapeHtml(c.id)}" role="button" aria-label="Open ${escapeHtml(c.title)}">
        <div class="card-top">
          <h3 class="card-title">${escapeHtml(c.title)}</h3>
          <button type="button" class="card-fav ${c.favorite ? "on" : ""}" data-fav="${escapeHtml(c.id)}" aria-label="Toggle favorite" title="Favorite">${c.favorite ? "★" : "☆"}</button>
        </div>
        <div class="card-meta">
          ${starsHtml(c.rating)}
          <span class="badge cat">${escapeHtml(c.category || "—")}</span>
          ${c.promoted ? `<span class="badge promoted">Promoted</span>` : ""}
          ${c.goesTo ? `<span class="badge goes">${escapeHtml(c.goesTo)}</span>` : ""}
        </div>
        <p class="card-rec">${escapeHtml(c.recommendation || "")}</p>
        <div class="card-footer">
          ${c.action ? `<span class="action-label">${escapeHtml(c.action)}</span>` : ""}
          ${cherries.length ? `<span class="badge">${cherries.length} cherry-pick${cherries.length > 1 ? "s" : ""}</span>` : ""}
        </div>
      </article>`;
  }

  function renderBoard() {
    const list = filteredCards();
    const header = `
      <div class="canvas-header">
        <div>
          <h2>Reviews</h2>
          <p>${list.length} card${list.length === 1 ? "" : "s"} · magazine lanes · amber forge</p>
        </div>
      </div>`;
    if (!list.length) return header + `<div class="empty-state">No cards match filters.</div>`;
    if (ui.layout === "grid") return header + `<div class="bento">${list.map(cardEl).join("")}</div>`;

    let html = header + `<div class="lanes">`;
    for (const lane of LANES) {
      const items = list.filter((c) => c.lane === lane.id);
      if (ui.filterLane && ui.filterLane !== lane.id) continue;
      html += `
        <section class="lane-col ${lane.id}">
          <div class="lane-head">
            <span class="lane-dot"></span>
            <h3>${lane.label}</h3>
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
    if (q) list = list.filter((b) => [b.title, b.url, b.note].join(" ").toLowerCase().includes(q));
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return `
      <div class="canvas-header"><div><h2>Bookmarks</h2><p>Lightweight quick-saves — title, link, one-liner.</p></div></div>
      <div class="shelf-toolbar"><button type="button" class="btn-gold" id="btn-add-bookmark">+ Add bookmark</button></div>
      <div class="shelf">
        ${list.length ? list.map((b) => `
            <div class="shelf-item" data-bm-id="${escapeHtml(b.id)}">
              <div class="shelf-item-top">
                <h4>${escapeHtml(b.title)}</h4>
                <button type="button" class="card-fav ${b.favorite ? "on" : ""}" data-bm-fav="${escapeHtml(b.id)}">${b.favorite ? "★" : "☆"}</button>
                <button type="button" class="btn-ghost" data-bm-del="${escapeHtml(b.id)}" style="padding:4px 8px;font-size:0.75rem">Delete</button>
              </div>
              <a class="link-out" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.url)}</a>
              <p>${escapeHtml(b.note || "")}</p>
            </div>`).join("") : `<div class="empty-state">No bookmarks yet.</div>`}
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
      <div class="canvas-header"><div><h2>Favorites</h2><p>Cross-shelf: favorited reviews + bookmarks.</p></div></div>
      <h3 style="font-family:var(--font-display);font-size:1.1rem;margin:8px 0 10px;color:var(--text-muted)">Reviews</h3>
      ${cards.length ? `<div class="bento">${cards.map(cardEl).join("")}</div>` : `<div class="empty-state">No favorite reviews.</div>`}
      <h3 style="font-family:var(--font-display);font-size:1.1rem;margin:22px 0 10px;color:var(--text-muted)">Bookmarks</h3>
      <div class="shelf">
        ${bms.length ? bms.map((b) => `
            <div class="shelf-item">
              <div class="shelf-item-top"><h4>${escapeHtml(b.title)}</h4></div>
              <a class="link-out" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.url)}</a>
              <p>${escapeHtml(b.note || "")}</p>
            </div>`).join("") : `<div class="empty-state">No favorite bookmarks.</div>`}
      </div>`;
  }

  function renderSpitballs() {
    const q = ui.search.trim().toLowerCase();
    let list = [...state.spitballs];
    if (q) list = list.filter((s) => [s.title, s.body].join(" ").toLowerCase().includes(q));
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return `
      <div class="canvas-header"><div><h2>Spitballs</h2><p>Raw future-project ideas. Funnel: Spitball → Reviewed → Promoted.</p></div></div>
      <div class="funnel-note">Spitball → Reviewed → Promoted · graduate moves stage forward</div>
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
                <button type="button" class="btn-ghost" data-sb-grad="${escapeHtml(s.id)}" style="font-size:0.78rem">Graduate →</button>
                <button type="button" class="btn-danger" data-sb-del="${escapeHtml(s.id)}" style="font-size:0.78rem;padding:6px 10px">Delete</button>
              </div>
            </div>`).join("") : `<div class="empty-state">No spitballs.</div>`}
      </div>`;
  }

  function renderTodos() {
    const q = ui.search.trim().toLowerCase();
    let active = state.todos.filter((t) => !t.parked);
    let parked = state.todos.filter((t) => t.parked);
    if (q) {
      active = active.filter((t) => t.text.toLowerCase().includes(q));
      parked = parked.filter((t) => t.text.toLowerCase().includes(q));
    }
    active.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    parked.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const item = (t) => `
      <div class="shelf-item todo-item" data-todo-id="${escapeHtml(t.id)}">
        <button type="button" class="todo-check ${t.done ? "done" : ""}" data-todo-toggle="${escapeHtml(t.id)}" aria-label="Toggle done">${t.done ? "✓" : ""}</button>
        <span class="todo-text ${t.done ? "struck" : ""}">${escapeHtml(t.text)}</span>
        <span class="sev ${escapeHtml(t.severity || "med")}">${escapeHtml(t.severity || "med")}</span>
        <div class="todo-controls">
          <button type="button" data-todo-up="${escapeHtml(t.id)}" title="Move up">↑</button>
          <button type="button" data-todo-down="${escapeHtml(t.id)}" title="Move down">↓</button>
          <button type="button" data-todo-park="${escapeHtml(t.id)}" title="${t.parked ? "Unpark" : "Park for later"}">${t.parked ? "↩" : "⏸"}</button>
          <button type="button" data-todo-del="${escapeHtml(t.id)}" title="Delete">✕</button>
        </div>
      </div>`;
    return `
      <div class="canvas-header"><div><h2>To-do</h2><p>Personal tracker — check-off, severity, reorder, parking lane.</p></div></div>
      <div class="shelf-toolbar"><button type="button" class="btn-gold" id="btn-add-todo">+ Add to-do</button></div>
      <div class="shelf">${active.length ? active.map(item).join("") : `<div class="empty-state">Inbox clear.</div>`}</div>
      <div class="parked-zone">
        <div class="label">Parking lane</div>
        <div class="shelf">${parked.length ? parked.map(item).join("") : `<div class="empty-state" style="padding:16px">Nothing parked.</div>`}</div>
      </div>`;
  }

  function wireCanvasEvents(canvas) {
    canvas.querySelectorAll("[data-card-id]").forEach((el) => {
      const open = () => openDrawer(el.dataset.cardId);
      el.addEventListener("click", (e) => { if (e.target.closest("[data-fav]")) return; open(); });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
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
    canvas.querySelectorAll("[data-todo-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = state.todos.find((x) => x.id === btn.dataset.todoToggle);
        if (!t) return;
        t.done = !t.done; save(); render();
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
    const flow = ["spitball", "reviewed", "promoted"];
    const i = flow.indexOf(s.stage || "spitball");
    if (i < flow.length - 1) {
      s.stage = flow[i + 1];
      save(); render(); toast(`Stage → ${s.stage}`);
    } else toast("Already promoted");
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
      <div class="drawer-actions-row">
        <a class="btn-primary" href="${escapeHtml(c.url || "#")}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">Open link ↗</a>
        <button type="button" class="btn-ghost" id="d-copy-brief">Copy Cursor brief</button>
        <button type="button" class="btn-ghost" id="d-fav">${c.favorite ? "★ Favorited" : "☆ Favorite"}</button>
        <button type="button" class="btn-ghost" id="d-promote">${c.promoted ? "↑ Promoted" : "Promote"}</button>
        <button type="button" class="btn-danger" id="d-delete">Delete</button>
      </div>
      <div>
        <div class="field-label">Goes to</div>
        <select class="goes-select" id="d-goes">
          <option value="">— none —</option>
          ${PROJECTS.map((p) => `<option value="${escapeHtml(p)}" ${c.goesTo === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
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
      <div class="callout callout-rec">
        <div class="callout-title">My recommendation</div>
        <p>${escapeHtml(c.recommendation || "—")}</p>
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
    drawer.setAttribute("aria-hidden", "false");

    document.getElementById("d-copy-brief").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(c.cursorBrief || "");
        toast("Cursor brief copied");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = c.cursorBrief || "";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("Cursor brief copied");
      }
    });
    document.getElementById("d-fav").addEventListener("click", () => toggleFavorite(c.id));
    document.getElementById("d-promote").addEventListener("click", () => {
      c.promoted = !c.promoted; save(); render(); openDrawer(c.id);
    });
    document.getElementById("d-delete").addEventListener("click", () => deleteCard(c.id));
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
      c.action = e.target.value || null; save(); render(); openDrawer(c.id);
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
    document.getElementById("drawer").classList.remove("open");
    document.getElementById("drawer-backdrop").classList.remove("open");
    document.getElementById("drawer").setAttribute("aria-hidden", "true");
    document.getElementById("drawer-sticky").innerHTML = "";
    document.getElementById("drawer-body").innerHTML = "";
  }

  function openModal(title, bodyHtml, footHtml) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHtml;
    document.getElementById("modal-foot").innerHTML = footHtml;
    document.getElementById("modal-backdrop").classList.add("open");
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("open");
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
        <label>Goes to<select id="f-goes"><option value="">— none —</option>${PROJECTS.map((p) => `<option value="${p}">${p}</option>`).join("")}</select></label>
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
      state.bookmarks.unshift({
        id: uid("bm"), title, url,
        note: document.getElementById("f-note").value.trim(),
        favorite: false, createdAt: new Date().toISOString(),
      });
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
        <label>Task<input id="f-text" /></label>
        <label>Severity<select id="f-sev">
          <option value="high">high</option>
          <option value="med" selected>med</option>
          <option value="low">low</option>
        </select></label>
        <label><span style="text-transform:none;letter-spacing:normal;color:var(--text-muted)"><input type="checkbox" id="f-park" /> Park for later</span></label>
      </div>`,
      `<button type="button" class="btn-ghost" id="modal-cancel">Cancel</button>
       <button type="button" class="btn-gold" id="modal-save">Save</button>`
    );
    document.getElementById("modal-cancel").onclick = closeModal;
    document.getElementById("modal-save").onclick = () => {
      const text = document.getElementById("f-text").value.trim();
      if (!text) { toast("Task required"); return; }
      const maxOrder = state.todos.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
      state.todos.push({
        id: uid("todo"), text, done: false,
        severity: document.getElementById("f-sev").value,
        parked: document.getElementById("f-park").checked,
        order: maxOrder + 1, createdAt: new Date().toISOString(),
      });
      save(); closeModal(); render(); toast("To-do added");
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
        save(); closeDrawer(); render();
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
      save(); closeDrawer();
      ui.filterLane = ""; ui.filterCategory = "";
      ui.filterPromoted = false; ui.filterFavorites = false;
      ui.filterProject = ""; ui.search = "";
      document.getElementById("search").value = "";
      render(); toast("Reset to seed");
    } catch {
      toast("Reset failed — seed.json missing?");
    }
  }

  init();
})();
