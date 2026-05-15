# GPX → CNX | iGPSport Converter + Water Finder

Browser-based tool to convert **GPX route files** into **CNX format** for iGPSport cycling computers (iGS series), with automatic search for **drinking fountains and water points** along the route via OpenStreetMap.

🌐 **[Try it on Pitstopper.net](https://pitstopper.net/)** · **v1.0.3**

> No server · No installation · No API key — just open `index.html` in your browser.

---

## Workflow

```
STEP 1  Create GPX    →  draw your route on gpx.studio (optional)
        Load GPX      →  drag & drop or browse
STEP 2  Find Water    →  search fountains near the route (OpenStreetMap)
        Add to route  →  choose which water points to include
        Water Score   →  automatic 0–10 hydration quality rating
STEP 3  Download CNX  →  export the .cnx file for iGPSport
        Save GPX+H₂O  →  optional: export enriched GPX for other apps
```

---

## Features

### Water Finder (STEP 2)
- Search via **Overpass API** (OpenStreetMap) — free, no API key required
- **7 source types**: drinking fountains, taps, springs, decorative fountains, water points, watering places, non-potable
- Max distance from route: adjustable 50m–1000m (default 100m)
- Point-to-segment distance algorithm — finds sources perpendicular to track
- 4 Overpass endpoints with automatic fallback cascade:
  - overpass-api.de → overpass.kumi.systems → overpass.openstreetmap.fr → overpass-api.nchc.org.tw
- Results shown on map as blue markers with distance info
- Add individually or all at once

### Water Score
Automatic hydration quality rating after every water search:

| Score | Label | Color |
|-------|-------|-------|
| 8–10 | Excellent | Green |
| 6–8 | Good | Cyan |
| 4–6 | Fair | Orange |
| 2–4 | Poor | Red |
| 0–2 | Critical | Dark red |

Formula: Coverage 40% + Avg gap between sources 40% + Potable quality 20%

- Single mode: card above results list with bar + 3 metrics (Coverage, Avg gap, Potable)
- Bulk mode: column in Files to Convert table with color-coded bar

### Interactive Map
- OpenStreetMap tiles via Leaflet
- Green = start, red = end, orange numbered = waypoints, blue = water
- Click marker → highlights table row · Click row → pans map to marker

### Elevation Profile
- Canvas chart with gradient fill and cyan track line
- Numbered waypoint markers (orange = POI, blue = water)
- Hover crosshair + tooltip: distance, elevation, nearby waypoint
- Auto-fetch missing elevation via Open-Elevation API

### Waypoint Table
- 23 iGPSport POI types per waypoint
- Rename, change type, remove · Auto-sorted by distance from start
- Click row → focus map marker

### Export (STEP 3)

| Button | Output | When |
|--------|--------|------|
| ⬇ Download CNX | `.cnx` for iGPSport | Always |
| ⬇ Download All CNX | all `.cnx` files | Bulk mode |
| 💧 Save GPX+H₂O | `.gpx` with all waypoints | After adding water |

CNX Preview modal shows filename, distance, ascent, descent, waypoint table with km from start.

### Other
- Route name editable (max 18 chars — truncation preview shown)
- Bulk mode: multiple GPX files with single Overpass query
- Multi-track/segment merge: all `<trk>` and `<trkseg>` into one CNX
- GPS sanitization: removes (0,0) points and outliers >200km from track
- Output filename: original GPX name + `_H2O` suffix if water added

---

## CNX Format

Matches exactly **[LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)** — verified byte-for-byte.

### Track Encoding (`<Encode>2</Encode>`)

| Point | Lat | Lon | Ele |
|-------|-----|-----|-----|
| 0 | absolute | absolute | absolute (cm) |
| 1 | Δ × 1e7 | Δ × 1e7 | Δ (cm) |
| 2+ | Δ² × 1e7 | Δ² × 1e7 | Δ (cm) |

- All values rounded integers · 3D Haversine distance · UTF-8 BOM output

---

## Using on device

1. Download the `.cnx` file
2. Connect iGPSport via USB
3. Copy to `iGPSPORT/Courses/`
4. Eject · On device: **Routes** → select → navigate

---

## File structure

```
gpx-to-cnx/
├── index.html        # App + STEP 1/2/3 layout
├── favicon.svg       # Browser icon
├── css/style.css     # Dark cyber theme
├── js/app.js         # Parser, encoder, map, elevation, water finder, score
├── README.md
└── CHANGELOG.md
```

**External CDN** — Leaflet 1.9.4 · Google Fonts · OpenStreetMap · Overpass API · Open-Elevation

---

## Water Source Types

| Value | OSM Tag | Notes |
|-------|---------|-------|
| `water` | `amenity=drinking_water` | Public drinking fountains |
| `tap` | `man_made=water_tap` + `drinking_water=yes` | Potable taps |
| `spring` | `natural=spring` + `drinking_water=yes` | Natural springs |
| `fountain` | `amenity=fountain` + `drinking_water=yes` | Decorative, potable |
| `point` | `amenity=water_point` + `drinking_water=yes` | Refill stations |
| `watering_place` | `amenity=watering_place` + `drinking_water=yes` | Watering places |
| `non-potable` | various | Without `drinking_water=yes` |

---

## Credits

- CNX format: [LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)
- Multi-track merge: [sidkurt/GPXtoCNXConverter](https://github.com/sidkurt/GPXtoCNXConverter)
- Water Finder: inspired by [jsleroy/thirsty](https://github.com/jsleroy/thirsty)
- Water data: © [OpenStreetMap](https://openstreetmap.org/copyright) contributors via Overpass API
- Map tiles: © OpenStreetMap contributors
- Built for [Pitstopper.net](https://pitstopper.net/) 🚴

---

## License

MIT
