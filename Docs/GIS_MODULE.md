# GIS module — OMSU Mamburao Campus

Status: **database foundation built and verified (Phase 1).** Map UI (Leaflet + OpenStreetMap), backend
endpoints and administration screens are Phase 2.

> **No campus geographic data exists yet.** The database holds one campus row —
> *Occidental Mindoro State University – Mamburao Campus* — with **no boundary, no coordinates, no buildings,
> no locations and no paths**, marked `unverified`. Nothing was invented. Administrators enter and verify
> real data later ([GIS_DATA_GUIDE.md](GIS_DATA_GUIDE.md)).

## Technology (verified on the live project)

PostGIS 3.3.7 and pgRouting 3.4.1 in schema `extensions`; pg_trgm for name search. Geometry is stored as
`geometry(<type>, 4326)` (EPSG:4326, longitude/latitude) with GiST indexes; distances and lengths are computed
as `geography` in metres. Input and output use GeoJSON.

## Data model

| Table | Geometry | Purpose |
|---|---|---|
| `campuses` | MultiPolygon boundary, Point reference (both nullable) | the campus |
| `campus_map_layers` | — | layers with `public` / `authenticated` / `restricted` visibility |
| `location_categories` | — | building, office, service counter, gate, landmark, ... |
| `gis_data_sources` | — | provenance (administrator entry, field survey, university records, OpenStreetMap with ODbL attribution, import) |
| `campus_buildings` | entrance Point | buildings |
| `campus_building_boundaries` | MultiPolygon | **versioned** footprints, one current per building |
| `campus_locations` | Point (nullable until surveyed) | offices, counters, rooms, landmarks |
| `office_locations`, `service_locations` | — | link existing `offices` and `services` (queue) to locations |
| `campus_path_nodes`, `campus_paths` | Point, LineString | walking network for pgRouting |
| `location_accessibility` | — | ramps, elevators, stairs, accessible restrooms, ... |
| `gis_location_verifications` | previous / new geometry | append-only history of every submission, edit and decision |

## Rules enforced by the database

- **Validity:** every geometry must be valid, non-empty, SRID 4326 and inside a coarse Philippines bounding
  box (a generic sanity check, not campus data). Once the campus boundary is **verified**, new geometry must
  lie within it (25 m tolerance).
- **Verification:** every feature has `verification_status` (`unverified`, `pending_review`, `verified`,
  `rejected`, `retired`). Moving a feature resets it to `unverified`. Verification needs `gis.verify`, a
  stated method (field survey, GPS device, university records, ...) and coordinates, and **the last editor
  can never verify their own edit** (decision D8).
- **Routing only over verified data:** `gis_find_route` returns a route only between verified locations over
  verified, active paths, snapping to the nearest node within 50 m. Otherwise it returns
  `{"status": "unavailable", "reason": ...}` with `location_unverified`, `no_verified_paths`,
  `location_not_connected` or `no_route`. It never invents directions. Accessible-only routing uses only paths
  marked `is_accessible = true` (unknown counts as not accessible).
- **Visibility:** public / authenticated / restricted per layer and per feature; restricted needs
  `gis.view_restricted` (or the layer's required permission). The signed-out map is served by the backend
  with `p_public_only = true`; `anon` has no database access (decision D2).

## Functions

| Function | Who | Purpose |
|---|---|---|
| `gis_save_location`, `gis_link_service_location` | `gis.manage`, or an office head for their own office (`gis.manage_office_locations`) | register / edit locations, link to offices and services |
| `gis_save_building`, `gis_set_building_boundary`, `gis_save_path`, `gis_set_campus_geometry` | `gis.manage` | buildings, versioned boundaries, paths, campus boundary |
| `gis_verify_feature` | `gis.verify` (not the editor) | verify / reject / retire |
| `gis_import_geojson` | `gis.manage` | validate (dry run) or import a FeatureCollection of locations or paths; imports start unverified |
| `gis_map_features` | signed-in users; backend for public | GeoJSON FeatureCollection filtered by visibility, with verification status on every feature |
| `gis_search_locations` | signed-in users; backend for public | trigram search over location, office, service and building names |
| `gis_find_route` | signed-in users; backend for public | walking route(s) (pgRouting `pgr_ksp`, up to 3 alternatives), distance, estimated time (~4.5 km/h), GeoJSON line |
| `gis_nearest_service_locations` | signed-in users | nearest verified locations of a service |
| `gis_activity_by_location` | `reports.view_all`, or `reports.view` for own office | counts of queue tickets, requests, receipts, payments per location (heatmaps) — no personal data |

## Integration

Offices and services link to locations, so queue services, service discovery and analytics can show where
each service is. Organization-owned locations (`owner_organization_id`) carry receipt and payment activity.

## Map tiles (Phase 2)

OpenStreetMap tiles must follow the OSM tile usage policy and show "© OpenStreetMap contributors". For
production traffic a tile provider with an appropriate plan may be needed; to be decided in Phase 4.

## Tests

`Database/tests/080_gis.sql` — 40 checks with **synthetic test geometry** created inside a rolled-back
transaction (never seeded); passed locally (PostGIS 3.4.2 / pgRouting 3.6.1) and on the live project
(PostGIS 3.3.7 / pgRouting 3.4.1).
