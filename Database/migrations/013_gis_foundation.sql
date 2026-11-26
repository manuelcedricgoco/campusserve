-- =============================================================================
-- CampusServe 013: Advanced GIS foundation (OMSU Mamburao Campus)
--
-- Storage: geometry(<type>, 4326) (EPSG:4326 longitude/latitude), GiST indexes;
-- distances and lengths in metres via geography casts; GeoJSON in and out.
--
-- GEOGRAPHIC DATA RULE: no coordinates, boundaries or paths are seeded. The
-- campus row exists without geometry and is 'unverified'. Every feature has a
-- verification status; routing uses only VERIFIED paths and locations, and
-- returns 'unavailable' rather than inventing a route.
--
-- Editing and verification are separate (decision D8): the last editor of a
-- feature can never verify it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Geometry sanity check (generic, not campus data): valid, SRID 4326, and
-- inside a coarse bounding box around the Philippines.
-- -----------------------------------------------------------------------------
create or replace function private.gis_geometry_ok(p_geom extensions.geometry)
returns boolean
language sql
immutable
set search_path = extensions
as $$
  select p_geom is null
      or (ST_SRID(p_geom) = 4326
          and ST_IsValid(p_geom)
          and not ST_IsEmpty(p_geom)
          and ST_Within(p_geom, ST_MakeEnvelope(116.0, 4.0, 127.0, 21.5, 4326)));
$$;

create or replace function private.gis_status_ok(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('unverified', 'pending_review', 'verified', 'rejected', 'retired');
$$;

-- -----------------------------------------------------------------------------
-- Reference tables
-- -----------------------------------------------------------------------------
create table public.gis_data_sources (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name         text not null,
  source_type  text not null check (source_type in
                 ('administrator_entry', 'field_survey', 'openstreetmap', 'university_records', 'import', 'other')),
  license      text,
  attribution  text,
  url          text,
  notes        text,
  created_at   timestamptz not null default now(),
  constraint gis_sources_osm_attribution_chk check (source_type <> 'openstreetmap' or attribution is not null)
);

create table public.location_categories (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name         text not null,
  icon         text,
  applies_to   text not null default 'location' check (applies_to in ('location', 'building', 'path', 'any')),
  description  text,
  created_at   timestamptz not null default now()
);

create table public.campuses (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code ~ '^[A-Z0-9_]+$'),
  name                 text not null,
  municipality         text,
  province             text,
  boundary             extensions.geometry(MultiPolygon, 4326),
  reference_point      extensions.geometry(Point, 4326),
  verification_status  text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  data_source_id       uuid references public.gis_data_sources (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint campuses_geometry_ok_chk check (private.gis_geometry_ok(boundary) and private.gis_geometry_ok(reference_point)),
  constraint campuses_verified_has_geometry_chk check (verification_status <> 'verified' or boundary is not null)
);
create index campuses_boundary_gix on public.campuses using gist (boundary);

create table public.campus_map_layers (
  id                   uuid primary key default gen_random_uuid(),
  campus_id            uuid not null references public.campuses (id) on delete cascade,
  code                 text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name                 text not null,
  description          text,
  layer_type           text not null check (layer_type in ('boundaries', 'buildings', 'locations', 'paths', 'heatmap', 'custom')),
  visibility           text not null default 'public' check (visibility in ('public', 'authenticated', 'restricted')),
  required_permission  text references public.permissions (code),
  style                jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  display_order        integer not null default 100,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (campus_id, code)
);

-- -----------------------------------------------------------------------------
-- Buildings, boundaries, locations
-- -----------------------------------------------------------------------------
create table public.campus_buildings (
  id                   uuid primary key default gen_random_uuid(),
  campus_id            uuid not null references public.campuses (id) on delete cascade,
  code                 text not null check (code ~ '^[A-Z0-9_]+$'),
  name                 text not null,
  description          text,
  floors               smallint check (floors between 1 and 50),
  owner_department_id  uuid references public.departments (id) on delete set null,
  category_id          uuid references public.location_categories (id),
  layer_id             uuid references public.campus_map_layers (id) on delete set null,
  visibility           text not null default 'public' check (visibility in ('public', 'authenticated', 'restricted')),
  entrance_point       extensions.geometry(Point, 4326),
  is_active            boolean not null default true,
  verification_status  text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  data_source_id       uuid references public.gis_data_sources (id),
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (campus_id, code),
  constraint campus_buildings_geometry_ok_chk check (private.gis_geometry_ok(entrance_point))
);
create index campus_buildings_entrance_gix on public.campus_buildings using gist (entrance_point);
create index campus_buildings_name_trgm on public.campus_buildings using gin (name extensions.gin_trgm_ops);

create table public.campus_building_boundaries (
  id                   uuid primary key default gen_random_uuid(),
  building_id          uuid not null references public.campus_buildings (id) on delete cascade,
  version              integer not null check (version > 0),
  boundary             extensions.geometry(MultiPolygon, 4326) not null,
  is_current           boolean not null default true,
  verification_status  text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  data_source_id       uuid references public.gis_data_sources (id),
  notes                text,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  unique (building_id, version),
  constraint campus_building_boundaries_geometry_ok_chk check (private.gis_geometry_ok(boundary))
);
create unique index campus_building_boundaries_one_current_idx on public.campus_building_boundaries (building_id) where is_current;
create index campus_building_boundaries_gix on public.campus_building_boundaries using gist (boundary);

create table public.campus_locations (
  id                     uuid primary key default gen_random_uuid(),
  campus_id              uuid not null references public.campuses (id) on delete cascade,
  building_id            uuid references public.campus_buildings (id) on delete set null,
  name                   text not null check (length(trim(name)) > 0),
  code                   text check (code ~ '^[A-Z0-9_]+$'),
  description            text,
  category_id            uuid references public.location_categories (id),
  layer_id               uuid references public.campus_map_layers (id) on delete set null,
  floor                  text,
  room                   text,
  -- May be null while a place is registered but not yet surveyed.
  location               extensions.geometry(Point, 4326),
  owner_organization_id  uuid references public.organizations (id) on delete set null,
  owner_department_id    uuid references public.departments (id) on delete set null,
  visibility             text not null default 'public' check (visibility in ('public', 'authenticated', 'restricted')),
  opening_hours          jsonb,
  contact_info           text,
  is_active              boolean not null default true,
  verification_status    text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by            uuid references public.profiles (id),
  verified_at            timestamptz,
  data_source_id         uuid references public.gis_data_sources (id),
  created_by             uuid references public.profiles (id),
  updated_by             uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (campus_id, code),
  constraint campus_locations_geometry_ok_chk check (private.gis_geometry_ok(location)),
  constraint campus_locations_verified_has_point_chk check (verification_status <> 'verified' or location is not null)
);
create index campus_locations_gix on public.campus_locations using gist (location);
create index campus_locations_name_trgm on public.campus_locations using gin (name extensions.gin_trgm_ops);
create index campus_locations_building_idx on public.campus_locations (building_id);

create table public.office_locations (
  office_id    uuid not null references public.offices (id) on delete cascade,
  location_id  uuid not null references public.campus_locations (id) on delete cascade,
  is_primary   boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  primary key (office_id, location_id)
);
create unique index office_locations_one_primary_idx on public.office_locations (office_id) where is_primary;
create index office_locations_location_idx on public.office_locations (location_id);

create table public.service_locations (
  service_id   uuid not null references public.services (id) on delete cascade,
  location_id  uuid not null references public.campus_locations (id) on delete cascade,
  is_primary   boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  primary key (service_id, location_id)
);
create unique index service_locations_one_primary_idx on public.service_locations (service_id) where is_primary;
create index service_locations_location_idx on public.service_locations (location_id);

-- -----------------------------------------------------------------------------
-- Walking network (pgRouting needs integer node and edge ids)
-- -----------------------------------------------------------------------------
create table public.campus_path_nodes (
  id           bigint generated always as identity primary key,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  node         extensions.geometry(Point, 4326) not null,
  location_id  uuid references public.campus_locations (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint campus_path_nodes_geometry_ok_chk check (private.gis_geometry_ok(node))
);
create index campus_path_nodes_gix on public.campus_path_nodes using gist (node);

create table public.campus_paths (
  id                   bigint generated always as identity primary key,
  campus_id            uuid not null references public.campuses (id) on delete cascade,
  name                 text,
  path                 extensions.geometry(LineString, 4326) not null,
  length_m             double precision,
  source_node          bigint references public.campus_path_nodes (id),
  target_node          bigint references public.campus_path_nodes (id),
  surface              text check (surface in ('concrete', 'asphalt', 'gravel', 'dirt', 'grass', 'tile', 'other')),
  is_accessible        boolean,
  is_one_way           boolean not null default false,
  is_covered           boolean,
  layer_id             uuid references public.campus_map_layers (id) on delete set null,
  visibility           text not null default 'public' check (visibility in ('public', 'authenticated', 'restricted')),
  is_active            boolean not null default true,
  verification_status  text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  data_source_id       uuid references public.gis_data_sources (id),
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint campus_paths_geometry_ok_chk check (private.gis_geometry_ok(path))
);
create index campus_paths_gix on public.campus_paths using gist (path);
create index campus_paths_nodes_idx on public.campus_paths (source_node, target_node);

create table public.location_accessibility (
  id                   uuid primary key default gen_random_uuid(),
  location_id          uuid references public.campus_locations (id) on delete cascade,
  building_id          uuid references public.campus_buildings (id) on delete cascade,
  path_id              bigint references public.campus_paths (id) on delete cascade,
  feature              text not null check (feature in ('wheelchair_ramp', 'elevator', 'stairs', 'accessible_restroom',
                         'handrail', 'tactile_paving', 'accessible_parking', 'step_free_entrance', 'other')),
  is_available         boolean not null,
  notes                text,
  verification_status  text not null default 'unverified' check (private.gis_status_ok(verification_status)),
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  created_by           uuid references public.profiles (id),
  updated_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint location_accessibility_one_target_chk check (num_nonnulls(location_id, building_id, path_id) = 1)
);

-- Append-only verification history for every kind of GIS feature.
create table public.gis_location_verifications (
  id                 bigint generated always as identity primary key,
  feature_type       text not null check (feature_type in
                       ('campus', 'building', 'building_boundary', 'location', 'path', 'accessibility')),
  campus_id          uuid references public.campuses (id) on delete cascade,
  building_id        uuid references public.campus_buildings (id) on delete cascade,
  boundary_id        uuid references public.campus_building_boundaries (id) on delete cascade,
  location_id        uuid references public.campus_locations (id) on delete cascade,
  path_id            bigint references public.campus_paths (id) on delete cascade,
  accessibility_id   uuid references public.location_accessibility (id) on delete cascade,
  action             text not null check (action in ('submitted', 'edited', 'verified', 'rejected', 'retired')),
  method             text check (method in ('field_survey', 'gps_device', 'university_records',
                       'imagery_review', 'import', 'other')),
  previous_geometry  extensions.geometry(Geometry, 4326),
  new_geometry       extensions.geometry(Geometry, 4326),
  evidence           text,
  notes              text,
  actor_id           uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  constraint gis_verifications_one_target_chk check (
    num_nonnulls(campus_id, building_id, boundary_id, location_id, path_id, accessibility_id) = 1)
);
create index gis_location_verifications_location_idx on public.gis_location_verifications (location_id);
create index gis_location_verifications_path_idx on public.gis_location_verifications (path_id);
create index gis_location_verifications_building_idx on public.gis_location_verifications (building_id);

create or replace function private.prevent_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.fail('HISTORY_IMMUTABLE', format('%s rows cannot be changed or deleted.', tg_table_name));
  return null;
end;
$$;
create trigger gis_location_verifications_append_only before update or delete on public.gis_location_verifications
  for each row execute function private.prevent_history_mutation();

-- -----------------------------------------------------------------------------
-- Path topology: snap path endpoints to nodes (within 0.5 m) and compute length.
-- -----------------------------------------------------------------------------
create or replace function private.gis_node_for(p_campus_id uuid, p_point extensions.geometry)
returns bigint
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_id bigint;
begin
  select n.id into v_id
    from public.campus_path_nodes n
   where n.campus_id = p_campus_id
     and ST_DWithin(n.node::geography, p_point::geography, 0.5)
   order by n.node::geography <-> p_point::geography
   limit 1;
  if v_id is null then
    insert into public.campus_path_nodes (campus_id, node) values (p_campus_id, p_point) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.gis_prepare_path()
returns trigger
language plpgsql
security definer
set search_path = extensions
as $$
begin
  if tg_op = 'INSERT' or new.path is distinct from old.path then
    new.length_m := ST_Length(new.path::geography);
    new.source_node := private.gis_node_for(new.campus_id, ST_StartPoint(new.path));
    new.target_node := private.gis_node_for(new.campus_id, ST_EndPoint(new.path));
    if new.source_node = new.target_node then
      perform private.fail('INVALID_PATH', 'A path must connect two different points.');
    end if;
  end if;
  return new;
end;
$$;
create trigger campus_paths_prepare before insert or update of path on public.campus_paths
  for each row execute function private.gis_prepare_path();

-- -----------------------------------------------------------------------------
-- Visibility
-- -----------------------------------------------------------------------------
create or replace function private.can_view_gis(p_visibility text, p_layer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
           when 'public' then true
           when 'authenticated' then private.is_active_user()
           else private.is_active_user()
                and (private.has_global_permission('gis.view_restricted')
                     or private.has_global_permission('gis.manage')
                     or exists (select 1 from public.campus_map_layers l
                                where l.id = p_layer_id and l.required_permission is not null
                                  and private.has_permission_anywhere(l.required_permission)))
         end
     and (p_layer_id is null
          or exists (select 1 from public.campus_map_layers l
                     where l.id = p_layer_id and l.is_active
                       and (l.visibility = 'public'
                            or (l.visibility = 'authenticated' and private.is_active_user())
                            or (l.visibility = 'restricted' and private.is_active_user()
                                and (private.has_global_permission('gis.view_restricted')
                                     or private.has_global_permission('gis.manage')
                                     or (l.required_permission is not null
                                         and private.has_permission_anywhere(l.required_permission)))))));
$$;

-- Who may edit a location: campus GIS managers, or an office head for a
-- location linked to (or being linked to) their office.
create or replace function private.can_edit_location(p_location_id uuid, p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_global_permission('gis.manage')
      or (p_office_id is not null and private.has_office_permission(p_office_id, 'gis.manage_office_locations')
          and (p_location_id is null
               or not exists (select 1 from public.office_locations ol where ol.location_id = p_location_id)
               or exists (select 1 from public.office_locations ol
                          where ol.location_id = p_location_id and ol.office_id = p_office_id)));
$$;

-- -----------------------------------------------------------------------------
-- Editing functions (geometry change => back to 'unverified', history row)
-- -----------------------------------------------------------------------------
create or replace function private.gis_point_from_geojson(p_geojson jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = extensions
as $$
declare
  v_geom geometry;
begin
  if p_geojson is null then
    return null;
  end if;
  begin
    v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  exception when others then
    perform private.fail('INVALID_GEOJSON', 'The geometry is not valid GeoJSON.');
  end;
  return v_geom;
end;
$$;

create or replace function private.gis_require_in_campus(p_campus_id uuid, p_geom extensions.geometry)
returns void
language plpgsql
stable
security definer
set search_path = extensions
as $$
declare
  v_campus public.campuses;
begin
  if p_geom is null then
    return;
  end if;
  if not private.gis_geometry_ok(p_geom) then
    perform private.fail('INVALID_GEOMETRY',
      'Geometry must be valid, use EPSG:4326 (longitude, latitude) and lie in the Philippines.');
  end if;
  select * into v_campus from public.campuses where id = p_campus_id;
  if v_campus.verification_status = 'verified' and v_campus.boundary is not null
     and not ST_Covers(ST_Buffer(v_campus.boundary::geography, 25)::geometry, p_geom) then
    perform private.fail('OUTSIDE_CAMPUS', 'The geometry is outside the verified campus boundary.');
  end if;
end;
$$;

create or replace function public.gis_save_location(
  p_location_id uuid,
  p_campus_id uuid,
  p_name text,
  p_geojson jsonb default null,
  p_category_code text default null,
  p_building_id uuid default null,
  p_floor text default null,
  p_room text default null,
  p_layer_code text default null,
  p_visibility text default 'public',
  p_description text default null,
  p_office_id uuid default null,
  p_owner_organization_id uuid default null,
  p_data_source_code text default 'administrator_entry',
  p_code text default null)
returns public.campus_locations
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_geom geometry := private.gis_point_from_geojson(p_geojson);
  v_old public.campus_locations;
  v_loc public.campus_locations;
  v_layer uuid;
  v_category uuid;
  v_source uuid;
begin
  if not private.can_edit_location(p_location_id, p_office_id) then
    perform private.fail('FORBIDDEN', 'You cannot edit this location.', '42501');
  end if;
  if v_geom is not null and GeometryType(v_geom) <> 'POINT' then
    perform private.fail('INVALID_GEOMETRY', 'A location must be a Point.');
  end if;
  perform private.gis_require_in_campus(p_campus_id, v_geom);
  select id into v_layer from public.campus_map_layers where campus_id = p_campus_id and code = p_layer_code;
  select id into v_category from public.location_categories where code = p_category_code;
  select id into v_source from public.gis_data_sources where code = p_data_source_code;
  if p_category_code is not null and v_category is null then
    perform private.fail('CATEGORY_NOT_FOUND', 'Unknown location category.');
  end if;

  if p_location_id is null then
    insert into public.campus_locations
      (campus_id, building_id, name, code, description, category_id, layer_id, floor, room, location,
       owner_organization_id, visibility, data_source_id, created_by, updated_by)
    values
      (p_campus_id, p_building_id, p_name, p_code, p_description, v_category, v_layer, p_floor, p_room, v_geom,
       p_owner_organization_id, p_visibility, v_source, v_actor, v_actor)
    returning * into v_loc;
    insert into public.gis_location_verifications (feature_type, location_id, action, method, new_geometry, actor_id)
    values ('location', v_loc.id, 'submitted', 'other', v_geom, v_actor);
  else
    select * into v_old from public.campus_locations where id = p_location_id for update;
    if not found then
      perform private.fail('LOCATION_NOT_FOUND', 'Location not found.');
    end if;
    update public.campus_locations
       set name = p_name, code = p_code, description = p_description, building_id = p_building_id,
           category_id = coalesce(v_category, category_id), layer_id = coalesce(v_layer, layer_id),
           floor = p_floor, room = p_room, location = v_geom, owner_organization_id = p_owner_organization_id,
           visibility = p_visibility, data_source_id = coalesce(v_source, data_source_id), updated_by = v_actor,
           verification_status = case when v_geom is distinct from v_old.location then 'unverified'
                                      else verification_status end,
           verified_by = case when v_geom is distinct from v_old.location then null else verified_by end,
           verified_at = case when v_geom is distinct from v_old.location then null else verified_at end
     where id = p_location_id returning * into v_loc;
    insert into public.gis_location_verifications
      (feature_type, location_id, action, previous_geometry, new_geometry, actor_id)
    values ('location', v_loc.id, 'edited', v_old.location, v_geom, v_actor);
  end if;

  if p_office_id is not null then
    insert into public.office_locations (office_id, location_id, is_primary)
    values (p_office_id, v_loc.id, not exists (select 1 from public.office_locations where office_id = p_office_id))
    on conflict (office_id, location_id) do nothing;
  end if;
  return v_loc;
end;
$$;

create or replace function public.gis_link_service_location(p_service_id uuid, p_location_id uuid, p_is_primary boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_office uuid;
begin
  select office_id into v_office from public.services where id = p_service_id;
  if v_office is null then
    perform private.fail('SERVICE_NOT_FOUND', 'Service not found.');
  end if;
  if not (private.has_global_permission('gis.manage')
          or private.has_office_permission(v_office, 'gis.manage_office_locations')) then
    perform private.fail('FORBIDDEN', 'You cannot link locations for this service.', '42501');
  end if;
  if p_is_primary then
    update public.service_locations set is_primary = false where service_id = p_service_id and is_primary;
  end if;
  insert into public.service_locations (service_id, location_id, is_primary)
  values (p_service_id, p_location_id, p_is_primary)
  on conflict (service_id, location_id) do update set is_primary = excluded.is_primary;
end;
$$;

create or replace function public.gis_save_building(
  p_building_id uuid, p_campus_id uuid, p_code text, p_name text, p_floors smallint default null,
  p_entrance_geojson jsonb default null, p_owner_department_id uuid default null, p_visibility text default 'public',
  p_description text default null, p_data_source_code text default 'administrator_entry')
returns public.campus_buildings
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_geom geometry := private.gis_point_from_geojson(p_entrance_geojson);
  v_old public.campus_buildings;
  v_b public.campus_buildings;
begin
  if not private.has_global_permission('gis.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage campus buildings.', '42501');
  end if;
  perform private.gis_require_in_campus(p_campus_id, v_geom);
  if p_building_id is null then
    insert into public.campus_buildings
      (campus_id, code, name, floors, entrance_point, owner_department_id, visibility, description,
       data_source_id, created_by, updated_by, layer_id)
    values (p_campus_id, p_code, p_name, p_floors, v_geom, p_owner_department_id, p_visibility, p_description,
            (select id from public.gis_data_sources where code = p_data_source_code), v_actor, v_actor,
            (select id from public.campus_map_layers where campus_id = p_campus_id and code = 'buildings'))
    returning * into v_b;
    insert into public.gis_location_verifications (feature_type, building_id, action, new_geometry, actor_id)
    values ('building', v_b.id, 'submitted', v_geom, v_actor);
  else
    select * into v_old from public.campus_buildings where id = p_building_id for update;
    update public.campus_buildings
       set code = p_code, name = p_name, floors = p_floors, entrance_point = v_geom,
           owner_department_id = p_owner_department_id, visibility = p_visibility, description = p_description,
           updated_by = v_actor,
           verification_status = case when v_geom is distinct from v_old.entrance_point then 'unverified'
                                      else verification_status end
     where id = p_building_id returning * into v_b;
    insert into public.gis_location_verifications
      (feature_type, building_id, action, previous_geometry, new_geometry, actor_id)
    values ('building', v_b.id, 'edited', v_old.entrance_point, v_geom, v_actor);
  end if;
  return v_b;
end;
$$;

-- Adds a new boundary version and makes it current (unverified until verified).
create or replace function public.gis_set_building_boundary(
  p_building_id uuid, p_geojson jsonb, p_data_source_code text default 'administrator_entry', p_notes text default null)
returns public.campus_building_boundaries
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_geom geometry := ST_Multi(private.gis_point_from_geojson(p_geojson));
  v_b public.campus_buildings;
  v_prev public.campus_building_boundaries;
  v_new public.campus_building_boundaries;
begin
  if not private.has_global_permission('gis.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage campus buildings.', '42501');
  end if;
  if v_geom is null or GeometryType(v_geom) <> 'MULTIPOLYGON' then
    perform private.fail('INVALID_GEOMETRY', 'A building boundary must be a Polygon or MultiPolygon.');
  end if;
  select * into v_b from public.campus_buildings where id = p_building_id;
  if not found then
    perform private.fail('BUILDING_NOT_FOUND', 'Building not found.');
  end if;
  perform private.gis_require_in_campus(v_b.campus_id, v_geom);
  select * into v_prev from public.campus_building_boundaries where building_id = p_building_id and is_current for update;
  update public.campus_building_boundaries set is_current = false where building_id = p_building_id and is_current;
  insert into public.campus_building_boundaries (building_id, version, boundary, data_source_id, notes, created_by)
  values (p_building_id,
          coalesce((select max(version) from public.campus_building_boundaries where building_id = p_building_id), 0) + 1,
          v_geom, (select id from public.gis_data_sources where code = p_data_source_code), p_notes, v_actor)
  returning * into v_new;
  insert into public.gis_location_verifications
    (feature_type, boundary_id, action, previous_geometry, new_geometry, actor_id)
  values ('building_boundary', v_new.id, 'submitted', v_prev.boundary, v_geom, v_actor);
  return v_new;
end;
$$;

create or replace function public.gis_save_path(
  p_path_id bigint, p_campus_id uuid, p_geojson jsonb, p_name text default null, p_surface text default null,
  p_is_accessible boolean default null, p_is_one_way boolean default false, p_is_covered boolean default null,
  p_visibility text default 'public', p_data_source_code text default 'administrator_entry')
returns public.campus_paths
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_geom geometry := private.gis_point_from_geojson(p_geojson);
  v_old public.campus_paths;
  v_p public.campus_paths;
begin
  if not private.has_global_permission('gis.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage campus paths.', '42501');
  end if;
  if v_geom is null or GeometryType(v_geom) <> 'LINESTRING' then
    perform private.fail('INVALID_GEOMETRY', 'A path must be a LineString.');
  end if;
  perform private.gis_require_in_campus(p_campus_id, v_geom);
  if p_path_id is null then
    insert into public.campus_paths
      (campus_id, name, path, surface, is_accessible, is_one_way, is_covered, visibility, data_source_id,
       created_by, updated_by, layer_id)
    values (p_campus_id, p_name, v_geom, p_surface, p_is_accessible, p_is_one_way, p_is_covered, p_visibility,
            (select id from public.gis_data_sources where code = p_data_source_code), v_actor, v_actor,
            (select id from public.campus_map_layers where campus_id = p_campus_id and code = 'paths'))
    returning * into v_p;
    insert into public.gis_location_verifications (feature_type, path_id, action, new_geometry, actor_id)
    values ('path', v_p.id, 'submitted', v_geom, v_actor);
  else
    select * into v_old from public.campus_paths where id = p_path_id for update;
    if not found then
      perform private.fail('PATH_NOT_FOUND', 'Path not found.');
    end if;
    update public.campus_paths
       set path = v_geom, name = p_name, surface = p_surface, is_accessible = p_is_accessible,
           is_one_way = p_is_one_way, is_covered = p_is_covered, visibility = p_visibility, updated_by = v_actor,
           verification_status = case when v_geom is distinct from v_old.path then 'unverified'
                                      else verification_status end
     where id = p_path_id returning * into v_p;
    insert into public.gis_location_verifications
      (feature_type, path_id, action, previous_geometry, new_geometry, actor_id)
    values ('path', v_p.id, 'edited', v_old.path, v_geom, v_actor);
  end if;
  return v_p;
end;
$$;

-- Verify / reject / retire any feature. The last editor cannot verify it.
create or replace function public.gis_verify_feature(
  p_feature_type text, p_feature_id text, p_decision text, p_method text default null,
  p_evidence text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_editor uuid;
  v_has_geom boolean;
  v_campus uuid;
begin
  if not private.has_global_permission('gis.verify') then
    perform private.fail('FORBIDDEN', 'You cannot verify GIS data.', '42501');
  end if;
  if p_decision not in ('verified', 'rejected', 'retired') then
    perform private.fail('INVALID_DECISION', 'Decision must be verified, rejected or retired.');
  end if;
  if p_decision = 'verified' and p_method is null then
    perform private.fail('METHOD_REQUIRED', 'State how the feature was verified (survey, GPS, records, ...).');
  end if;

  case p_feature_type
    when 'location' then
      select coalesce(updated_by, created_by), location is not null into v_editor, v_has_geom
        from public.campus_locations where id = p_feature_id::uuid for update;
    when 'building' then
      select coalesce(updated_by, created_by), true into v_editor, v_has_geom
        from public.campus_buildings where id = p_feature_id::uuid for update;
    when 'building_boundary' then
      select created_by, true into v_editor, v_has_geom
        from public.campus_building_boundaries where id = p_feature_id::uuid for update;
    when 'path' then
      select coalesce(updated_by, created_by), true into v_editor, v_has_geom
        from public.campus_paths where id = p_feature_id::bigint for update;
    when 'accessibility' then
      select coalesce(updated_by, created_by), true into v_editor, v_has_geom
        from public.location_accessibility where id = p_feature_id::uuid for update;
    when 'campus' then
      select updated_by, boundary is not null into v_editor, v_has_geom
        from public.campuses where id = p_feature_id::uuid for update;
    else
      perform private.fail('INVALID_FEATURE_TYPE', 'Unknown feature type.');
  end case;
  if v_has_geom is null then
    perform private.fail('FEATURE_NOT_FOUND', 'Feature not found.');
  end if;
  if p_decision = 'verified' and v_editor = v_actor then
    perform private.fail('SELF_VERIFICATION', 'Another person must verify data you entered.', '42501');
  end if;
  if p_decision = 'verified' and not v_has_geom then
    perform private.fail('GEOMETRY_REQUIRED', 'A feature needs coordinates before it can be verified.');
  end if;

  case p_feature_type
    when 'location' then
      update public.campus_locations set verification_status = p_decision, verified_by = v_actor, verified_at = now(),
             is_active = (p_decision <> 'retired') where id = p_feature_id::uuid;
    when 'building' then
      update public.campus_buildings set verification_status = p_decision, verified_by = v_actor, verified_at = now(),
             is_active = (p_decision <> 'retired') where id = p_feature_id::uuid;
    when 'building_boundary' then
      update public.campus_building_boundaries set verification_status = p_decision, verified_by = v_actor,
             verified_at = now() where id = p_feature_id::uuid;
    when 'path' then
      update public.campus_paths set verification_status = p_decision, verified_by = v_actor, verified_at = now(),
             is_active = (p_decision <> 'retired') where id = p_feature_id::bigint;
    when 'accessibility' then
      update public.location_accessibility set verification_status = p_decision, verified_by = v_actor,
             verified_at = now() where id = p_feature_id::uuid;
    when 'campus' then
      update public.campuses set verification_status = p_decision, verified_by = v_actor, verified_at = now()
       where id = p_feature_id::uuid;
  end case;

  insert into public.gis_location_verifications
    (feature_type, campus_id, building_id, boundary_id, location_id, path_id, accessibility_id,
     action, method, evidence, notes, actor_id)
  values (p_feature_type,
          case when p_feature_type = 'campus' then p_feature_id::uuid end,
          case when p_feature_type = 'building' then p_feature_id::uuid end,
          case when p_feature_type = 'building_boundary' then p_feature_id::uuid end,
          case when p_feature_type = 'location' then p_feature_id::uuid end,
          case when p_feature_type = 'path' then p_feature_id::bigint end,
          case when p_feature_type = 'accessibility' then p_feature_id::uuid end,
          p_decision, p_method, p_evidence, p_notes, v_actor);
end;
$$;

-- Campus boundary / reference point (administrators).
create or replace function public.gis_set_campus_geometry(p_campus_id uuid, p_boundary_geojson jsonb, p_reference_point_geojson jsonb default null)
returns public.campuses
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_boundary geometry := ST_Multi(private.gis_point_from_geojson(p_boundary_geojson));
  v_point geometry := private.gis_point_from_geojson(p_reference_point_geojson);
  v_old public.campuses;
  v_c public.campuses;
begin
  if not private.has_global_permission('gis.manage') then
    perform private.fail('FORBIDDEN', 'You cannot manage campus geometry.', '42501');
  end if;
  if v_boundary is not null and GeometryType(v_boundary) <> 'MULTIPOLYGON' then
    perform private.fail('INVALID_GEOMETRY', 'A campus boundary must be a Polygon or MultiPolygon.');
  end if;
  if not (private.gis_geometry_ok(v_boundary) and private.gis_geometry_ok(v_point)) then
    perform private.fail('INVALID_GEOMETRY', 'Geometry must be valid, EPSG:4326 and in the Philippines.');
  end if;
  select * into v_old from public.campuses where id = p_campus_id for update;
  update public.campuses
     set boundary = v_boundary, reference_point = v_point, updated_by = v_actor,
         verification_status = 'unverified', verified_by = null, verified_at = null
   where id = p_campus_id returning * into v_c;
  insert into public.gis_location_verifications (feature_type, campus_id, action, previous_geometry, new_geometry, actor_id)
  values ('campus', p_campus_id, 'edited', v_old.boundary, v_boundary, v_actor);
  return v_c;
end;
$$;

-- -----------------------------------------------------------------------------
-- Map output, search, routing, analytics
-- -----------------------------------------------------------------------------
-- GeoJSON FeatureCollection of the features the caller may see.
-- p_public_only: used by the backend for signed-out visitors (public layers only).
create or replace function public.gis_map_features(
  p_campus_id uuid, p_layer_codes text[] default null, p_include_unverified boolean default true,
  p_public_only boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = extensions
as $$
  with visible_layers as (
    select l.id, l.code from public.campus_map_layers l
     where l.campus_id = p_campus_id and l.is_active
       and (p_layer_codes is null or l.code = any (p_layer_codes))
       and (case when p_public_only then l.visibility = 'public' else private.can_view_gis(l.visibility, l.id) end)
  ),
  feats as (
    select jsonb_build_object(
             'type', 'Feature',
             'id', 'location:' || x.id,
             'geometry', ST_AsGeoJSON(x.location, 7)::jsonb,
             'properties', jsonb_build_object(
               'kind', 'location', 'id', x.id, 'name', x.name, 'code', x.code, 'description', x.description,
               'category', c.code, 'layer', vl.code, 'building_id', x.building_id, 'floor', x.floor, 'room', x.room,
               'verification_status', x.verification_status,
               'offices', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'name', o.name)), '[]')
                             from public.office_locations ol join public.offices o on o.id = ol.office_id
                            where ol.location_id = x.id),
               'services', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)), '[]')
                              from public.service_locations sl join public.services s on s.id = sl.service_id
                             where sl.location_id = x.id and s.is_active))) as f
      from public.campus_locations x
      left join public.location_categories c on c.id = x.category_id
      left join visible_layers vl on vl.id = x.layer_id
     where x.campus_id = p_campus_id and x.is_active and x.location is not null
       and (x.layer_id is null or vl.id is not null)
       and (p_layer_codes is null or vl.id is not null)
       and (p_include_unverified or x.verification_status = 'verified')
       and x.verification_status not in ('rejected', 'retired')
       and (case when p_public_only then x.visibility = 'public' else private.can_view_gis(x.visibility, null) end)
    union all
    select jsonb_build_object(
             'type', 'Feature', 'id', 'building:' || b.id,
             'geometry', ST_AsGeoJSON(coalesce(bb.boundary, b.entrance_point), 7)::jsonb,
             'properties', jsonb_build_object(
               'kind', 'building', 'id', b.id, 'name', b.name, 'code', b.code, 'floors', b.floors,
               'layer', vl.code,
               'verification_status', case when bb.id is not null then bb.verification_status
                                           else b.verification_status end))
      from public.campus_buildings b
      left join public.campus_building_boundaries bb on bb.building_id = b.id and bb.is_current
      left join visible_layers vl on vl.id = b.layer_id
     where b.campus_id = p_campus_id and b.is_active
       and coalesce(bb.boundary, b.entrance_point) is not null
       and (b.layer_id is null or vl.id is not null)
       and (p_layer_codes is null or vl.id is not null)
       and (p_include_unverified or coalesce(bb.verification_status, b.verification_status) = 'verified')
       and (case when p_public_only then b.visibility = 'public' else private.can_view_gis(b.visibility, null) end)
    union all
    select jsonb_build_object(
             'type', 'Feature', 'id', 'path:' || p.id,
             'geometry', ST_AsGeoJSON(p.path, 7)::jsonb,
             'properties', jsonb_build_object(
               'kind', 'path', 'id', p.id, 'name', p.name, 'length_m', round(p.length_m::numeric, 1),
               'is_accessible', p.is_accessible, 'is_one_way', p.is_one_way, 'surface', p.surface,
               'layer', vl.code, 'verification_status', p.verification_status))
      from public.campus_paths p
      left join visible_layers vl on vl.id = p.layer_id
     where p.campus_id = p_campus_id and p.is_active
       and (p.layer_id is null or vl.id is not null)
       and (p_layer_codes is null or vl.id is not null)
       and (p_include_unverified or p.verification_status = 'verified')
       and p.verification_status not in ('rejected', 'retired')
       and (case when p_public_only then p.visibility = 'public' else private.can_view_gis(p.visibility, null) end)
  )
  select jsonb_build_object('type', 'FeatureCollection',
                            'features', coalesce(jsonb_agg(f), '[]'::jsonb))
    from feats;
$$;

-- Searches locations, buildings, offices and services by name.
create or replace function public.gis_search_locations(
  p_campus_id uuid, p_query text, p_limit integer default 20, p_public_only boolean default false)
returns table (location_id uuid, name text, match_type text, matched_text text, verification_status text,
               has_coordinates boolean, score real)
language sql
stable
security definer
set search_path = extensions
as $$
  with q as (select lower(trim(p_query)) as t)
  select * from (
    select distinct on (l.id) l.id, l.name, m.match_type, m.matched_text, l.verification_status,
           l.location is not null, m.score
      from public.campus_locations l
      cross join q
      cross join lateral (
        select 'location'::text as match_type, l.name as matched_text, similarity(lower(l.name), q.t) as score
        union all
        select 'office', o.name, similarity(lower(o.name), q.t)
          from public.office_locations ol join public.offices o on o.id = ol.office_id
         where ol.location_id = l.id
        union all
        select 'service', s.name, similarity(lower(s.name), q.t)
          from public.service_locations sl join public.services s on s.id = sl.service_id
         where sl.location_id = l.id
        union all
        select 'building', b.name, similarity(lower(b.name), q.t)
          from public.campus_buildings b where b.id = l.building_id
      ) m
     where l.campus_id = p_campus_id and l.is_active
       and l.verification_status not in ('rejected', 'retired')
       and (case when p_public_only then l.visibility = 'public' else private.can_view_gis(l.visibility, l.layer_id) end)
       and (m.score > 0.2 or lower(m.matched_text) like '%' || q.t || '%')
     order by l.id, m.score desc
  ) r
  order by r.score desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Walking route between two VERIFIED locations over VERIFIED paths only.
create or replace function public.gis_find_route(
  p_from_location uuid, p_to_location uuid, p_alternatives integer default 1,
  p_accessible_only boolean default false, p_public_only boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions
as $$
declare
  v_from public.campus_locations;
  v_to public.campus_locations;
  v_from_node bigint;
  v_to_node bigint;
  v_edges text;
  v_routes jsonb;
  v_k integer := greatest(1, least(coalesce(p_alternatives, 1), 3));
begin
  select * into v_from from public.campus_locations where id = p_from_location;
  select * into v_to from public.campus_locations where id = p_to_location;
  if v_from.id is null or v_to.id is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'location_not_found');
  end if;
  if not (case when p_public_only then v_from.visibility = 'public' and v_to.visibility = 'public'
               else private.can_view_gis(v_from.visibility, v_from.layer_id)
                    and private.can_view_gis(v_to.visibility, v_to.layer_id) end) then
    return jsonb_build_object('status', 'unavailable', 'reason', 'location_not_found');
  end if;
  if v_from.verification_status <> 'verified' or v_to.verification_status <> 'verified' then
    return jsonb_build_object('status', 'unavailable', 'reason', 'location_unverified',
      'message', 'Directions are only given between verified locations.');
  end if;
  if not exists (select 1 from public.campus_paths
                  where campus_id = v_from.campus_id and verification_status = 'verified' and is_active) then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_verified_paths',
      'message', 'Walking paths for this campus have not been verified yet.');
  end if;

  -- nearest node of a verified path within 50 m of each location
  select n.id into v_from_node
    from public.campus_path_nodes n
   where n.campus_id = v_from.campus_id
     and exists (select 1 from public.campus_paths p where p.verification_status = 'verified' and p.is_active
                   and n.id in (p.source_node, p.target_node))
     and ST_DWithin(n.node::geography, v_from.location::geography, 50)
   order by n.node::geography <-> v_from.location::geography limit 1;
  select n.id into v_to_node
    from public.campus_path_nodes n
   where n.campus_id = v_to.campus_id
     and exists (select 1 from public.campus_paths p where p.verification_status = 'verified' and p.is_active
                   and n.id in (p.source_node, p.target_node))
     and ST_DWithin(n.node::geography, v_to.location::geography, 50)
   order by n.node::geography <-> v_to.location::geography limit 1;
  if v_from_node is null or v_to_node is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'location_not_connected',
      'message', 'No verified path passes within 50 m of one of the locations.');
  end if;
  if v_from_node = v_to_node then
    return jsonb_build_object('status', 'ok', 'routes', jsonb_build_array(
      jsonb_build_object('distance_m', 0, 'geometry', null, 'path_ids', '[]'::jsonb)));
  end if;

  v_edges := format(
    'select id, source_node as source, target_node as target, length_m as cost, '
    'case when is_one_way then -1 else length_m end as reverse_cost '
    'from public.campus_paths where campus_id = %L and verification_status = ''verified'' and is_active%s',
    v_from.campus_id, case when p_accessible_only then ' and is_accessible is true' else '' end);

  select jsonb_agg(route order by path_id) into v_routes
  from (
    select r.path_id,
           jsonb_build_object(
             'distance_m', round(sum(r.cost)::numeric, 1),
             'estimated_walk_minutes', round((sum(p.length_m) / 75.0)::numeric, 1),
             'path_ids', jsonb_agg(r.edge order by r.path_seq),
             'geometry', ST_AsGeoJSON(ST_LineMerge(ST_Collect(p.path order by r.path_seq)), 7)::jsonb
           ) as route
      from pgr_ksp(v_edges, v_from_node, v_to_node, v_k, directed => true) r
      join public.campus_paths p on p.id = r.edge
     where r.edge > 0
     group by r.path_id
  ) x;

  if v_routes is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_route',
      'message', case when p_accessible_only
                      then 'No verified accessible route connects these locations.'
                      else 'No verified route connects these locations.' end);
  end if;
  return jsonb_build_object('status', 'ok', 'routes', v_routes,
    'note', 'Estimated time assumes about 4.5 km/h walking speed.');
end;
$$;

-- Nearest VERIFIED locations of a service to a point.
create or replace function public.gis_nearest_service_locations(
  p_service_id uuid, p_longitude double precision, p_latitude double precision, p_limit integer default 5)
returns table (location_id uuid, name text, distance_m double precision, is_primary boolean)
language sql
stable
security definer
set search_path = extensions
as $$
  select l.id, l.name,
         ST_Distance(l.location::geography, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography),
         sl.is_primary
    from public.service_locations sl
    join public.campus_locations l on l.id = sl.location_id
   where sl.service_id = p_service_id and l.is_active and l.verification_status = 'verified'
     and private.can_view_gis(l.visibility, l.layer_id)
   order by l.location::geography <-> ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
   limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

-- Aggregated activity per location (heatmaps, distribution). Counts only.
create or replace function public.gis_activity_by_location(
  p_campus_id uuid, p_from timestamptz, p_to timestamptz, p_metric text)
returns table (location_id uuid, name text, longitude double precision, latitude double precision,
               verification_status text, activity_count bigint)
language plpgsql
stable
security definer
set search_path = extensions
as $$
begin
  if p_metric not in ('queue_tickets', 'service_requests', 'receipts', 'payments') then
    perform private.fail('INVALID_METRIC', 'Metric must be queue_tickets, service_requests, receipts or payments.');
  end if;
  if not (private.has_global_permission('reports.view_all') or private.has_permission_anywhere('reports.view')) then
    perform private.fail('FORBIDDEN', 'You cannot view location analytics.', '42501');
  end if;
  return query
  with office_loc as (
    select ol.office_id, ol.location_id from public.office_locations ol where ol.is_primary
  ),
  counts as (
    select ol.location_id, count(*) as n
      from public.queue_tickets t join office_loc ol on ol.office_id = t.office_id
     where p_metric = 'queue_tickets' and t.reserved_at >= p_from and t.reserved_at < p_to
       and (private.has_global_permission('reports.view_all') or private.has_office_permission(t.office_id, 'reports.view'))
     group by ol.location_id
    union all
    select ol.location_id, count(*)
      from public.service_requests r join office_loc ol on ol.office_id = r.office_id
     where p_metric = 'service_requests' and r.submitted_at >= p_from and r.submitted_at < p_to
       and (private.has_global_permission('reports.view_all') or private.has_office_permission(r.office_id, 'reports.view'))
     group by ol.location_id
    union all
    select l.id, count(*)
      from public.receipt_records rr join public.campus_locations l on l.owner_organization_id = rr.organization_id
     where p_metric = 'receipts' and rr.status = 'verified' and rr.verified_at >= p_from and rr.verified_at < p_to
       and private.has_global_permission('reports.view_all')
     group by l.id
    union all
    select l.id, count(*)
      from public.penalty_payments pp join public.campus_locations l on l.owner_organization_id = pp.organization_id
     where p_metric = 'payments' and pp.status = 'paid' and pp.paid_at >= p_from and pp.paid_at < p_to
       and private.has_global_permission('reports.view_all')
     group by l.id
  )
  select l.id, l.name, ST_X(l.location), ST_Y(l.location), l.verification_status, sum(c.n)::bigint
    from counts c join public.campus_locations l on l.id = c.location_id
   where l.campus_id = p_campus_id and l.location is not null
   group by l.id, l.name, l.location, l.verification_status
   order by 6 desc;
end;
$$;

-- GeoJSON import (locations or paths). Imported features start 'unverified'.
-- p_dry_run = true validates and reports without saving.
create or replace function public.gis_import_geojson(
  p_campus_id uuid, p_target text, p_feature_collection jsonb, p_data_source_code text default 'import',
  p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = extensions
as $$
declare
  v_actor uuid := private.require_actor();
  v_feature jsonb;
  v_geom geometry;
  v_ok integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i integer := 0;
  v_source uuid;
begin
  if not private.has_global_permission('gis.manage') then
    perform private.fail('FORBIDDEN', 'You cannot import GIS data.', '42501');
  end if;
  if p_target not in ('locations', 'paths') then
    perform private.fail('INVALID_TARGET', 'Import target must be locations or paths.');
  end if;
  if p_feature_collection ->> 'type' <> 'FeatureCollection' or jsonb_typeof(p_feature_collection -> 'features') <> 'array' then
    perform private.fail('INVALID_GEOJSON', 'Expected a GeoJSON FeatureCollection.');
  end if;
  if jsonb_array_length(p_feature_collection -> 'features') > 2000 then
    perform private.fail('IMPORT_TOO_LARGE', 'Import at most 2000 features at a time.');
  end if;
  select id into v_source from public.gis_data_sources where code = p_data_source_code;
  if v_source is null then
    perform private.fail('SOURCE_NOT_FOUND', 'Unknown GIS data source.');
  end if;

  for v_feature in select * from jsonb_array_elements(p_feature_collection -> 'features') loop
    v_i := v_i + 1;
    begin
      v_geom := ST_SetSRID(ST_GeomFromGeoJSON((v_feature -> 'geometry')::text), 4326);
      if p_target = 'locations' and GeometryType(v_geom) <> 'POINT' then
        raise exception 'expected Point';
      elsif p_target = 'paths' and GeometryType(v_geom) <> 'LINESTRING' then
        raise exception 'expected LineString';
      end if;
      if coalesce(trim(v_feature -> 'properties' ->> 'name'), '') = '' and p_target = 'locations' then
        raise exception 'properties.name is required';
      end if;
      perform private.gis_require_in_campus(p_campus_id, v_geom);
      if not p_dry_run then
        if p_target = 'locations' then
          insert into public.campus_locations (campus_id, name, location, data_source_id, created_by, updated_by,
                                               layer_id)
          values (p_campus_id, v_feature -> 'properties' ->> 'name', v_geom, v_source, v_actor, v_actor,
                  (select id from public.campus_map_layers where campus_id = p_campus_id and code = 'locations'));
        else
          insert into public.campus_paths (campus_id, name, path, data_source_id, created_by, updated_by, layer_id)
          values (p_campus_id, v_feature -> 'properties' ->> 'name', v_geom, v_source, v_actor, v_actor,
                  (select id from public.campus_map_layers where campus_id = p_campus_id and code = 'paths'));
        end if;
      end if;
      v_ok := v_ok + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('feature', v_i, 'error', coalesce(nullif(sqlerrm, ''), 'invalid'));
    end;
  end loop;
  return jsonb_build_object('dry_run', p_dry_run, 'valid', v_ok, 'invalid', jsonb_array_length(v_errors),
                            'errors', v_errors, 'imported_status', 'unverified');
end;
$$;

-- -----------------------------------------------------------------------------
-- Reference data. Confirmed: the institution and campus name. NOT seeded:
-- any coordinate, boundary, building, location or path.
-- -----------------------------------------------------------------------------
insert into public.gis_data_sources (code, name, source_type, license, attribution, notes) values
  ('administrator_entry', 'Entered by a CampusServe administrator', 'administrator_entry', null, null,
   'Must be verified by a different person before it is treated as accurate.'),
  ('field_survey', 'Field survey (GPS / measurement on site)', 'field_survey', null, null, null),
  ('university_records', 'Official university records or plans', 'university_records', null, null, null),
  ('openstreetmap', 'OpenStreetMap', 'openstreetmap', 'ODbL 1.0', '© OpenStreetMap contributors',
   'Data imported from OpenStreetMap must keep this attribution.'),
  ('import', 'GeoJSON import', 'import', null, null, 'Imported features start unverified.');

insert into public.location_categories (code, name, icon, applies_to) values
  ('building', 'Building', 'building', 'building'),
  ('office', 'Office', 'briefcase', 'location'),
  ('service_counter', 'Service counter / window', 'ticket', 'location'),
  ('classroom', 'Classroom', 'school', 'location'),
  ('library', 'Library', 'library', 'location'),
  ('organization_office', 'Organization office', 'users', 'location'),
  ('gate', 'Gate / entrance', 'door-open', 'location'),
  ('landmark', 'Landmark', 'landmark', 'location'),
  ('parking', 'Parking', 'square-parking', 'location'),
  ('restroom', 'Restroom', 'bath', 'location'),
  ('walkway', 'Walkway', 'footprints', 'path');

insert into public.campuses (code, name, municipality, province, verification_status) values
  ('OMSU_MAMBURAO', 'Occidental Mindoro State University – Mamburao Campus', 'Mamburao', 'Occidental Mindoro',
   'unverified');

insert into public.campus_map_layers (campus_id, code, name, layer_type, visibility, display_order)
select c.id, v.code, v.name, v.layer_type, v.visibility, v.ord
  from public.campuses c
  cross join (values
    ('boundaries', 'Campus boundary', 'boundaries', 'public', 10),
    ('buildings',  'Buildings',       'buildings',  'public', 20),
    ('locations',  'Offices and services', 'locations', 'public', 30),
    ('paths',      'Walking paths',   'paths',      'public', 40),
    ('restricted', 'Restricted locations', 'custom', 'restricted', 90)
  ) as v(code, name, layer_type, visibility, ord)
 where c.code = 'OMSU_MAMBURAO';
