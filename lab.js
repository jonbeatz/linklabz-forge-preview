/* LinkLabz Forge — GodUI favorites lab (vanilla, no build).
   Wired to the live review / bookmark / spitball / to-do state. */
(() => {
  "use strict";

  let api = null;
  let booted = false;
  let builtSig = "";
  let comboActive = 0;
  let comboOpen = false;
  let coastCleanup = null;
  let toastCollapsed = false;
  let toastTimer = 0;
  let menuState = null;

  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = () => window.matchMedia("(pointer: coarse)").matches;

  function esc(s) {
    return api.escapeHtml(s);
  }

  function boot(forge) {
    api = forge || api || window.__forge;
    if (!api) return;
    if (!booted) {
      booted = true;
      bindOnce();
    }
    afterRender();
  }

  function bindOnce() {
    const labBtn = document.getElementById("btn-lab");
    if (labBtn) {
      labBtn.addEventListener("click", () => {
        api.ui.lab = !api.ui.lab;
        api.saveLabPref();
        if (!api.ui.lab && (api.ui.layout === "band" || api.ui.layout === "coast")) {
          /* layout value stays; the board falls back to Lanes until Lab is on again */
        }
        api.render();
        api.toast(api.ui.lab ? "Lab on — facets, Band, Coast, glass" : "Lab off — classic board");
      });
    }

    const tabbar = document.getElementById("tabbar");
    if (tabbar) {
      tabbar.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        api.setView(btn.dataset.view);
      });
      tabbar.addEventListener("keydown", (e) => {
        const tabs = [...tabbar.querySelectorAll("[data-view]")];
        const i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        let next = i;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        else return;
        e.preventDefault();
        tabs[next].focus();
        api.setView(tabs[next].dataset.view);
      });
    }

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKey, true);
    document.addEventListener("pointermove", onHoloMove, { passive: true });
    document.addEventListener("pointerleave", onHoloLeave, true);

    const island = document.getElementById("island");
    if (island) {
      island.addEventListener("pointermove", onSheen);
      island.addEventListener("pointerleave", () => {
        island.style.setProperty("--sheen", "0");
      });
    }

    const helpBody = document.querySelector(".help-body");
    if (helpBody && !helpBody.querySelector(".acc")) enhanceHelp(helpBody);

    const more = document.getElementById("more-dropdown");
    const moreBtn = document.getElementById("btn-more");
    if (more && moreBtn) bindStaticMenu(more, moreBtn);

    const host = document.getElementById("toast-host");
    if (host) {
      const goo = document.createElement("div");
      goo.className = "toast-goo";
      goo.setAttribute("aria-hidden", "true");
      host.prepend(goo);
      const stackBtn = document.createElement("button");
      stackBtn.type = "button";
      stackBtn.className = "toast-stack-btn";
      stackBtn.hidden = true;
      stackBtn.addEventListener("click", () => {
        toastCollapsed = !toastCollapsed;
        syncGoo();
      });
      host.appendChild(stackBtn);
      const obs = new MutationObserver(() => syncGoo(true));
      obs.observe(host, { childList: true });
      syncGoo(false);
    }

    const filterHost = document.getElementById("lab-filters");
    if (filterHost) {
      filterHost.addEventListener("click", onFilterClick);
      filterHost.addEventListener("input", onFilterInput);
      filterHost.addEventListener("keydown", onFilterKey);
    }

    window.addEventListener("resize", () => {
      placePillBlob();
      placeTabBlob();
      syncChipFades();
    });
    document.addEventListener("scroll", (e) => {
      const row = e.target;
      if (!row || !row.classList) return;
      if (row.matches(".project-strip, .todo-filter-strip, .todo-project-strip, .filter-bar, .lab-filters")) {
        syncChipFades();
      }
    }, true);
  }

  function syncChipFades() {
    document.querySelectorAll(".project-strip, .todo-filter-strip, .todo-project-strip, .filter-bar, .lab-filters").forEach((el) => {
      if (el.hidden || getComputedStyle(el).display === "none") {
        el.classList.remove("edge-fade");
        return;
      }
      const overflow = el.scrollWidth > el.clientWidth + 4;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.classList.toggle("edge-fade", overflow && !atEnd);
    });
  }

  function afterRender() {
    if (!api) return;
    const lab = !!api.ui.lab;
    document.body.classList.toggle("lab-on", lab);
    const labBtn = document.getElementById("btn-lab");
    if (labBtn) {
      labBtn.classList.toggle("on", lab);
      labBtn.setAttribute("aria-pressed", String(lab));
    }
    document.querySelectorAll(".lab-only").forEach((el) => {
      el.hidden = !lab;
    });
    const mega = document.getElementById("lab-mega");
    if (mega) {
      mega.hidden = !lab;
      if (lab && !mega.childElementCount) buildMega(mega);
    }
    const island = document.getElementById("island");
    if (island) island.classList.toggle("lab-glass", lab && !coarse());

    const showFilters = lab && (api.ui.view === "board" || api.ui.view === "favorites");
    const filterHost = document.getElementById("lab-filters");
    if (filterHost) {
      filterHost.hidden = !showFilters;
      if (showFilters) ensureFilters(filterHost);
      else updateFilterSelection();
    }
    const strip = document.getElementById("project-strip");
    if (strip) strip.classList.toggle("lab-replaced", showFilters);

    document.querySelectorAll("#nav .pill").forEach((p) => {
      if (p.dataset.view === api.ui.view) p.setAttribute("aria-current", "page");
      else p.removeAttribute("aria-current");
    });
    document.querySelectorAll("#tabbar [data-view]").forEach((p) => {
      const on = p.dataset.view === api.ui.view;
      if (on) p.setAttribute("aria-current", "page");
      else p.removeAttribute("aria-current");
    });
    const badge = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(n);
    };
    const cards = api.state.cards || [];
    const bms = api.state.bookmarks || [];
    badge("tab-count-board", cards.length);
    badge("tab-count-bookmarks", bms.length);
    badge("tab-count-spitballs", (api.state.spitballs || []).length);
    badge("tab-count-todo", (api.state.todos || []).filter((t) => !t.done).length);
    badge("tab-count-favorites", cards.filter((c) => c.favorite).length + bms.filter((b) => b.favorite).length);

    const brand = document.querySelector(".brand-badge");
    if (brand) brand.textContent = lab ? "review board · lab" : "review board · v1";

    placePillBlob();
    placeTabBlob();
    syncChipFades();
    requestAnimationFrame(() => {
      placePillBlob();
      placeTabBlob();
      syncChipFades();
    });
  }

  function placePillBlob() {
    const nav = document.getElementById("nav");
    const blob = nav && nav.querySelector(".pill-blob");
    const active = nav && nav.querySelector(".pill.active");
    if (!blob || !active || nav.offsetParent === null) return;
    blob.style.width = active.offsetWidth + "px";
    blob.style.height = active.offsetHeight + "px";
    blob.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    nav.classList.add("blob-on");
  }

  function placeTabBlob() {
    const bar = document.getElementById("tabbar");
    const blob = bar && bar.querySelector(".tabbar-blob");
    const active = bar && bar.querySelector("[aria-current='page']");
    if (!blob || !active || bar.offsetParent === null) return;
    blob.style.width = active.offsetWidth + "px";
    blob.style.height = active.offsetHeight + "px";
    blob.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  }

  /* ——— Accordion ——— */
  function enhanceHelp(body) {
    const surfaces = [...body.querySelectorAll(":scope > .help-surface")];
    if (!surfaces.length) return;
    const acc = document.createElement("div");
    acc.className = "acc";
    acc.dataset.acc = "multiple";
    surfaces.forEach((surface, i) => {
      const title = surface.querySelector("strong")?.textContent || `Section ${i + 1}`;
      acc.appendChild(accItem(`help-acc-${i}`, title, surface, i < 2));
    });
    const anchor = body.querySelector("#help-surfaces");
    if (anchor) anchor.after(acc);
    else body.prepend(acc);
  }

  function accItem(id, title, node, open) {
    const item = document.createElement("div");
    item.className = "acc-item" + (open ? " open" : "");
    const btnId = id + "-btn";
    const panelId = id + "-panel";
    item.innerHTML = `
      <h3 class="acc-heading">
        <button type="button" class="acc-trigger" id="${btnId}" aria-expanded="${open ? "true" : "false"}" aria-controls="${panelId}">
          <span></span>
          <span class="acc-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div class="acc-panel" id="${panelId}" role="region" aria-labelledby="${btnId}">
        <div class="acc-panel-inner"></div>
      </div>`;
    item.querySelector(".acc-trigger span").textContent = title;
    item.querySelector(".acc-panel-inner").appendChild(node);
    return item;
  }

  function setAcc(item, open) {
    item.classList.toggle("open", open);
    const btn = item.querySelector(".acc-trigger");
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }

  function onAccClick(btn) {
    const item = btn.closest(".acc-item");
    const root = btn.closest(".acc");
    if (!item || !root) return;
    const multi = root.dataset.acc !== "single";
    const willOpen = !item.classList.contains("open");
    if (!multi && willOpen) {
      root.querySelectorAll(".acc-item.open").forEach((el) => setAcc(el, false));
    }
    if (!willOpen && !multi && root.dataset.collapsible === "false") return;
    setAcc(item, willOpen);
  }

  function enhanceDrawer() {
    const body = document.getElementById("drawer-body");
    if (!body || body.querySelector(":scope > .acc")) return;
    const take = (el) => el || null;
    const groups = [
      ["Cherry-pick", take(body.querySelector(".callout-cherry"))],
      ["Meta", take(body.querySelector(".meta-grid"))],
      ["Site preview", take(body.querySelector(".site-preview"))],
      ["Write-up", ...[...body.querySelectorAll(".field-block")].filter((el) => {
        const label = el.querySelector(".field-label")?.textContent || "";
        return /Grading|Related|Cursor brief/.test(label);
      })],
      ["Evidence", take(body.querySelector("#d-evidence")?.closest(".field-block"))],
      ["Screenshot", take(body.querySelector("#d-shot-slot")?.parentElement)],
    ];
    const acc = document.createElement("div");
    acc.className = "acc";
    acc.dataset.acc = "multiple";
    let i = 0;
    for (const [title, ...nodes] of groups) {
      const present = nodes.filter(Boolean);
      if (!present.length) continue;
      const wrap = document.createElement("div");
      present.forEach((n) => wrap.appendChild(n));
      const open = title === "Write-up" || title === "Cherry-pick";
      acc.appendChild(accItem("drawer-acc-" + i, title, wrap, open));
      i += 1;
    }
    if (i) body.appendChild(acc);
  }

  /* ——— Filter bar + combobox ——— */
  function laneIds() {
    if (api.ui.filterLanes && api.ui.filterLanes.length) return api.ui.filterLanes.slice();
    return api.ui.filterLane ? [api.ui.filterLane] : [];
  }
  function catIds() {
    if (api.ui.filterCategories && api.ui.filterCategories.length) return api.ui.filterCategories.slice();
    return api.ui.filterCategory ? [api.ui.filterCategory] : [];
  }
  function projectIds() {
    if (api.ui.filterProjects && api.ui.filterProjects.length) return api.ui.filterProjects.slice();
    return api.ui.filterProject ? [api.ui.filterProject] : [];
  }

  function countMap(fn) {
    const map = new Map();
    for (const c of api.state.cards) {
      const k = fn(c);
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  function filterSig() {
    const cats = api.categories().join("|");
    const projects = api.projectList().join("|");
    return cats + "¦" + projects + "¦" + api.state.cards.length;
  }

  function ensureFilters(host) {
    const sig = filterSig();
    if (sig === builtSig && host.querySelector(".facet")) {
      updateFilterSelection();
      return;
    }
    if (host.contains(document.activeElement) && host.querySelector(".facet")) {
      updateFilterSelection();
      return;
    }
    const laneCounts = countMap((c) => c.lane);
    const catCounts = countMap((c) => c.category);
    const projCounts = countMap((c) => c.goesTo);
    const lanes = api.LANES.map((l) => ({
      value: l.id,
      label: l.label,
      count: laneCounts.get(l.id) || 0,
    }));
    const cats = api.categories().map((c) => ({ value: c, label: c, count: catCounts.get(c) || 0 }));
    const marks = [
      { value: "promoted", label: "Promoted", count: api.state.cards.filter((c) => c.promoted).length },
      { value: "favorites", label: "Favorites", count: api.state.cards.filter((c) => c.favorite).length },
    ];
    host.innerHTML = [
      facetHtml("lane", "Lane", lanes),
      facetHtml("category", "Category", cats),
      facetHtml("marks", "Marks", marks),
      comboHtml(projCounts),
    ].join("");
    builtSig = sig;
    updateFilterSelection();
  }

  function facetHtml(id, label, options) {
    const opts = options.map((o, i) => `
      <button type="button" role="option" id="opt-${id}-${i}" data-facet="${id}" data-value="${esc(o.value)}" aria-selected="false">
        <span>${esc(o.label)}</span>
        <span class="facet-count">${o.count}</span>
      </button>`).join("");
    return `
      <div class="facet" data-facet-root="${id}">
        <button type="button" class="facet-main" id="facet-btn-${id}" aria-haspopup="dialog" aria-expanded="false" aria-controls="facet-pop-${id}">${esc(label)}</button>
        <button type="button" class="facet-clear" data-clear="${id}" hidden aria-label="Clear ${esc(label)}">×</button>
        <div class="facet-pop" id="facet-pop-${id}" role="dialog" aria-label="${esc(label)} filter" hidden>
          <input type="search" data-facet-search="${id}" aria-label="Search ${esc(label)}" placeholder="Search ${esc(label).toLowerCase()}…" autocomplete="off" />
          <div class="facet-options" role="listbox" aria-multiselectable="true" aria-label="${esc(label)}">${opts}</div>
          <p class="facet-empty" hidden>No matches</p>
        </div>
      </div>`;
  }

  function comboHtml(projCounts) {
    const projects = api.projectList();
    const opts = projects.map((p, i) => `
      <li role="presentation">
        <button type="button" role="option" id="proj-opt-${i}" data-value="${esc(p)}" aria-selected="false">
          <span class="combo-label">${esc(p)}</span>
          <span class="combo-count">${projCounts.get(p) || 0}</span>
        </button>
      </li>`).join("");
    return `
      <div class="combo" id="project-combo">
        <div class="combo-control" id="project-combo-box">
          <span class="combo-chips" id="project-chips"></span>
          <input id="project-combo-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="project-combo-list" aria-multiselectable="true" placeholder="Projects…" autocomplete="off" />
        </div>
        <ul class="combo-list" id="project-combo-list" role="listbox" aria-multiselectable="true" aria-label="Projects" hidden>
          ${opts || `<li class="facet-empty">No projects yet</li>`}
          <li role="presentation"><button type="button" class="combo-pin" id="combo-clear-projects">Clear projects</button></li>
        </ul>
      </div>`;
  }

  function selectionFor(id) {
    if (id === "lane") return laneIds();
    if (id === "category") return catIds();
    if (id === "marks") {
      const v = [];
      if (api.ui.filterPromoted) v.push("promoted");
      if (api.ui.filterFavorites) v.push("favorites");
      return v;
    }
    return [];
  }

  function labelFor(id, value) {
    if (id === "lane") return api.LANES.find((l) => l.id === value)?.label || value;
    if (value === "promoted") return "Promoted";
    if (value === "favorites") return "Favorites";
    return value;
  }

  function updateFilterSelection() {
    document.querySelectorAll("[data-facet-root]").forEach((root) => {
      const id = root.dataset.facetRoot;
      const selected = selectionFor(id);
      const main = root.querySelector(".facet-main");
      const clear = root.querySelector(".facet-clear");
      root.classList.toggle("has-value", selected.length > 0);
      if (clear) clear.hidden = selected.length === 0;
      if (main) {
        const base = id === "lane" ? "Lane" : id === "category" ? "Category" : "Marks";
        if (!selected.length) main.textContent = base;
        else if (selected.length === 1) main.textContent = `${base}: ${labelFor(id, selected[0])}`;
        else main.textContent = `${base}: ${labelFor(id, selected[0])} +${selected.length - 1}`;
      }
      root.querySelectorAll("[role='option']").forEach((opt) => {
        opt.setAttribute("aria-selected", String(selected.includes(opt.dataset.value)));
      });
    });
    paintChips();
    const list = document.getElementById("project-combo-list");
    if (list) {
      const selected = projectIds();
      list.querySelectorAll("[role='option']").forEach((opt) => {
        opt.setAttribute("aria-selected", String(selected.includes(opt.dataset.value)));
      });
    }
  }

  function paintChips() {
    const box = document.getElementById("project-chips");
    if (!box) return;
    const ids = projectIds();
    box.innerHTML = ids.map((p) => `
      <span class="combo-chip">${esc(p)}
        <button type="button" data-chip-remove="${esc(p)}" aria-label="Remove ${esc(p)}">×</button>
      </span>`).join("");
  }

  function closePops(except) {
    document.querySelectorAll(".facet-pop").forEach((pop) => {
      if (except && pop.id === except) return;
      pop.hidden = true;
      const btn = document.querySelector(`[aria-controls="${pop.id}"]`);
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
    if (except !== "project-combo-list") closeCombo();
  }

  function onFilterClick(e) {
    const clear = e.target.closest("[data-clear]");
    if (clear) {
      e.stopPropagation();
      applyFacet(clear.dataset.clear, []);
      return;
    }
    const chip = e.target.closest("[data-chip-remove]");
    if (chip) {
      applyProjects(projectIds().filter((p) => p !== chip.dataset.chipRemove));
      return;
    }
    if (e.target.closest("#combo-clear-projects")) {
      applyProjects([]);
      closeCombo();
      return;
    }
    const opt = e.target.closest(".facet-options [role='option']");
    if (opt) {
      const id = opt.dataset.facet;
      const cur = selectionFor(id);
      const v = opt.dataset.value;
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat(v);
      applyFacet(id, next);
      return;
    }
    const proj = e.target.closest("#project-combo-list [role='option']");
    if (proj) {
      const v = proj.dataset.value;
      const cur = projectIds();
      applyProjects(cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat(v));
      const input = document.getElementById("project-combo-input");
      if (input) {
        input.value = "";
        filterCombo("");
        input.focus();
      }
      return;
    }
    const main = e.target.closest(".facet-main");
    if (main) {
      const pop = document.getElementById(main.getAttribute("aria-controls"));
      const open = pop && pop.hidden;
      closePops(open ? pop.id : null);
      if (pop) {
        pop.hidden = !open;
        main.setAttribute("aria-expanded", String(!!open));
        if (open) {
          const search = pop.querySelector("input");
          if (search) search.focus();
        }
      }
      return;
    }
    const input = e.target.closest("#project-combo-input");
    if (input) openCombo();
  }

  function onFilterInput(e) {
    const search = e.target.closest("[data-facet-search]");
    if (search) {
      const q = search.value.trim().toLowerCase();
      const pop = search.closest(".facet-pop");
      let shown = 0;
      pop.querySelectorAll("[role='option']").forEach((opt, i) => {
        const show = !q || opt.textContent.toLowerCase().includes(q);
        opt.hidden = !show;
        if (show) {
          opt.style.animationDelay = Math.min(i, 8) * 0.03 + "s";
          shown += 1;
        }
      });
      const empty = pop.querySelector(".facet-empty");
      if (empty) empty.hidden = shown > 0;
      return;
    }
    if (e.target.id === "project-combo-input") {
      openCombo();
      filterCombo(e.target.value);
    }
  }

  function onFilterKey(e) {
    const pop = e.target.closest(".facet-pop");
    if (pop && !pop.hidden) {
      const opts = [...pop.querySelectorAll("[role='option']:not([hidden])")];
      const current = document.activeElement;
      let i = opts.indexOf(current);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const n = opts[Math.min(opts.length - 1, i + 1)] || opts[0];
        if (n) n.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (i <= 0) pop.querySelector("input")?.focus();
        else opts[i - 1].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        pop.hidden = true;
        document.querySelector(`[aria-controls="${pop.id}"]`)?.focus();
      } else if ((e.key === "Enter" || e.key === " ") && current?.getAttribute("role") === "option") {
        e.preventDefault();
        current.click();
      }
      return;
    }
    if (e.target.id === "project-combo-input") onComboKey(e);
  }

  function applyFacet(id, values) {
    if (id === "lane") {
      api.ui.filterLanes = values.slice();
      api.ui.filterLane = values.length === 1 ? values[0] : "";
      const sel = document.getElementById("filter-lane");
      if (sel) sel.value = api.ui.filterLane || "";
    } else if (id === "category") {
      api.ui.filterCategories = values.slice();
      api.ui.filterCategory = values.length === 1 ? values[0] : "";
      const sel = document.getElementById("filter-category");
      if (sel) sel.value = api.ui.filterCategory || "";
    } else if (id === "marks") {
      api.ui.filterPromoted = values.includes("promoted");
      api.ui.filterFavorites = values.includes("favorites");
    }
    api.render();
  }

  function applyProjects(values) {
    api.ui.filterProjects = values.slice();
    api.ui.filterProject = values.length === 1 ? values[0] : "";
    api.render();
  }

  function openCombo() {
    const list = document.getElementById("project-combo-list");
    const input = document.getElementById("project-combo-input");
    if (!list || !input) return;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    comboOpen = true;
    filterCombo(input.value || "");
  }

  function closeCombo() {
    const list = document.getElementById("project-combo-list");
    const input = document.getElementById("project-combo-input");
    if (list) list.hidden = true;
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    comboOpen = false;
  }

  function filterCombo(q) {
    const list = document.getElementById("project-combo-list");
    if (!list) return;
    const query = q.trim().toLowerCase();
    const opts = [...list.querySelectorAll("[role='option']")];
    let first = -1;
    opts.forEach((opt, i) => {
      const label = opt.querySelector(".combo-label");
      const text = label ? label.textContent : opt.textContent;
      const show = !query || text.toLowerCase().includes(query);
      opt.hidden = !show;
      opt.parentElement.hidden = !show;
      if (show && first < 0) first = i;
      if (label) {
        if (!query) label.textContent = text;
        else {
          const idx = text.toLowerCase().indexOf(query);
          if (idx >= 0) {
            label.innerHTML = `${esc(text.slice(0, idx))}<mark>${esc(text.slice(idx, idx + query.length))}</mark>${esc(text.slice(idx + query.length))}`;
          }
        }
      }
      opt.style.animationDelay = "0s";
    });
    const visible = opts.filter((o) => !o.hidden);
    visible.forEach((opt, i) => { opt.style.animationDelay = Math.min(i, 8) * 0.03 + "s"; });
    comboActive = 0;
    setComboActive(visible, 0);
  }

  function setComboActive(visible, index) {
    if (!visible.length) return;
    comboActive = Math.max(0, Math.min(index, visible.length - 1));
    visible.forEach((opt, i) => opt.classList.toggle("is-active", i === comboActive));
    const input = document.getElementById("project-combo-input");
    if (input && visible[comboActive]) input.setAttribute("aria-activedescendant", visible[comboActive].id);
    visible[comboActive].scrollIntoView({ block: "nearest" });
  }

  function onComboKey(e) {
    const list = document.getElementById("project-combo-list");
    const input = e.target;
    const visible = list ? [...list.querySelectorAll("[role='option']:not([hidden])")] : [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openCombo();
      const vis = [...document.querySelectorAll("#project-combo-list [role='option']:not([hidden])")];
      setComboActive(vis, comboOpen ? comboActive + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setComboActive(visible, comboActive - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const vis = [...document.querySelectorAll("#project-combo-list [role='option']:not([hidden])")];
      const opt = vis[comboActive];
      if (opt) opt.click();
    } else if (e.key === "Escape") {
      if (comboOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeCombo();
      }
    } else if (e.key === "Backspace" && !input.value) {
      const cur = projectIds();
      if (cur.length) applyProjects(cur.slice(0, -1));
    }
  }

  /* ——— Mega menu ——— */
  function buildMega(root) {
    root.innerHTML = `
      <span class="mega-hl" aria-hidden="true"></span>
      <button type="button" class="mega-trigger" data-mega="workspace" aria-expanded="false" aria-controls="mega-panel">Workspace</button>
      <button type="button" class="mega-trigger" data-mega="board" aria-expanded="false" aria-controls="mega-panel">Board</button>
      <button type="button" class="mega-trigger" data-mega="reference" aria-expanded="false" aria-controls="mega-panel">Reference</button>
      <div class="mega-panel" id="mega-panel" hidden>
        <div class="mega-pane" data-mega-pane="workspace">
          <p class="mega-heading">Workspace</p>
          ${megaLink("export", "↓", "Download workspace", "Export reviews, bookmarks, spitballs, and to-dos.")}
          ${megaLink("import", "↑", "Load workspace", "Replace the board from a Forge JSON file.")}
          ${megaLink("reset", "↺", "Reset to seed", "Restore the protected seed harvest.")}
          ${megaLink("clear", "⌀", "Clear filters", "Drop lane, project, mark, and search filters.")}
        </div>
        <div class="mega-pane" data-mega-pane="board" hidden>
          <p class="mega-heading">Board</p>
          ${megaLink("lanes", "☰", "Lanes", "Home layout. Decide where each review lives.")}
          ${megaLink("bento", "▦", "Bento", "Dense compare grid of the same lanes.")}
          ${megaLink("cover", "▣", "Cover", "Browse Try It, Promoted, and Favorites.")}
          ${megaLink("band", "▥", "Band", "Lab lens — lanes as an image accordion.")}
          ${megaLink("coast", "≋", "Coast", "Lab lens — throw the review strip.")}
        </div>
        <div class="mega-pane" data-mega-pane="reference" hidden>
          <p class="mega-heading">Reference</p>
          ${megaLink("help", "?", "Forge reference", "Surfaces, keys, and what is experimental.")}
          ${megaLink("palette", "⌘", "Command palette", "Jump, filter, capture a to-do.")}
          ${megaLink("tools", "⚙", "Tools shelf", "Download, load, reset, and the rest of the shelf.")}
          ${megaLink("swap", "⇄", "Card Swap", "On the Tools shelf. Up to three Try It reviews.")}
        </div>
      </div>`;
    let openTimer = 0;
    let closeTimer = 0;
    const hl = root.querySelector(".mega-hl");
    const panel = root.querySelector(".mega-panel");

    function moveHl(btn) {
      if (!hl || !btn) return;
      hl.style.width = btn.offsetWidth + "px";
      hl.style.height = btn.offsetHeight + "px";
      hl.style.transform = `translate(${btn.offsetLeft - 3}px, ${btn.offsetTop - 3}px)`;
    }

    function openMega(key, btn) {
      clearTimeout(closeTimer);
      root.querySelectorAll(".mega-trigger").forEach((t) => {
        t.setAttribute("aria-expanded", String(t === btn));
      });
      panel.hidden = false;
      root.querySelectorAll(".mega-pane").forEach((p) => {
        p.hidden = p.dataset.megaPane !== key;
      });
      const pane = root.querySelector(`[data-mega-pane="${key}"]`);
      if (pane) panel.style.height = pane.scrollHeight + 24 + "px";
      moveHl(btn);
    }

    function closeMega() {
      panel.hidden = true;
      panel.style.height = "";
      root.querySelectorAll(".mega-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }

    root.addEventListener("mouseover", (e) => {
      if (coarse()) return;
      const btn = e.target.closest(".mega-trigger");
      if (!btn || !root.contains(btn)) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      openTimer = setTimeout(() => openMega(btn.dataset.mega, btn), reduce() ? 0 : 80);
    });
    root.addEventListener("mouseleave", () => {
      clearTimeout(openTimer);
      closeTimer = setTimeout(closeMega, reduce() ? 0 : 140);
    });
    root.addEventListener("focusin", (e) => {
      const btn = e.target.closest(".mega-trigger");
      if (btn) openMega(btn.dataset.mega, btn);
    });
    root.addEventListener("keydown", (e) => {
      const triggers = [...root.querySelectorAll(".mega-trigger")];
      const i = triggers.indexOf(document.activeElement);
      if (e.key === "Escape") {
        closeMega();
        return;
      }
      if (i >= 0 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        const n = e.key === "ArrowRight" ? (i + 1) % triggers.length : (i - 1 + triggers.length) % triggers.length;
        triggers[n].focus();
      }
      if (i >= 0 && e.key === "ArrowDown") {
        e.preventDefault();
        const pane = root.querySelector(".mega-pane:not([hidden])");
        const link = pane && pane.querySelector(".mega-link");
        if (link) link.focus();
      }
    });
    panel.addEventListener("click", (e) => {
      const link = e.target.closest("[data-mega-run]");
      if (!link) return;
      const run = link.dataset.megaRun;
      closeMega();
      if (run === "export") api.exportJson();
      else if (run === "import") api.importClick();
      else if (run === "reset") api.resetToSeed();
      else if (run === "clear") api.clearFilters();
      else if (run === "lanes") api.setLayout("sections");
      else if (run === "bento") api.setLayout("grid");
      else if (run === "cover") api.setLayout("cover");
      else if (run === "band") api.setLayout("band");
      else if (run === "coast") api.setLayout("coast");
      else if (run === "swap") api.jumpToCardSwap();
      else if (run === "help") api.openHelp();
      else if (run === "palette") api.openPalette();
      else if (run === "tools") api.setView("tools");
    });
    const first = root.querySelector(".mega-trigger");
    if (first) moveHl(first);
  }

  function megaLink(run, ico, title, desc) {
    return `<button type="button" class="mega-link" data-mega-run="${run}">
      <span class="mega-ico" aria-hidden="true">${ico}</span>
      <span><strong>${esc(title)}</strong><span>${esc(desc)}</span></span>
    </button>`;
  }

  /* ——— Dropdown menu ——— */
  function bindStaticMenu(menu, trigger) {
    menu.setAttribute("role", "menu");
    menu.querySelectorAll("button").forEach((b) => b.setAttribute("role", "menuitem"));
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-controls", menu.id);
    menu.addEventListener("keydown", (e) => menuKeys(e, menu, () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }));
  }

  function menuKeys(e, menu, close) {
    const items = [...menu.querySelectorAll("[role='menuitem']:not([hidden])")].filter((el) => !el.closest("[hidden]"));
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  }

  function openCardMenu(btn) {
    closeCardMenu();
    const id = btn.dataset.cardMenu;
    const card = api.state.cards.find((c) => c.id === id);
    if (!card) return;
    const menu = document.createElement("div");
    menu.className = "god-menu";
    menu.id = "card-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `Actions for ${card.title}`);
    const laneItems = api.LANES.map((l) =>
      `<button type="button" role="menuitem" data-act="lane" data-lane="${l.id}">${esc(l.label)}</button>`
    ).join("");
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="open">Open</button>
      <button type="button" role="menuitem" data-act="fav">${card.favorite ? "Unfavorite" : "Favorite"}</button>
      <div class="god-sub" role="none">
        <button type="button" role="menuitem" data-act="submenu" aria-haspopup="menu" aria-expanded="false">Set lane</button>
        <div class="god-submenu god-menu" role="menu" aria-label="Set lane" hidden>${laneItems}</div>
      </div>
      <div class="god-sep" role="separator"></div>
      <button type="button" role="menuitem" data-act="promote">${card.promoted ? "Unpromote" : "Promote"}</button>
      <button type="button" role="menuitem" data-act="copy">Copy link</button>`;
    document.body.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    placeMenu(menu, btn);
    const first = menu.querySelector("[role='menuitem']");
    if (first) first.focus();
    menuState = { menu, btn, id };
    menu.addEventListener("keydown", (e) => {
      const subBtn = e.target.closest("[data-act='submenu']");
      const sub = menu.querySelector(".god-submenu");
      if (e.key === "ArrowRight" && subBtn) {
        e.preventDefault();
        sub.hidden = false;
        subBtn.setAttribute("aria-expanded", "true");
        sub.querySelector("[role='menuitem']")?.focus();
        return;
      }
      if (e.key === "ArrowLeft" && e.target.closest(".god-submenu")) {
        e.preventDefault();
        sub.hidden = true;
        subBtn?.setAttribute("aria-expanded", "false");
        menu.querySelector("[data-act='submenu']")?.focus();
        return;
      }
      if (e.target.closest(".god-submenu")) {
        menuKeys(e, sub, () => closeCardMenu());
        return;
      }
      menuKeys(e, menu, () => closeCardMenu());
    });
    menu.addEventListener("click", (e) => {
      const item = e.target.closest("[role='menuitem']");
      if (!item || item.dataset.act === "submenu") {
        if (item?.dataset.act === "submenu") {
          const sub = menu.querySelector(".god-submenu");
          const open = sub.hidden;
          sub.hidden = !open;
          item.setAttribute("aria-expanded", String(open));
          if (open) sub.querySelector("[role='menuitem']")?.focus();
        }
        return;
      }
      const act = item.dataset.act;
      const lane = item.dataset.lane;
      closeCardMenu();
      if (act === "open") api.openDrawer(id);
      else if (act === "fav") api.toggleFavorite(id);
      else if (act === "promote") api.togglePromoted(id);
      else if (act === "copy") api.copyText(card.url || "", "Link copied");
      else if (act === "lane" && lane) api.setCardLane(id, lane);
    });
  }

  function placeMenu(menu, trigger) {
    const r = trigger.getBoundingClientRect();
    menu.hidden = false;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function closeCardMenu() {
    if (!menuState) return;
    menuState.btn.setAttribute("aria-expanded", "false");
    const back = menuState.btn;
    menuState.menu.remove();
    menuState = null;
    if (back.isConnected) back.focus();
  }

  /* ——— Band + Coast ——— */
  function renderBand(list) {
    const groups = api.LANES.map((lane) => ({
      lane,
      cards: list.filter((c) => c.lane === lane.id),
    })).filter((g) => g.cards.length);
    if (!groups.length) return "";
    const panels = groups.map((g, i) => {
      const c = g.cards[0];
      const shot = api.screenshotSrc(c);
      const letters = String(c.title || "").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
      const mono = letters.length > 1
        ? (letters[0][0] + letters[1][0]).toUpperCase()
        : (letters[0] || "?").slice(0, 2).toUpperCase();
      const active = i === 0;
      const bg = shot
        ? ` style="background-image:linear-gradient(180deg,rgba(11,12,15,.15),rgba(11,12,15,.72)),url('${String(shot).replace(/'/g, "")}')"`
        : "";
      return `
        <div class="band-panel lane-${esc(g.lane.id)}${active ? " is-active" : ""}"${bg}>
          <button type="button" class="band-hit" data-band="${i}" aria-expanded="${active ? "true" : "false"}" aria-label="${esc(g.lane.label)}, ${g.cards.length} review${g.cards.length === 1 ? "" : "s"}. ${esc(c.title)}">
            <span class="band-wash" aria-hidden="true"></span>
            <span class="band-mono" aria-hidden="true">${esc(mono)}</span>
            <span class="band-vert">${esc(g.lane.label)} · ${g.cards.length}</span>
          </button>
          <div class="band-caption">
            <strong>${esc(c.title)}</strong>
            <p>${esc(c.recommendation || c.gradingSummary || "No recommendation yet.")}</p>
            <button type="button" class="band-open" data-band-open="${esc(c.id)}" tabindex="${active ? "0" : "-1"}">Open ${esc(g.lane.label)}</button>
          </div>
        </div>`;
    }).join("");
    return `<section class="band" id="lab-band" aria-label="Lane image accordion">${panels}</section>
      <p class="reorder-hint">Band expands a lane. Open jumps to that review’s drawer. Arrow keys move the open panel.</p>`;
  }

  function renderCoast(list) {
    if (!list.length) return "";
    const slides = list.map((c, i) => `
      <div class="coast-slide" data-coast-index="${i}">
        <button type="button" class="coast-hit" data-coast-open="${esc(c.id)}">
          <div class="coast-kicker">${esc(api.laneName(c.lane))}${c.promoted ? " · promoted" : ""}${c.favorite ? " · favorite" : ""}</div>
          <h3>${esc(c.title)}</h3>
          <div class="concept-rate">${api.starsHtml(c.rating)}</div>
          <p>${esc(c.recommendation || "No recommendation yet.")}</p>
        </button>
      </div>`).join("");
    return `
      <section class="coast" id="lab-coast" aria-roledescription="carousel" aria-label="Inertia gallery of reviews">
        <p class="cover-note"><span class="concept-test-badge">Lab</span> Throw the strip. The centered review sharpens; the edges fall away.</p>
        <div class="coast-viewport" tabindex="0" role="group" aria-label="Review strip">
          <p class="sr-only" data-coast-live aria-live="polite"></p>
          <div class="coast-track">${slides}</div>
        </div>
        <div class="concept-controls">
          <button type="button" class="concept-nav" data-coast-prev aria-label="Previous review">‹</button>
          <span class="concept-count" data-coast-count>1 / ${list.length}</span>
          <button type="button" class="concept-nav" data-coast-next aria-label="Next review">›</button>
        </div>
      </section>`;
  }

  function mountBand(root) {
    const hits = [...root.querySelectorAll(".band-hit")];
    const setActive = (index) => {
      hits.forEach((hit, i) => {
        const on = i === index;
        hit.closest(".band-panel").classList.toggle("is-active", on);
        hit.setAttribute("aria-expanded", String(on));
        const open = hit.parentElement.querySelector(".band-open");
        if (open) open.tabIndex = on ? 0 : -1;
      });
    };
    hits.forEach((hit, i) => {
      const panel = hit.closest(".band-panel");
      panel.addEventListener("mouseenter", () => setActive(i));
      hit.addEventListener("focus", () => setActive(i));
      hit.addEventListener("click", () => setActive(i));
      panel.querySelector("[data-band-open]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        api.openDrawer(e.currentTarget.dataset.bandOpen);
      });
      hit.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const n = Math.min(hits.length - 1, i + 1);
          setActive(n);
          hits[n].focus();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = Math.max(0, i - 1);
          setActive(n);
          hits[n].focus();
        }
      });
    });
  }

  function mountCoast(root) {
    const viewport = root.querySelector(".coast-viewport");
    const track = root.querySelector(".coast-track");
    const slides = [...root.querySelectorAll(".coast-slide")];
    const live = root.querySelector("[data-coast-live]");
    const count = root.querySelector("[data-coast-count]");
    if (!viewport || !track || !slides.length) return () => {};
    const n = slides.length;
    let index = 0;
    let offset = 0;
    let width = 240;
    let gap = 16;
    let velocity = 0;
    let raf = 0;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startOffset = 0;
    let lastX = 0;
    let lastT = 0;
    const falloffOn = !reduce() && !coarse();

    function measure() {
      const view = viewport.clientWidth || 320;
      width = Math.max(180, Math.min(280, Math.round(view * 0.62)));
      gap = view < 480 ? 12 : 18;
      root.style.setProperty("--coast-w", width + "px");
      root.style.setProperty("--coast-gap", gap + "px");
      slides.forEach((s) => { s.style.width = width + "px"; });
    }

    function centerFor(i) {
      const view = viewport.clientWidth || width;
      return (view - width) / 2 - i * (width + gap);
    }

    function nearest(x) {
      const view = viewport.clientWidth || width;
      const stride = width + gap;
      const raw = Math.round(((view - width) / 2 - x) / stride);
      return Math.max(0, Math.min(n - 1, raw));
    }

    function paint() {
      track.style.transform = `translate3d(${offset}px,0,0)`;
      const view = viewport.clientWidth || width;
      const mid = -offset + view / 2;
      const stride = width + gap;
      slides.forEach((slide, i) => {
        const slideMid = i * stride + width / 2;
        const dist = Math.abs(slideMid - mid) / stride;
        const hit = slide.querySelector(".coast-hit");
        if (!hit) return;
        if (!falloffOn) {
          hit.style.transform = "";
          hit.style.opacity = "";
          hit.style.filter = "";
          return;
        }
        const scale = 1 - Math.min(dist, 1.5) * 0.14;
        const opacity = 1 - Math.min(dist, 1.8) * 0.38;
        const blur = Math.min(dist * 1.6, 3);
        hit.style.transform = `scale(${scale})`;
        hit.style.opacity = String(Math.max(0.45, opacity));
        hit.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : "none";
      });
    }

    function announce() {
      const card = slides[index]?.querySelector(".coast-hit");
      const title = card?.querySelector("h3")?.textContent || "";
      if (count) count.textContent = `${index + 1} / ${n}`;
      if (live) live.textContent = title ? `${title}, ${index + 1} of ${n}` : "";
    }

    function goTo(i, instant) {
      index = Math.max(0, Math.min(n - 1, i));
      const dest = centerFor(index);
      if (instant || reduce()) {
        offset = dest;
        velocity = 0;
        paint();
        announce();
        return;
      }
      const from = offset;
      const start = performance.now();
      cancelAnimationFrame(raf);
      const step = (now) => {
        const t = Math.min(1, (now - start) / 420);
        const e = 1 - Math.pow(1 - t, 3);
        offset = from + (dest - from) * e;
        paint();
        if (t < 1) raf = requestAnimationFrame(step);
        else announce();
      };
      raf = requestAnimationFrame(step);
    }

    function coast() {
      cancelAnimationFrame(raf);
      const step = () => {
        velocity *= 0.92;
        offset += velocity;
        const min = centerFor(n - 1);
        const max = centerFor(0);
        if (offset > max) { offset = max; velocity = 0; }
        if (offset < min) { offset = min; velocity = 0; }
        paint();
        if (Math.abs(velocity) > 0.35) raf = requestAnimationFrame(step);
        else goTo(nearest(offset), reduce());
      };
      raf = requestAnimationFrame(step);
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startOffset = offset;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      cancelAnimationFrame(raf);
      viewport.setPointerCapture?.(e.pointerId);
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      if (moved) e.preventDefault();
      offset = startOffset + dx;
      const now = performance.now();
      const dt = Math.max(16, now - lastT);
      velocity = (e.clientX - lastX) / dt * 16;
      lastX = e.clientX;
      lastT = now;
      paint();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      if (!moved) return;
      if (reduce()) goTo(nearest(offset), true);
      else coast();
    }

    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove, { passive: false });
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    viewport.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
    });
    root.querySelector("[data-coast-prev]")?.addEventListener("click", () => goTo(index - 1));
    root.querySelector("[data-coast-next]")?.addEventListener("click", () => goTo(index + 1));
    slides.forEach((slide) => {
      slide.querySelector(".coast-hit")?.addEventListener("click", (e) => {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
          moved = false;
          return;
        }
        const i = Number(slide.dataset.coastIndex);
        if (i !== index) {
          e.preventDefault();
          goTo(i);
          return;
        }
        const id = e.currentTarget.dataset.coastOpen;
        if (id) api.openDrawer(id);
      });
    });
    const onResize = () => { measure(); goTo(index, true); };
    window.addEventListener("resize", onResize);
    measure();
    goTo(0, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }

  /* ——— Reorder ——— */
  function mountReorder(canvas) {
    canvas.querySelectorAll("[data-reorder-zone]").forEach((zone) => {
      let drag = null;
      zone.addEventListener("pointerdown", (e) => {
        const grip = e.target.closest("[data-todo-grip]");
        if (!grip || !zone.contains(grip)) return;
        const item = grip.closest("[data-todo-id]");
        if (!item) return;
        drag = { id: e.pointerId, item, startY: e.clientY, lifted: false };
        grip.setPointerCapture(e.pointerId);
      });
      zone.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.startY;
        if (!drag.lifted) {
          if (Math.abs(dy) < 5) return;
          drag.lifted = true;
          drag.item.classList.add("is-lifted");
          drag.item.style.animation = "none";
          drag.item.style.transition = "none";
        }
        e.preventDefault();
        const beforeTop = drag.item.getBoundingClientRect().top;
        drag.item.style.transform = `translateY(${dy}px)`;
        const rect = drag.item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const items = [...zone.querySelectorAll(":scope > [data-todo-id]")];
        const current = items.indexOf(drag.item);
        let target = current;
        for (let i = 0; i < items.length; i++) {
          if (items[i] === drag.item) continue;
          const r = items[i].getBoundingClientRect();
          const c = r.top + r.height / 2;
          if (i < current && mid < c) { target = i; break; }
          if (i > current && mid > c) target = i;
        }
        if (target !== current) {
          const positions = new Map();
          items.forEach((el) => {
            if (el !== drag.item) positions.set(el, el.getBoundingClientRect().top);
          });
          const ref = items[target];
          if (target > current) zone.insertBefore(drag.item, ref.nextSibling);
          else zone.insertBefore(drag.item, ref);
          const afterTop = drag.item.getBoundingClientRect().top;
          drag.startY -= beforeTop - afterTop;
          const dy2 = e.clientY - drag.startY;
          drag.item.style.transform = `translateY(${dy2}px)`;
          if (!reduce()) {
            items.forEach((el) => {
              if (el === drag.item || !positions.has(el)) return;
              const shift = positions.get(el) - el.getBoundingClientRect().top;
              if (!shift) return;
              el.style.animation = "none";
              el.style.transition = "none";
              el.style.transform = `translateY(${shift}px)`;
              requestAnimationFrame(() => {
                el.style.transition = "transform .35s cubic-bezier(0.22, 1.2, 0.36, 1)";
                el.style.transform = "";
              });
            });
          }
        }
      }, { passive: false });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const item = drag.item;
        const lifted = drag.lifted;
        drag = null;
        item.classList.remove("is-lifted");
        item.style.transform = "";
        item.style.transition = "";
        item.style.animation = "";
        if (lifted) commitReorder(zone);
      };
      zone.addEventListener("pointerup", end);
      zone.addEventListener("pointercancel", end);
    });
  }

  function commitReorder(zone) {
    const parked = zone.dataset.reorderZone === "parked";
    const visibleIds = [...zone.querySelectorAll(":scope > [data-todo-id]")].map((el) => el.dataset.todoId);
    const bucket = api.state.todos
      .filter((t) => !!t.parked === parked)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const visibleSet = new Set(visibleIds);
    const queue = visibleIds.slice();
    const next = bucket.map((t) => (visibleSet.has(t.id) ? queue.shift() : t.id));
    if (next.every((id, i) => bucket[i] && bucket[i].id === id)) return;
    next.forEach((id, i) => {
      const t = api.state.todos.find((x) => x.id === id);
      if (t) t.order = (i + 1) * 10;
    });
    api.save();
    api.render();
  }

  /* ——— Holo + glass ——— */
  let holoRaf = 0;
  let holoEvent = null;
  function onHoloMove(e) {
    if (!api?.ui.lab || reduce() || coarse()) return;
    const card = e.target.closest?.(".card.is-holo");
    if (!card) return;
    holoEvent = { card, x: e.clientX, y: e.clientY };
    if (holoRaf) return;
    holoRaf = requestAnimationFrame(() => {
      holoRaf = 0;
      const ev = holoEvent;
      if (!ev) return;
      const r = ev.card.getBoundingClientRect();
      const px = (ev.x - r.left) / r.width;
      const py = (ev.y - r.top) / r.height;
      const ry = (px - 0.5) * 14;
      const rx = (0.5 - py) * 10;
      ev.card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      ev.card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      ev.card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      ev.card.style.setProperty("--sx", ((px - 0.5) * 24).toFixed(1) + "px");
      ev.card.style.setProperty("--sy", ((py - 0.5) * 24).toFixed(1) + "px");
    });
  }
  function onHoloLeave(e) {
    const card = e.target?.classList?.contains("card") && e.target.classList.contains("is-holo") ? e.target : null;
    if (!card) return;
    card.style.transform = "";
    card.style.removeProperty("--mx");
    card.style.removeProperty("--my");
  }

  function onSheen(e) {
    if (!api?.ui.lab || reduce() || coarse()) return;
    const island = e.currentTarget;
    const r = island.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    island.style.setProperty("--sheen-x", x.toFixed(1) + "%");
    island.style.setProperty("--sheen-y", y.toFixed(1) + "%");
    island.style.setProperty("--sheen", "1");
  }

  /* ——— Gooey toasts ——— */
  function syncGoo(fromMutation) {
    const host = document.getElementById("toast-host");
    if (!host) return;
    const toasts = [...host.children].filter((el) => el.classList.contains("toast"));
    const layer = host.querySelector(".toast-goo");
    const btn = host.querySelector(".toast-stack-btn");
    if (!layer) return;
    if (fromMutation && toasts.length > 1) {
      toastCollapsed = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastCollapsed = true;
        syncGoo(false);
      }, reduce() ? 0 : 1400);
    }
    const collapsed = toastCollapsed && toasts.length > 1 && !reduce();
    host.classList.toggle("is-goo", toasts.length > 0 && !reduce());
    host.classList.toggle("is-collapsed", collapsed);
    const surfaces = [...layer.children];
    if (surfaces.length !== toasts.length) {
      layer.innerHTML = "";
      toasts.forEach(() => {
        const s = document.createElement("div");
        s.className = "toast-surface";
        layer.appendChild(s);
      });
    }
    [...layer.children].forEach((s, i) => {
      const h = toasts[i] ? toasts[i].offsetHeight : 42;
      s.style.height = Math.max(36, h) + "px";
    });
    if (btn) {
      btn.hidden = toasts.length < 2;
      btn.textContent = collapsed ? `${toasts.length} notices` : "Stack notices";
      btn.setAttribute("aria-expanded", String(!collapsed));
    }
    toasts.forEach((t) => {
      if (!t.dataset.gooBound) {
        t.dataset.gooBound = "1";
        t.addEventListener("focusin", () => {
          toastCollapsed = false;
          syncGoo(false);
        });
      }
    });
  }

  function wireCanvas(canvas) {
    if (coastCleanup) {
      coastCleanup();
      coastCleanup = null;
    }
    const band = canvas.querySelector("#lab-band");
    if (band) mountBand(band);
    const coast = canvas.querySelector("#lab-coast");
    if (coast) coastCleanup = mountCoast(coast);
    mountReorder(canvas);
  }

  function onDocClick(e) {
    const menuBtn = e.target.closest("[data-card-menu]");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (menuState && menuState.btn === menuBtn) closeCardMenu();
      else openCardMenu(menuBtn);
      return;
    }
    if (menuState && !e.target.closest("#card-menu")) closeCardMenu();
    if (!e.target.closest(".facet") && !e.target.closest(".combo")) closePops(null);
    const more = document.getElementById("more-dropdown");
    const moreBtn = document.getElementById("btn-more");
    if (more && !more.hidden && moreBtn && more.contains(e.target) === false && e.target !== moreBtn) {
      /* existing handler closes it */
    }
    if (more && !more.hidden && e.target === moreBtn) {
      requestAnimationFrame(() => {
        if (!more.hidden) more.querySelector("[role='menuitem']")?.focus();
      });
    }
  }

  function onDocKey(e) {
    if (e.key !== "Escape") {
      const more = document.getElementById("more-dropdown");
      const moreBtn = document.getElementById("btn-more");
      if (more && moreBtn && document.activeElement === moreBtn && e.key === "ArrowDown") {
        e.preventDefault();
        more.hidden = false;
        moreBtn.setAttribute("aria-expanded", "true");
        more.querySelector("[role='menuitem']")?.focus();
      }
      const accBtn = document.activeElement?.closest?.(".acc-trigger");
      if (accBtn && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End")) {
        const root = accBtn.closest(".acc");
        const all = [...root.querySelectorAll(".acc-trigger")];
        const i = all.indexOf(accBtn);
        let n = i;
        if (e.key === "ArrowDown") n = Math.min(all.length - 1, i + 1);
        else if (e.key === "ArrowUp") n = Math.max(0, i - 1);
        else if (e.key === "Home") n = 0;
        else if (e.key === "End") n = all.length - 1;
        if (n !== i) {
          e.preventDefault();
          all[n].focus();
        }
      }
      return;
    }
    if (menuState) {
      e.preventDefault();
      e.stopPropagation();
      closeCardMenu();
      return;
    }
    const openPop = document.querySelector(".facet-pop:not([hidden])");
    if (openPop) {
      e.preventDefault();
      e.stopPropagation();
      openPop.hidden = true;
      document.querySelector(`[aria-controls="${openPop.id}"]`)?.focus();
      return;
    }
    if (comboOpen) {
      e.preventDefault();
      e.stopPropagation();
      closeCombo();
    }
    const panel = document.getElementById("mega-panel");
    if (panel && !panel.hidden) {
      e.preventDefault();
      e.stopPropagation();
      panel.hidden = true;
      document.querySelectorAll(".mega-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".acc-trigger");
    if (btn) onAccClick(btn);
  });

  window.ForgeLab = {
    boot,
    afterRender,
    enhanceDrawer,
    wireCanvas,
    renderBand,
    renderCoast,
  };

  if (window.__forge) boot(window.__forge);
})();
