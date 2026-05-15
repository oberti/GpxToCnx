# GPX → CNX | iGPSport Converter + Water Finder

Browser-based tool to convert **GPX route files** into **CNX format** for iGPSport cycling computers (iGS series), with automatic search for **drinking fountains and water points** along the route via OpenStreetMap.

🌐 **[Try it on Pitstopper.net](https://pitstopper.net/)** &nbsp;·&nbsp; **v1.0.3**

> No server · No installation · No API key — just open `index.html` in your browser.

---

## Workflow

```
0. Create GPX        →  draw your route on gpx.studio (optional)
1. Load GPX          →  drag & drop or browse
2. Find Water        →  search fountains near the route (OpenStreetMap)
3. Add to route      →  choose which water points to include
4. Save GPX+H2O      →  export the enriched track as GPX
5. Load GPX+H2O      →  reload the enriched file
6. Download CNX      →  export the .cnx file for iGPSport
```

---

## Features

### Water Finder (STEP 1)
- Search via **Overpass API** (OpenStreetMap) — free, no API key required
- 6 source types: fountains, taps, springs, decorative fountains, water points, non-potable
- Max distance from route: adjustable 50m–1000m (default 100m)
- 3 Overpass endpoints with automatic fallback
- Results shown on map as blue markers with distance info
- Add individually or all at once

### Interactive Map
- **OpenStreetMap** tiles via Leaflet
- Green marker = start, red = end
- Numbered orange markers = waypoints
- Blue markers = water points found
- Click markers for popup with name, type, coordinates

### Elevation Profile
- Canvas chart with gradient fill and cyan track line
- Numbered waypoint markers on profile (orange = POI, blue = water)
- Hover: crosshair + tooltip with distance, elevation, nearby waypoint

### Waypoint Table
- 23 iGPSport POI types selectable
- Rename, change type, remove
- Auto-sorted by distance from start (#1 = closest to beginning)
- Blue-tinted rows for added water points

### Export (STEP 2)
| Button | Output | When visible |
|--------|--------|--------------|
| 💧 Save GPX+H₂O | `.gpx` with all waypoints | After adding ≥1 water point |
| ⬇ Download CNX | `.cnx` for iGPSport | Always after loading |
| ⬇ Download All CNX | all `.cnx` files | Bulk mode |

### Other
- **Route name** editable (max 18 chars for device compatibility)
- **Stats**: 3D distance, ascent/descent, trackpoint & waypoint count
- **Bulk mode**: convert multiple GPX files at once
- **Multi-track/segment merge**: all `<trk>` and `<trkseg>` elements merged into one CNX

---

## CNX Format

Output matches exactly **[LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)** — verified byte-for-byte against the original Python converter.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Route>
  <Id>RouteName</Id>
  <Distance>12345.67</Distance>
  <Duration>
  </Duration>
  <Ascent>456.78</Ascent>
  <Descent>-234.56</Descent>
  <Encode>2</Encode>
  <Lang>0</Lang>
  <TracksCount>1234</TracksCount>
  <Tracks>lat,lon,ele_cm;Δlat,Δlon,Δele;Δ²lat,Δ²lon,Δele;...</Tracks>
  <Navs />
  <PointsCount>3</PointsCount>
  <Points>
    <Point>
      <Lat>45.123</Lat>
      <Lng>9.456</Lng>
      <Type>7</Type>
      <Descr>Fountain</Descr>
    </Point>
  </Points>
</Route>
```

### Track Encoding (`<Encode>2</Encode>`)

| Point | Lat | Lon | Ele |
|-------|-----|-----|-----|
| 0 | absolute | absolute | absolute (cm) |
| 1 | Δ × 1e7 | Δ × 1e7 | Δ (cm) |
| 2+ | Δ² × 1e7 | Δ² × 1e7 | Δ (cm) |

- All values are rounded integers
- Distance uses 3D Haversine (includes elevation difference)
- First point coordinates preserve original GPX string precision
- Distance/ascent/descent rounded at each step (matches Python `ROUND_HALF_UP`)
- File saved with UTF-8 BOM (matches Python `utf-8-sig`)

### Multi-track merge

Based on **[sidkurt/GPXtoCNXConverter](https://github.com/sidkurt/GPXtoCNXConverter)** logic: all `<trk>` elements and all `<trkseg>` segments are merged into a single flat trackpoint array, producing one unified CNX route.

---

## Using on device

1. Download the `.cnx` file
2. Connect your iGPSport device via USB
3. Copy to `iGPSPORT/Courses/` on the device storage
4. Safely eject the device
5. On the device: **Routes** → select route → navigate

---

## File structure

```
gpx-to-cnx/
├── index.html       # HTML structure
├── css/
│   └── style.css    # Styles (dark cyber theme + water finder)
├── js/
│   └── app.js       # All logic (GPX parser, CNX encoder, map, elevation, water finder)
└── README.md
```

### External dependencies (CDN, no install)
- [Leaflet 1.9.4](https://leafletjs.com/) — interactive maps
- [Google Fonts](https://fonts.google.com/) — Barlow + Share Tech Mono
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- [Overpass API](https://overpass-api.de/) — water point data

---

## iGPSport POI Types

| ID | Type |
|----|------|
| 0 | Waypoint |
| 1 | Sprint Point |
| 2 | HC Climb |
| 3 | Level 1 Climb |
| 4 | Level 2 Climb |
| 5 | Level 3 Climb |
| 6 | Level 4 Climb |
| 7 | Supply Point ← used for water points |
| 8 | Garbage Recycle Area |
| 9 | Restroom |
| 10 | Service Point |
| 11 | Medical Aid Station |
| 12 | Equipment Area |
| 13 | Shop |
| 14 | Meeting Point |
| 15 | Viewing Platform |
| 16 | Instagram-Worthy Location |
| 17 | Tunnel |
| 18 | Valley |
| 19 | Dangerous Road |
| 20 | Sharp Turn |
| 21 | Steep Slope |
| 22 | Intersection |

---

## Water Finder — Source Types

| Value | OSM Tag | Description |
|-------|---------|-------------|
| `water` | `amenity=drinking_water` | Public drinking fountains (default) |
| `tap` | `man_made=water_tap` + `drinking_water=yes` | Potable taps |
| `spring` | `natural=spring` + `drinking_water=yes` | Natural springs |
| `fountain` | `amenity=fountain` + `drinking_water=yes` | Potable decorative fountains |
| `point` | `amenity=water_point` + `drinking_water=yes` | Water refill stations |
| `non-potable` | various without `drinking_water=yes` | Non-potable sources |

---

## Credits

- CNX format: [LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)
- Multi-track merge: [sidkurt/GPXtoCNXConverter](https://github.com/sidkurt/GPXtoCNXConverter)
- Water Finder: inspired by [jsleroy/thirsty](https://github.com/jsleroy/thirsty)
- Water data: © [OpenStreetMap](https://openstreetmap.org/copyright) contributors via [Overpass API](https://overpass-api.de)
- Map tiles: © [OpenStreetMap](https://openstreetmap.org/copyright) contributors
- Built for [Pitstopper.net](https://pitstopper.net/) 🚴

---

## License

MIT
