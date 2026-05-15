# Changelog

All notable changes to this project will be documented in this file.

---

## v1.0.1 — 2026-05-15

### Added
- **STEP 1 — Create GPX route**: new introductory step with direct link to [gpx.studio](https://gpx.studio/it/app#13.48/45.67937/9.56904) for users who need to draw their route before converting
- Water Finder renamed to **STEP 2**, Convert to CNX renamed to **STEP 3**

### Changed
- Version badge updated to v1.0.1 in header

---

## v1.0.0 — 2025-05-14

First stable release.

### Core Conversion
- GPX → CNX encoding — exact byte match with LudvvigB/GPXtoCNXConverter Python reference
- Multi-track / multi-segment merge — all `<trk>` and `<trkseg>` elements flattened into one CNX route (sidkurt/GPXtoCNXConverter logic)
- Delta compression encoding (`<Encode>2</Encode>`) with correct ROUND_HALF_UP rounding
- UTF-8 BOM output (`utf-8-sig`) matching iGPSport device requirements
- 3D Haversine distance (includes elevation delta)
- Original GPX coordinate strings preserved for first trackpoint precision
- Fallback: `<rte>/<rtept>` if no `<trk>` found (Komoot/Google Maps exports)

### Water Finder
- Overpass API integration — ported from jsleroy/thirsty core.py
- 7 water source types: Fountains, Taps, Springs, Decorative Fountains, Water Points, Watering Places, Non-potable
- Point-to-segment distance algorithm (not point-to-point) — finds sources perpendicular to track
- 4 Overpass endpoints with automatic fallback cascade:
  - overpass-api.de
  - overpass.kumi.systems
  - overpass.openstreetmap.fr
  - overpass-api.nchc.org.tw
- Per-endpoint retry logic (2 retries, 2s delay) before moving to next server
- 60s timeout for bulk queries
- Status log below Find Water button — shows server attempts line by line
- Single mode: one query per route
- Bulk mode: one merged bbox query for all routes, filtered client-side per file

### Map
- Leaflet 1.9.4 + OpenStreetMap tiles
- Track polyline with glow effect
- Numbered markers: green = start, red = end, orange = waypoints, blue = water
- Water marker popup with potable/non-potable indicator and Add to route button
- Water legend item shown/hidden dynamically
- **Bidirectional map ↔ table link**: click marker → highlights table row + scroll; click row → pans map + opens popup

### Elevation Profile
- Canvas chart with gradient fill
- Waypoint markers numbered 1→N from start (orange = POI, blue = water)
- Glow behind each marker dot
- Dashed vertical line from baseline to dot
- Badge flips below dot if too close to top edge
- Hover crosshair with km + elevation tooltip
- Retry on zero-width canvas (display:none timing fix)
- Fallback: computes `_tpIdx` on the fly if missing

### Elevation Fetch
- Detects GPX files with no elevation data (all `ele=0`)
- Banner with **Fetch Elevation** button — calls Open-Elevation API
- Batched requests (200 points per batch) with progress indicator
- Dismissable if user prefers to skip

### POI Table
- 23 iGPSport POI types selectable per waypoint
- Inline rename, type change, remove
- Auto-sorted by distance from start
- Blue tint + 💧 icon for water-origin waypoints
- Click row → focus map marker (ignores clicks on input/select/button)
- Mobile: Coordinates column hidden on small screens, select max-width responsive

### CNX Preview Modal (single mode)
- Shows filename, distance, ascent, descent, trackpoints, waypoint count
- Waypoint table with: #, km from start, name, type badge (blue = water, orange = POI)
- Truncation warning if route name exceeds 18 characters
- Cancel button closes without downloading

### Bulk Mode
- Drag & drop multiple GPX files
- Parse all files simultaneously
- Water Finder searches merged bbox (one Overpass request for all files)
- Files to Convert table shows CNX output filename for each file
- Preview modal: summary stats + per-file table with distance, ascent, water count
- Sequential download (600ms between files) — avoids browser multiple-download popup
- Individual ⬇ CNX button per file for selective download

### File Naming
- Output filename derived from original GPX filename (not internal route name)
- `_H2O` suffix added automatically if file contains water waypoints
- Example: `Bergamo-Alpi_2024_H2O.cnx`

### GPX Export
- Save GPX+H₂O — exports enriched GPX with all waypoints including water
- Water waypoints tagged with `<sym>water-drop</sym>` and `<type>water</type>`
- Appears only after adding at least one water point
- Compatible with Komoot, Garmin, Wahoo, Strava

### Data Quality
- Filters `(0,0)` coordinates — GPS points with no fix
- Median-based outlier removal — drops points more than 200km from track center
- Route name truncation preview — shows exact 18-char result before download
- Coordinate precision: 7 decimal places preserved from original GPX

### UI / UX
- Dark cyber theme — CSS variables, grid layout
- Drag & drop with drag-over visual feedback
- Progress bar on file load
- Stats bar: distance, ascent, descent, trackpoints, waypoints
- Route name editor with live character counter (red + tooltip when over 18)
- Toast notifications (success / error / water types)
- Fade-in animations on panel reveal
- Responsive: works on mobile and desktop

### Technical
- Zero dependencies except Leaflet (CDN) — no build step, no server
- Single HTML file option (`preview.html`) for offline use
- `Blob` + `URL.createObjectURL` download with UTF-8 BOM
- `AbortController` timeout on all fetch calls
- Works on GitHub Pages as-is

### Credits
- CNX format: [LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)
- Multi-track merge: [sidkurt/GPXtoCNXConverter](https://github.com/sidkurt/GPXtoCNXConverter)
- Water Finder logic: [jsleroy/thirsty](https://github.com/jsleroy/thirsty)
- Water data: © OpenStreetMap contributors via Overpass API
- Map tiles: © OpenStreetMap contributors
- Built for [Pitstopper.net](https://pitstopper.net/)
