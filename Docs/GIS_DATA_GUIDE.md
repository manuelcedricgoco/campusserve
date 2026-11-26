# GIS data guide — entering and verifying campus data

This guide is for administrators who will enter real geographic data for OMSU Mamburao Campus. Until this is
done the map shows no features and directions report "unavailable". **Never enter guessed coordinates.**

## Before you start

1. Decide the source for each item and record it (`gis_data_sources`):
   - `field_survey` — measured on site with a GPS receiver or phone GPS (note the accuracy).
   - `university_records` — official site plans or engineering drawings.
   - `openstreetmap` — only if the campus is mapped there; keep the ODbL attribution.
   - `administrator_entry` — anything else; must still be verified by someone else.
2. Use **longitude, latitude** in decimal degrees (WGS 84 / EPSG:4326). GeoJSON order is `[longitude, latitude]`.
   A point in the Philippines has a longitude around 116–127 and a latitude around 4–21.5; anything outside
   is rejected.
3. Two people are needed: one enters data (`gis.manage`, or an office head for their own office), a different
   person verifies it (`gis.verify`).

## Recommended order

1. **Campus boundary** — `gis_set_campus_geometry` with a Polygon, then have it verified. After verification,
   all new features must fall inside the boundary (25 m tolerance), which catches typing mistakes.
2. **Buildings** — `gis_save_building` (code, name, floors, entrance point), then `gis_set_building_boundary`
   with the footprint. Each new footprint is a new version; old versions are kept.
3. **Offices and service points** — `gis_save_location` with `p_office_id` (links the office) and the room /
   floor; then `gis_link_service_location` for each queue service at that point. A place can be registered
   without coordinates first and surveyed later; it cannot be verified until it has coordinates.
4. **Walking paths** — `gis_save_path` with one LineString per segment between junctions. Segments that meet
   must share an end point (within 0.5 m) so they connect. Record `surface`, `is_accessible` (leave null when
   unknown — unknown is treated as not accessible), `is_one_way`, `is_covered`.
5. **Accessibility** — ramps, elevators, stairs, accessible restrooms per location, building or path.
6. **Verify** — `gis_verify_feature(type, id, 'verified', method, evidence, notes)` by a second person. Use
   `rejected` for wrong data and `retired` for features that no longer exist.

## Bulk import

Prepare a GeoJSON FeatureCollection (Points for locations with `properties.name`, LineStrings for paths) and
run `gis_import_geojson(campus, 'locations' | 'paths', collection, source, true)` first: the dry run reports
each invalid feature without saving. Run again with `false` to import; imported features start `unverified`.
Store the source file in the private `gis-imports` bucket for traceability.

## Checking the result

- `gis_map_features(campus, null, false)` shows only verified features.
- `gis_find_route(a, b)` should return `status: ok` between two verified locations connected by verified
  paths. If it reports `location_not_connected`, no verified path ends within 50 m of a location — add a short
  path segment to its entrance.
- Every change and decision is in `gis_location_verifications` with the previous and new geometry.

## What must never be done

- Do not copy coordinates from memory, screenshots of other maps without a license, or approximate positions.
- Do not mark data verified without a stated method and evidence.
- Do not verify data you entered yourself (the database blocks this).
