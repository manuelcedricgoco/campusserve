-- GIS foundation tests. All coordinates below are SYNTHETIC TEST GEOMETRY
-- created inside this rolled-back transaction; they are not campus data.
begin;
\ir _helpers.sql

select pg_temp.as_owner();
insert into public.user_roles (user_id, role) values (pg_temp.u('program_head'), 'administrator'); -- second verifier
select pg_temp.put('campus', (select id from public.campuses where code = 'OMSU_MAMBURAO')::text);

-- Nothing invented ------------------------------------------------------------------
select pg_temp.ok((select boundary is null and reference_point is null and verification_status = 'unverified'
                     from public.campuses where code = 'OMSU_MAMBURAO'),
  'the campus row has no seeded geometry and is unverified');
select pg_temp.ok((select count(*) from public.campus_locations) = 0 and (select count(*) from public.campus_paths) = 0
                  and (select count(*) from public.campus_buildings) = 0,
  'no buildings, locations or paths are seeded');
select pg_temp.ok((select count(*) from pg_indexes where schemaname = 'public' and indexdef ilike '%using gist%') >= 6,
  'geometry columns have GiST spatial indexes');

-- Authorization and validation ------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select public.gis_save_location(null, %L, ''X'', ''{"type":"Point","coordinates":[121,14]}'')',
                            pg_temp.get('campus')), 'FORBIDDEN', 'students cannot register locations');
select pg_temp.act_as('admin');
select pg_temp.fails(format('select public.gis_save_location(null, %L, ''X'', ''{"type":"Point","coordinates":[2.35,48.85]}'')',
                            pg_temp.get('campus')), 'INVALID_GEOMETRY', 'coordinates outside the Philippines are rejected');
select pg_temp.fails(format('select public.gis_save_location(null, %L, ''X'', ''{"type":"Point","coordinates":[121]}'')',
                            pg_temp.get('campus')), 'INVALID_GEOJSON', 'malformed GeoJSON is rejected');
select pg_temp.fails(format('select public.gis_save_location(null, %L, ''X'', ''{"type":"LineString","coordinates":[[121,14],[121.001,14]]}'')',
                            pg_temp.get('campus')), 'INVALID_GEOMETRY', 'a location must be a Point');

-- Register synthetic locations and paths -----------------------------------------------------
select pg_temp.put('loc_a', (public.gis_save_location(null, pg_temp.get('campus')::uuid, 'Test Hall A',
  '{"type":"Point","coordinates":[121.0000,14.0000]}', 'office', p_layer_code => 'locations',
  p_office_id => (select id from public.offices where code = 'REGISTRAR'))).id::text);
select pg_temp.put('loc_b', (public.gis_save_location(null, pg_temp.get('campus')::uuid, 'Test Hall B',
  '{"type":"Point","coordinates":[121.0005,14.0005]}', 'office', p_layer_code => 'locations')).id::text);
select pg_temp.put('loc_far', (public.gis_save_location(null, pg_temp.get('campus')::uuid, 'Far Test Point',
  '{"type":"Point","coordinates":[121.0100,14.0100]}', 'landmark', p_layer_code => 'locations')).id::text);
select pg_temp.put('loc_secret', (public.gis_save_location(null, pg_temp.get('campus')::uuid, 'Restricted Test Room',
  '{"type":"Point","coordinates":[121.0002,14.0001]}', 'office', p_layer_code => 'restricted',
  p_visibility => 'restricted')).id::text);
select pg_temp.put('loc_unsurveyed', (public.gis_save_location(null, pg_temp.get('campus')::uuid, 'Not yet surveyed office')).id::text);
select pg_temp.ok((select verification_status from public.campus_locations where id = pg_temp.get('loc_a')::uuid) = 'unverified',
  'new locations start unverified');
select pg_temp.ok(exists (select 1 from public.office_locations where location_id = pg_temp.get('loc_a')::uuid and is_primary),
  'a location can be linked to its office');
select pg_temp.put('p1', (public.gis_save_path(null, pg_temp.get('campus')::uuid,
  '{"type":"LineString","coordinates":[[121.0000,14.0000],[121.0005,14.0000]]}', 'Walk 1')).id::text);
select pg_temp.put('p2', (public.gis_save_path(null, pg_temp.get('campus')::uuid,
  '{"type":"LineString","coordinates":[[121.0005,14.0000],[121.0005,14.0005]]}', 'Walk 2')).id::text);
select pg_temp.ok((select abs(length_m - 54) < 2 and source_node is not null and target_node is not null
                     from public.campus_paths where id = pg_temp.get('p1')::bigint),
  'path length (metres) and routing nodes are computed');
select pg_temp.ok((select target_node from public.campus_paths where id = pg_temp.get('p1')::bigint)
                  = (select source_node from public.campus_paths where id = pg_temp.get('p2')::bigint),
  'touching path ends share one routing node');

-- Routing never invents a route ------------------------------------------------------------------
select pg_temp.ok((public.gis_find_route(pg_temp.get('loc_a')::uuid, pg_temp.get('loc_b')::uuid)) ->> 'reason' = 'location_unverified',
  'no directions between unverified locations');

-- Verification: four-eyes ------------------------------------------------------------------------
select pg_temp.fails(format('select public.gis_verify_feature(''location'', %L, ''verified'', ''field_survey'')', pg_temp.get('loc_a')),
  'SELF_VERIFICATION', 'the person who entered a location cannot verify it');
select pg_temp.act_as('program_head');
select pg_temp.fails(format('select public.gis_verify_feature(''location'', %L, ''verified'')', pg_temp.get('loc_a')),
  'METHOD_REQUIRED', 'verification must state its method');
select pg_temp.fails(format('select public.gis_verify_feature(''location'', %L, ''verified'', ''field_survey'')', pg_temp.get('loc_unsurveyed')),
  'GEOMETRY_REQUIRED', 'a location without coordinates cannot be verified');
select public.gis_verify_feature('location', x, 'verified', 'field_survey', 'synthetic test')
  from unnest(array[pg_temp.get('loc_a'), pg_temp.get('loc_b'), pg_temp.get('loc_far')]) x;
select pg_temp.ok((public.gis_find_route(pg_temp.get('loc_a')::uuid, pg_temp.get('loc_b')::uuid)) ->> 'reason' = 'no_verified_paths',
  'no directions while no path is verified');
select public.gis_verify_feature('path', x, 'verified', 'field_survey') from unnest(array[pg_temp.get('p1'), pg_temp.get('p2')]) x;
select pg_temp.put('route', public.gis_find_route(pg_temp.get('loc_a')::uuid, pg_temp.get('loc_b')::uuid)::text);
select pg_temp.ok((pg_temp.get('route')::jsonb ->> 'status') = 'ok'
                  and abs(((pg_temp.get('route')::jsonb -> 'routes' -> 0 ->> 'distance_m')::numeric) - 109) < 4
                  and (pg_temp.get('route')::jsonb -> 'routes' -> 0 -> 'geometry' ->> 'type') = 'LineString',
  'a verified route is returned with distance and GeoJSON geometry');
select pg_temp.ok((public.gis_find_route(pg_temp.get('loc_a')::uuid, pg_temp.get('loc_far')::uuid)) ->> 'reason' = 'location_not_connected',
  'a location far from every verified path gets no invented route');
select pg_temp.ok((public.gis_find_route(pg_temp.get('loc_a')::uuid, pg_temp.get('loc_b')::uuid, 1, true)) ->> 'reason' = 'no_route',
  'accessible-only routing refuses paths whose accessibility is unknown');

-- Editing geometry resets verification; history is append-only --------------------------------------
select pg_temp.act_as('admin');
select public.gis_save_location(pg_temp.get('loc_b')::uuid, pg_temp.get('campus')::uuid, 'Test Hall B',
  '{"type":"Point","coordinates":[121.0006,14.0005]}', 'office', p_layer_code => 'locations');
select pg_temp.ok((select verification_status from public.campus_locations where id = pg_temp.get('loc_b')::uuid) = 'unverified',
  'moving a location makes it unverified again');
select pg_temp.as_owner();
select pg_temp.ok((select count(*) from public.gis_location_verifications where location_id = pg_temp.get('loc_b')::uuid) = 3,
  'every submission, verification and edit is in the history');
select pg_temp.fails('update public.gis_location_verifications set notes = ''x''', 'HISTORY_IMMUTABLE',
  'verification history cannot be changed');

-- Office-scoped editing ------------------------------------------------------------------------------
select pg_temp.act_as('sas_head');
select pg_temp.ok((public.gis_save_location(null, pg_temp.get('campus')::uuid, 'SAS Office (test)',
                   '{"type":"Point","coordinates":[121.0001,14.0001]}', 'office',
                   p_office_id => (select id from public.offices where code = 'SAS'))).id is not null,
  'an office head can register their own office''s location');
select pg_temp.fails(format('select public.gis_save_location(%L, %L, ''Hijack'', null, p_office_id => %L)',
                            pg_temp.get('loc_a'), pg_temp.get('campus'), (select id from public.offices where code = 'SAS')),
  'FORBIDDEN', 'an office head cannot edit another office''s location');
select pg_temp.fails(format('select public.gis_verify_feature(''location'', %L, ''verified'', ''field_survey'')', pg_temp.get('loc_a')),
  'FORBIDDEN', 'office heads cannot verify GIS data');

-- Visibility ---------------------------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.put('fc', public.gis_map_features(pg_temp.get('campus')::uuid)::text);
select pg_temp.ok((select count(*) from jsonb_array_elements(pg_temp.get('fc')::jsonb -> 'features') f
                    where f -> 'properties' ->> 'name' = 'Restricted Test Room') = 0,
  'students do not get restricted features');
select pg_temp.ok((select count(*) from jsonb_array_elements(pg_temp.get('fc')::jsonb -> 'features') f
                    where f -> 'properties' ->> 'kind' = 'path') = 2
                  and (select bool_and(f -> 'properties' ? 'verification_status')
                         from jsonb_array_elements(pg_temp.get('fc')::jsonb -> 'features') f),
  'map features are GeoJSON with a verification status on every feature');
select pg_temp.ok((select count(*) from public.campus_locations where name = 'Restricted Test Room') = 0,
  'RLS hides restricted locations from direct reads');
select pg_temp.act_as('admin');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.gis_map_features(pg_temp.get('campus')::uuid) -> 'features') f
                    where f -> 'properties' ->> 'name' = 'Restricted Test Room') = 1,
  'GIS managers see restricted features');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.gis_map_features(pg_temp.get('campus')::uuid, null, false) -> 'features') f
                    where f -> 'properties' ->> 'verification_status' <> 'verified') = 0,
  'verified-only mode hides unverified features');
select pg_temp.act_as_service();
select pg_temp.ok((select count(*) from jsonb_array_elements(public.gis_map_features(pg_temp.get('campus')::uuid, null, true, true) -> 'features') f
                    where f -> 'properties' ->> 'name' = 'Restricted Test Room') = 0,
  'public (signed-out) mode returns public features only');

-- Search, nearest, campus boundary -------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.ok(exists (select 1 from public.gis_search_locations(pg_temp.get('campus')::uuid, 'registrar')
                          where location_id = pg_temp.get('loc_a')::uuid and match_type = 'office'),
  'search finds a location by its office name');
select pg_temp.act_as('admin');
select public.gis_link_service_location(
  (select s.id from public.services s join public.offices o on o.id = s.office_id
    where o.code = 'REGISTRAR' and s.code = 'DOCUMENT_REQUEST'), pg_temp.get('loc_a')::uuid);
select pg_temp.act_as('bsit1');
select pg_temp.ok((select location_id from public.gis_nearest_service_locations(
                     (select s.id from public.services s join public.offices o on o.id = s.office_id
                       where o.code = 'REGISTRAR' and s.code = 'DOCUMENT_REQUEST'), 121.0001, 14.0001) limit 1)
                  = pg_temp.get('loc_a')::uuid,
  'nearest verified service location is found');
select pg_temp.act_as('admin');
select public.gis_set_campus_geometry(pg_temp.get('campus')::uuid,
  '{"type":"Polygon","coordinates":[[[120.999,13.999],[121.002,13.999],[121.002,14.002],[120.999,14.002],[120.999,13.999]]]}');
select pg_temp.act_as('program_head');
select public.gis_verify_feature('campus', pg_temp.get('campus'), 'verified', 'university_records');
select pg_temp.act_as('admin');
select pg_temp.fails(format('select public.gis_save_location(null, %L, ''Outside'', ''{"type":"Point","coordinates":[121.0500,14.0500]}'')',
                            pg_temp.get('campus')),
  'OUTSIDE_CAMPUS', 'once the campus boundary is verified, outside points are rejected');

-- GeoJSON import ---------------------------------------------------------------------------------------------
select pg_temp.ok((select (r ->> 'valid')::int = 2 and (r ->> 'invalid')::int = 1
                     from public.gis_import_geojson(pg_temp.get('campus')::uuid, 'locations',
                       '{"type":"FeatureCollection","features":[
                          {"type":"Feature","geometry":{"type":"Point","coordinates":[121.0010,14.0010]},"properties":{"name":"Import 1"}},
                          {"type":"Feature","geometry":{"type":"Point","coordinates":[121.0011,14.0010]},"properties":{"name":"Import 2"}},
                          {"type":"Feature","geometry":{"type":"Point","coordinates":[121.0012,14.0010]},"properties":{}}]}') r),
  'import dry run validates each feature');
select pg_temp.ok(not exists (select 1 from public.campus_locations where name like 'Import %'), 'a dry run saves nothing');
select public.gis_import_geojson(pg_temp.get('campus')::uuid, 'locations',
  '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[121.0010,14.0010]},"properties":{"name":"Import 1"}}]}',
  'import', false);
select pg_temp.ok((select verification_status from public.campus_locations where name = 'Import 1') = 'unverified',
  'imported features start unverified');

-- Location analytics ---------------------------------------------------------------------------------------------
select pg_temp.act_as('bsit1');
select pg_temp.fails(format('select * from public.gis_activity_by_location(%L, now() - interval ''1 day'', now() + interval ''1 day'', ''queue_tickets'')',
                            pg_temp.get('campus')), 'FORBIDDEN', 'students cannot view location analytics');
select public.submit_service_request((select s.id from public.services s join public.offices o on o.id = s.office_id
                                       where o.code = 'REGISTRAR' and s.code = 'DOCUMENT_REQUEST'), 'Test request');
select pg_temp.act_as('admin');
select pg_temp.ok((select activity_count from public.gis_activity_by_location(pg_temp.get('campus')::uuid,
                     now() - interval '1 day', now() + interval '1 day', 'service_requests')
                    where location_id = pg_temp.get('loc_a')::uuid) = 1,
  'activity is aggregated at the office''s location (heatmap data)');

select pg_temp.act_as_anon();
select pg_temp.fails('select count(*) from public.campus_locations', '42501', 'anon has no direct access to GIS tables');

select pg_temp.summary('080_gis');
rollback;
