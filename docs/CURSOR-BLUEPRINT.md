# LinkLabz Forge — Cursor Blueprint

> Living starting-point doc for Jon’s future **real Cursor rebuild on Vader**.  
> Repo: [`jonbeatz/linklabz-forge-preview`](https://github.com/jonbeatz/linklabz-forge-preview)  
> Live: https://jonbeatz.github.io/linklabz-forge-preview/  
> Owner (preview): **Ravyn** · Master (Trinity Muse) stays separate until Jon says merge.

This mirrors the house pattern Trinity is landing as `docs/CURSOR-BLUEPRINT.md` on
`linklabz-trinity-preview` (`gradient-lab-upgrade`). Every revision adds a dated
changelog entry at the bottom — do not silently rewrite history.

---

## 1. App map

| Surface | What it is |
| ------- | ---------- |
| **Command island** | Brand, session chip (Clean/Dirty), shelf tabs, search, ⌘K, + Add, Download / Load, ⋯ Reset |
| **Stats strip** | Reviewed / Try It / Parked / Skipped / Briefs / Promoted / Favorites |
| **Filter bar** | Lane, category, sort, Promoted / Favorites chips, Lanes↔Bento toggle |
| **Project strip** | Destination-project chips (derived from seed + cards) |
| **Reviews** | Magazine lanes: Inbox · Try It · Parked · Skipped (or bento grid) |
| **Bookmarks** | Typed quick-saves (Design / Template / Tutorial / YouTube harvest / Skill / Reference) |
| **Spitballs** | Raw ideas; Graduate → Inbox review |
| **To-do** | Active + parking lane; severity; project; inline edit; Clear done; filters |
| **Favorites** | Cross-shelf starred reviews + bookmarks |
| **Tools** | Export / import / reset / clear filters / palette + Install tip |
| **Detail drawer** | Sticky amber strip, rating, lane, action, project, evidence checklist, Copy Markdown / bridge note, linked to-do, protected seed |
| **Modals** | Add review / bookmark / spitball / to-do |
| **Command palette** | Jump, filters, `todo `/`t ` capture, operators |

Mobile: horizontal-scroll pills, icon-only Download/Load under ~720px, stacked lanes, full-screen drawer sheet, `safe-area-inset`, 16px inputs.

---

## 2. Data model + persistence

### Storage
| Key | Value |
| --- | ----- |
| `localStorage` key | `linklabz-forge-v1.2` |
| Seed file | `data/seed.json` (`version` 1.2) |
| Export | Full workspace JSON (Download) |
| Import | Load workspace JSON (replace — merge/upsert still a Cursor must-fix) |

### Seed counts (2026-09-23 harvest)
| Shelf | Count |
| ----- | ----: |
| Reviews | 19 |
| Bookmarks | 7 |
| Spitballs | 8 |
| To-dos | 7 |

### Card (review) fields (practical)
`id`, `title`, `url`, `lane` (`inbox`\|`try`\|`parked`\|`skipped`), `category`, `rating`, `recommendation`, `cherryPick[]`, `gradingSummary`, `relatedNotes`, `cursorBrief`, `goesTo`, `promoted`, `favorite`, `action`, `createdAt`, `protected`, `evidence[]`, `foundBy`, `hardwareFit`, `revisitDate`, `linkedTodoId`

### Bookmark
`id`, `title`, `url`, `note`, `favorite`, `createdAt`, `bookmarkType`

### Spitball
`id`, `title`, `body`, `stage`, `createdAt`, `goesTo?`

### To-do
`id`, `text`, `done`, `severity`, `parked`, `order`, `createdAt`, `goesTo?`

---

## 3. Real vs stubbed

| Area | Status |
| ---- | ------ |
| Lanes / bento / filters / operators | **Real** |
| Drawer extras (markdown, bridge note, evidence, linked to-do, seed lock) | **Real** |
| To-do projects / filters / inline edit / clear done / palette capture | **Real** |
| Evaluate → offer linked to-do | **Real** |
| Bookmark duplicate URL guard | **Real** |
| PWA manifest + icons | **Real** |
| Session Clean/Dirty + soft backup nudge | **Real** |
| Seed data | **Mostly real** (Muse snapshot URLs + Trinity staged package + spitball lot). 3 review URLs still search placeholders (Aning, Grit & Chaos, 3D MCP) until Vader pins canonical paths |
| Muse.ai live export JSON | **Not on Drive** — HTML snapshot + package text used |
| SQLite / merge-upsert import | **Stub / missing** — Cursor rebuild |
| Cloud sync | **Out of scope** (Download/Load only) |

---

## 4. Wiring checklist (Cursor on Vader)

1. Autosave + dirty indicator + `beforeunload` (preview has Clean/Dirty; harden)
2. Real local persistence (SQLite or equivalent) beyond `localStorage`
3. **Merge/upsert** import + pre-import backup (current Load replaces)
4. Duplicate-URL detection across cards **and** bookmarks (bookmarks done; unify)
5. Canonical “Goes to” project vocabulary + rename/merge
6. Visible five-star rubric in UI chrome
7. Structured hardware-fit field/filter
8. Revisit dates + “Needs re-review” smart view
9. Found-by provenance consistently on cards
10. Inbox/triage lane for unreviewed links (Inbox lane exists; intake flow still thin)
11. Pin remaining placeholder review URLs from Vader skill-pack paths
12. Optional: port Trinity `CURSOR-BLUEPRINT` deltas when her `gradient-lab-upgrade` pointer lands

---

## 5. Design tokens (Forge)

| Token | Role |
| ----- | ---- |
| Charcoal void | Page background / glass panels |
| Amber / gold | Primary CTA, active pills, wordmark accent, sticky drawer strip |
| DM Sans | Display / titles (weight 800, amber italic accent on last word) |
| Mulish | Body / UI |
| Glass | Frosted island, hairline borders, soft lift |
| Motion | Stagger / hover lift; respect `prefers-reduced-motion` |

Not a Muse clone — amber forge identity. Trinity Muse = master board until Jon says otherwise.

---

## 6. Best workflow

1. Cut a **new branch** off `main` for every revision (never silent main push).
2. Preview on GitHub Pages after merge.
3. Keep this blueprint’s changelog updated on the same PR.
4. Bridge: new inbox Docs only — do not edit Trinity’s notes.
5. Data: prefer Download workspace before risky Load/Reset.
6. When Trinity drops the blueprint pointer, diff her doc ↔ this file and merge upgrades here.

---

## Changelog

### 2026-09-23 — initial Forge blueprint
- Created `docs/CURSOR-BLUEPRINT.md` on branch `bridge-status-and-cursor-blueprint` in response to Trinity NEED-ACK (mirror request while her `docs/CURSOR-BLUEPRINT.md` on `gradient-lab-upgrade` is not yet in-tree).
- Captures current Forge app map, `linklabz-forge-v1.2` persistence, seed counts (19/7/8/7), real-vs-stubbed, Cursor wiring checklist (aligned with her 10 must-fixes + Forge gaps), design tokens, branch workflow.

### 2026-09-24 — FINAL-MASTER harvest lock (Ravyn ACK)
- Rebuild IN set locked with Trinity: (1) shared LinkLabz logo/brand pack (2) facet filter bar + rectangular chips + counts + Promoted/Favorites + 36–44px targets (3) searchable project combobox + chips + pinning (4) card overflow: Favorite / Promote / Set lane / Open / Copy link (5) drag-reorder to-dos + keyboard fallback (6) workspace menu Download/Load/Reset/Clear filters (7) live stat pills (8) phone bottom tab bar (9) Card Swap under Tools + mega menu + search ONLY — not island, not top bar.
- CUT / archive-only: gold foil cards; Coast/Band/Cover as defaults; gold top-bar Card Swap button; lab-toggle chrome; redundant glass/goo/monograms.
- Master DATA for Cursor rebuild = Trinity Muse board; Trinity Pages = reference BUILD; Forge = challenger reference for her five + phone tab bar.
- Data preservation: all reviews/bookmarks/spitballs/to-dos/favorites must survive import; Promoted/Favorites/queue order must become persistent in Cursor rebuild (not session-only).
