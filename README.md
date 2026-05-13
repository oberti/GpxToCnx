# GPX → CNX | iGPSport Route Converter

A browser-based tool to convert **GPX route files** into **CNX format** for iGPSport cycling computers (iGS series).

Built in pure HTML/CSS/JS — no server, no build step, no API keys. Just open `index.html` in a browser.

---

## Features

- **Drag & drop** or browse to load `.gpx` files
- **Live stats** — distance (3D), ascent, descent, trackpoint & waypoint count
- **Interactive map** — OpenStreetMap tiles via Leaflet, with start/end/waypoint markers
- **Elevation profile** — canvas-drawn with waypoint markers, hover crosshair & tooltip
- **Waypoint editor** — rename, change type (23 iGPSport POI types), reorder by distance, remove
- **Waypoints sorted by distance from start** — #1 is always closest to the beginning
- **Bulk convert** — drop multiple GPX files at once
- **Download CNX** — UTF-8 BOM encoded, correct delta-compressed `<Tracks>` format
- **Copy fallback** — if download is blocked (e.g. sandboxed preview), copy XML to clipboard

---

## CNX Format

The encoding matches the **[LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)** Python implementation exactly:

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
    <Point><Lat>45.123</Lat><Lng>9.456</Lng><Type>0</Type><Descr>WPT1</Descr></Point>
  </Points>
</Route>
```

### Track encoding (`<Encode>2</Encode>`)

| Point | lat | lon | ele |
|-------|-----|-----|-----|
| 0 | absolute | absolute | absolute (cm) |
| 1 | Δ × 1e7 | Δ × 1e7 | Δ (cm) |
| 2+ | Δ² × 1e7 | Δ² × 1e7 | Δ (cm) |

All values are rounded integers. Distance uses 3D Haversine (includes elevation difference).

---

## Usage on device

1. Download the `.cnx` file
2. Connect your iGPSport device via USB
3. Copy the file into `iGPSPORT/Courses/` on the device
4. Eject and navigate to **Routes** on the device

---

## File structure

```
gpx-to-cnx/
├── index.html       # Main HTML structure
├── css/
│   └── style.css    # All styles (dark cyber theme)
├── js/
│   └── app.js       # All logic (parser, encoder, map, elevation)
└── README.md
```

---

## POI Types

| ID | Type |
|----|------|
| 0 | Waypoint |
| 1 | Sprint Point |
| 2 | HC Climb |
| 3 | Level 1 Climb |
| 4 | Level 2 Climb |
| 5 | Level 3 Climb |
| 6 | Level 4 Climb |
| 7 | Supply Point |
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

## Credits

- CNX format reverse-engineered from [LudvvigB/GPXtoCNXConverter](https://github.com/LudvvigB/GPXtoCNXConverter)
- Map tiles © [OpenStreetMap](https://openstreetmap.org/copyright) contributors
- Built for [Pitstopper.net](https://pitstopper.net/)
