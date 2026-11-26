import { z } from 'zod';
import { handler, idParams, optionalText, send, text } from '../../http/http.js';
import { rpc, rpcOne, rpcValue, json } from '../../db/database.js';
import { AppError } from '../../http/errors.js';
import type { ModuleContext } from '../context.js';

const geojson = z.record(z.string(), z.unknown()).refine((g) => typeof g.type === 'string', 'Expected a GeoJSON object');
const visibility = z.enum(['public', 'authenticated', 'restricted']);
const lng = z.coerce.number().min(-180).max(180);
const lat = z.coerce.number().min(-90).max(90);
const layerList = z.string().max(400).optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null));

/**
 * Campus map and wayfinding. Coordinates come only from administrator-entered or imported data; routing uses
 * only verified paths (enforced in gis_find_route). Unverified features are flagged, never presented as fact.
 */
export function gisModule({ deps, authed, publicRouter }: ModuleContext) {
  const { db } = deps;

  const campusOf = async (campusId?: string) => campusId ?? (await db.asService(async (c) =>
    (await c.query(`select id from public.campuses order by created_at limit 1`)).rows[0]?.id as string | undefined));

  // ---- Public map: public layers, verified features only ----------------------------------------
  publicRouter.get('/gis/map', handler({ query: z.object({ campusId: z.uuid().optional(), layers: layerList }) }, async (_req, res, { query }) => {
    const campusId = await campusOf(query.campusId);
    if (!campusId) throw new AppError(404, 'CAMPUS_NOT_FOUND', 'No campus is configured.');
    send(res, await db.asService((c) => rpcValue(c, 'gis_map_features', {
      p_campus_id: campusId, p_layer_codes: query.layers, p_include_unverified: false, p_public_only: true })));
  }));

  publicRouter.get('/gis/search', handler({ query: z.object({ q: text(80), campusId: z.uuid().optional() }) }, async (_req, res, { query }) => {
    const campusId = await campusOf(query.campusId);
    if (!campusId) throw new AppError(404, 'CAMPUS_NOT_FOUND', 'No campus is configured.');
    send(res, await db.asService((c) => rpc(c, 'gis_search_locations', { p_campus_id: campusId, p_query: query.q, p_limit: 10, p_public_only: true })));
  }));

  publicRouter.get('/gis/route', handler({
    query: z.object({ from: z.uuid(), to: z.uuid(), accessible: z.enum(['true', 'false']).default('false') }),
  }, async (_req, res, { query }) => {
    send(res, await db.asService((c) => rpcValue(c, 'gis_find_route', {
      p_from_location: query.from, p_to_location: query.to, p_alternatives: 1, p_accessible_only: query.accessible === 'true', p_public_only: true })));
  }));

  // ---- Signed-in map (RLS decides which restricted layers/features are visible) -----------------
  authed.get('/gis/campuses', handler({}, async (req, res) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select id, code, name, municipality, province, verification_status,
              extensions.st_asgeojson(reference_point)::jsonb as reference_point, extensions.st_asgeojson(boundary)::jsonb as boundary
         from public.campuses order by name`)).rows));
  }));

  authed.get('/gis/layers', handler({ query: z.object({ campusId: z.uuid().optional() }) }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, async (c) => (await c.query(
      `select * from public.campus_map_layers where is_active and ($1::uuid is null or campus_id = $1) order by display_order`, [query.campusId])).rows));
  }));

  authed.get('/gis/map', handler({
    query: z.object({ campusId: z.uuid().optional(), layers: layerList, includeUnverified: z.enum(['true', 'false']).default('true') }),
  }, async (req, res, { query }) => {
    const campusId = await campusOf(query.campusId);
    if (!campusId) throw new AppError(404, 'CAMPUS_NOT_FOUND', 'No campus is configured.');
    send(res, await db.asUser(req.actor!, (c) => rpcValue(c, 'gis_map_features', {
      p_campus_id: campusId, p_layer_codes: query.layers, p_include_unverified: query.includeUnverified === 'true', p_public_only: false })));
  }));

  authed.get('/gis/search', handler({ query: z.object({ q: text(80), campusId: z.uuid().optional() }) }, async (req, res, { query }) => {
    const campusId = await campusOf(query.campusId);
    if (!campusId) throw new AppError(404, 'CAMPUS_NOT_FOUND', 'No campus is configured.');
    send(res, await db.asUser(req.actor!, (c) => rpc(c, 'gis_search_locations', { p_campus_id: campusId, p_query: query.q, p_limit: 20, p_public_only: false })));
  }));

  authed.get('/gis/route', handler({
    query: z.object({ from: z.uuid(), to: z.uuid(), accessible: z.enum(['true', 'false']).default('false'), alternatives: z.coerce.number().int().min(1).max(3).default(1) }),
  }, async (req, res, { query }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcValue(c, 'gis_find_route', {
      p_from_location: query.from, p_to_location: query.to, p_alternatives: query.alternatives, p_accessible_only: query.accessible === 'true', p_public_only: false })));
  }));

  authed.get('/gis/services/:id/nearest', handler({ params: idParams, query: z.object({ lng, lat }) }, async (req, res, { params, query }) => {
    send(res, await db.asUser(req.actor!, (c) => rpc(c, 'gis_nearest_service_locations', {
      p_service_id: params.id, p_longitude: query.lng, p_latitude: query.lat, p_limit: 5 })));
  }));

  authed.get('/gis/activity', handler({
    query: z.object({ campusId: z.uuid().optional(), from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }),
      metric: z.enum(['queue_tickets', 'service_requests', 'receipts', 'payments']).default('queue_tickets') }),
  }, async (req, res, { query }) => {
    const campusId = await campusOf(query.campusId);
    send(res, await db.asUser(req.actor!, (c) => rpc(c, 'gis_activity_by_location', { p_campus_id: campusId, p_from: query.from, p_to: query.to, p_metric: query.metric })));
  }));

  // ---- Management (gis.manage / gis.manage_office_locations / gis.verify checked in the DB) ------
  authed.post('/gis/campuses/:id/geometry', handler({
    params: idParams, body: z.object({ boundary: geojson.optional(), referencePoint: geojson.optional() }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'gis_set_campus_geometry', {
      p_campus_id: params.id, p_boundary_geojson: body.boundary ? json(body.boundary) : undefined, p_reference_point_geojson: body.referencePoint ? json(body.referencePoint) : undefined })));
  }));

  authed.post('/gis/locations', handler({
    body: z.object({
      locationId: z.uuid().optional(), campusId: z.uuid(), name: text(160), point: geojson.optional(), categoryCode: z.string().max(40).optional(),
      buildingId: z.uuid().optional(), floor: optionalText(20), room: optionalText(40), layerCode: z.string().max(40).optional(), visibility: visibility.optional(),
      description: optionalText(1000), officeId: z.uuid().optional(), ownerOrganizationId: z.uuid().optional(), dataSourceCode: z.string().max(40).optional(), code: z.string().max(40).optional(),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'gis_save_location', {
      p_location_id: body.locationId ?? null, p_campus_id: body.campusId, p_name: body.name, p_geojson: body.point ? json(body.point) : undefined,
      p_category_code: body.categoryCode, p_building_id: body.buildingId, p_floor: body.floor, p_room: body.room,
      p_layer_code: body.layerCode, p_visibility: body.visibility, p_description: body.description, p_office_id: body.officeId,
      p_owner_organization_id: body.ownerOrganizationId, p_data_source_code: body.dataSourceCode, p_code: body.code })), 201);
  }));

  authed.post('/gis/buildings', handler({
    body: z.object({
      buildingId: z.uuid().optional(), campusId: z.uuid(), code: z.string().min(1).max(40), name: text(160), floors: z.number().int().min(1).max(50).optional(),
      entrance: geojson.optional(), ownerDepartmentId: z.uuid().optional(), visibility: visibility.default('public'), description: optionalText(1000),
      dataSourceCode: z.string().max(40).default('administrator_entry'),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'gis_save_building', {
      p_building_id: body.buildingId ?? null, p_campus_id: body.campusId, p_code: body.code, p_name: body.name, p_floors: body.floors,
      p_entrance_geojson: body.entrance ? json(body.entrance) : undefined, p_owner_department_id: body.ownerDepartmentId,
      p_visibility: body.visibility, p_description: body.description, p_data_source_code: body.dataSourceCode })), 201);
  }));

  authed.post('/gis/buildings/:id/boundary', handler({
    params: idParams, body: z.object({ polygon: geojson, dataSourceCode: z.string().max(40).optional(), notes: optionalText(1000) }).strict(),
  }, async (req, res, { params, body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'gis_set_building_boundary', {
      p_building_id: params.id, p_geojson: json(body.polygon), p_data_source_code: body.dataSourceCode, p_notes: body.notes })), 201);
  }));

  authed.post('/gis/paths', handler({
    body: z.object({
      pathId: z.number().int().positive().optional(), campusId: z.uuid(), line: geojson, name: optionalText(160), surface: optionalText(40),
      isAccessible: z.boolean().optional(), isOneWay: z.boolean().default(false), isCovered: z.boolean().optional(),
      visibility: visibility.default('public'), dataSourceCode: z.string().max(40).default('administrator_entry'),
    }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcOne(c, 'gis_save_path', {
      p_path_id: body.pathId ?? null, p_campus_id: body.campusId, p_geojson: json(body.line), p_name: body.name, p_surface: body.surface,
      p_is_accessible: body.isAccessible, p_is_one_way: body.isOneWay, p_is_covered: body.isCovered,
      p_visibility: body.visibility, p_data_source_code: body.dataSourceCode })), 201);
  }));

  authed.post('/gis/verify', handler({
    body: z.object({
      featureType: z.enum(['campus', 'building', 'building_boundary', 'location', 'path', 'accessibility']), featureId: z.string().min(1).max(80),
      decision: z.enum(['verified', 'rejected', 'retired']), method: z.string().min(2).max(40), evidence: optionalText(1000), notes: optionalText(1000),
    }).strict(),
  }, async (req, res, { body }) => {
    await db.asUser(req.actor!, (c) => rpc(c, 'gis_verify_feature', {
      p_feature_type: body.featureType, p_feature_id: body.featureId, p_decision: body.decision, p_method: body.method,
      p_evidence: body.evidence, p_notes: body.notes }));
    send(res, { ok: true });
  }));

  authed.post('/gis/import', handler({
    body: z.object({ campusId: z.uuid(), target: z.enum(['locations', 'paths']), featureCollection: geojson,
      dataSourceCode: z.string().max(40).default('import'), dryRun: z.boolean().default(true) }).strict(),
  }, async (req, res, { body }) => {
    send(res, await db.asUser(req.actor!, (c) => rpcValue(c, 'gis_import_geojson', {
      p_campus_id: body.campusId, p_target: body.target, p_feature_collection: json(body.featureCollection),
      p_data_source_code: body.dataSourceCode, p_dry_run: body.dryRun })));
  }));

  authed.post('/gis/services/:id/locations', handler({ params: idParams, body: z.object({ locationId: z.uuid(), isPrimary: z.boolean().default(true) }).strict() }, async (req, res, { params, body }) => {
    await db.asUser(req.actor!, (c) => rpc(c, 'gis_link_service_location', { p_service_id: params.id, p_location_id: body.locationId ?? null, p_is_primary: body.isPrimary }));
    send(res, { ok: true }, 201);
  }));
}
