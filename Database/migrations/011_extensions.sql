-- =============================================================================
-- CampusServe 011: extensions for AI, GIS and automation
--
-- Verified available on the live project before this migration (2026-11-26):
--   vector 0.8.2, postgis 3.3.7, pgrouting 3.4.1, pg_trgm 1.6, pg_cron 1.6.4.
-- Installed in the `extensions` schema (Supabase convention), except pg_cron,
-- which always manages its own `cron` schema.
-- Code relying on these extensions uses only features present in those
-- versions (HNSW indexes, PostGIS 3.3 functions, pgr_dijkstra / pgr_ksp).
-- =============================================================================

create schema if not exists extensions;

create extension if not exists vector    with schema extensions;
create extension if not exists postgis   with schema extensions;
create extension if not exists pgrouting with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists pg_cron;
