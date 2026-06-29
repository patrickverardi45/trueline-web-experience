# Future product requirements — map, stations & photos

Recorded direction (not yet built). The route map today is **route-only context**; the **PDF redline proof
is the source of truth**. These are the intended future capabilities — none may be faked or shipped before the
real source evidence exists.

## 1. Geotagged photos placed on the design
- Photos should be placed on the KMZ/design map **using EXIF GPS geotags when present**.
- Only photos that actually carry GPS EXIF may be placed; photos without geotags stay "stored for reference
  only" and are **not** placed (no invented positions).

## 2. Source-backed redline / station overlays on the route map
- The route map should eventually show the **redline and stations overlaid on the KMZ route**, but only when
  there is **true georeferencing** linking the plan/redline geometry to WGS84 coordinates.
- No drawing the redline on the map by proportion/snap/guess. If the geometry is pixel-only on the plan, the
  map stays route-only.

## 3. Clickable stations with v1-style info boxes
- Stations along the route should be **clickable**, opening a v1-style info box (bore-log details: station
  range, footage, depth/BOC, plan sheet, crew/date) — sourced from the reviewed bore log, never invented.

## 4. Google Earth shows redlines only with true georeferencing
- The Google Earth (.kmz) export currently contains the **route only** (the redline is pixel-only on the plan
  and is not georeferenced).
- It may include the redline **only once true georeferencing exists** — never faked coordinates, never a
  proportional/snapped placement.

## Hard "do not fake" rules (carried forward)
- No redline-on-KMZ overlay without true georeferencing.
- No fake station markers.
- No fake geotagged photo placement.
- No fake redline-in-Google-Earth.

Until these land, the shippable path is: upload files → extract/review bore logs → if automatic placement
abstains, mark the route on the **correct** plan sheet → render the redline proof → export.
