# LinkLabz Forge

Brand-new charcoal **+ amber + gold** link review board — a visual reimagine of the Muse LinkLabz board (Ravyn successor layout, not a clone). GodUI-inspired motion/glass feel without GodUI branding.

**Product:** LinkLabz Forge · `v1`  
**Storage key:** `linklabz-forge-v1`  
**Stack:** static SPA — `index.html` · `styles.css` · `app.js` · `data/seed.json` (no build step)

## How to open

From this directory:

```bash
cd /workspace/linklabz-forge
python3 -m http.server 8770
```

Then open [http://localhost:8770](http://localhost:8770).  
(`file://` will fail seed load — fetch needs a static server.)

## Features

- **Views:** Reviews board · Bookmarks · Spitballs · To-do · Favorites
- **Lanes:** Try It / Parked / Skipped (magazine columns or bento grid)
- **Per review:** title, URL, category, stars, recommendation, cherry-picks, Cursor brief (copyable), goes-to project, action picker, favorite, promote, screenshot/comp slot, site preview when URL looks previewable
- **Search + filters:** lane, category, promoted, favorites · sort rating / newest / A–Z
- **Layout toggle:** Lanes (sections) ↔ Bento (grid)
- **Project strip:** goes-to filters
- **Detail drawer:** slides from right with sticky gold strip (editable stars + lane pills + action)
- **⌘K / Ctrl+K** command palette — jump, filter, set lane, add, export
- **Add:** review / bookmark / spitball / to-do
- **Persistence:** localStorage + JSON export/import + reset to seed
- **Stats strip:** try / parked / skipped / briefs / promoted / favorites counts
- **Seed:** 20 reviews — Muse live titles/recs/verdicts merged in (plus Rundown); Cursor briefs retained from Ravyn where available
- **Import-friendly:** workspace shape `{ version, reviews|cards, bookmarks, spitballs, todos }`
- **Muse merge:** `data/muse-workspace.json` (live titles/recs) already merged into seed; drop a newer Muse export into `data/` and re-import via the UI if needed

## Design notes

- Void charcoal (`#0B0C0F`–`#16181D`) with amber mesh glow
- Accents: `#F5C15C` · `#E8A317` · `#FFD78A` (no Trinity red/cyan, no purple)
- Display: Instrument Serif · UI: IBM Plex Sans
- Floating top command island (no left rail) · glass panels · hover lift · stagger reveals · prefers-reduced-motion respected

## Not deployed

Local bake-off only until Jon green-lights a deploy.
