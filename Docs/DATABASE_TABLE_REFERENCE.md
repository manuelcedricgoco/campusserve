# CampusServe database table reference

Generated from the database by `Database/tools/generate_table_reference.sh`. Do not edit by hand.

89 tables in schema `public`, all with Row Level Security enabled.

- [academic_assignments](#academic_assignments)
- [academic_years](#academic_years)
- [ai_conversations](#ai_conversations)
- [ai_document_chunks](#ai_document_chunks)
- [ai_embeddings](#ai_embeddings)
- [ai_feedback](#ai_feedback)
- [ai_knowledge_documents](#ai_knowledge_documents)
- [ai_knowledge_sources](#ai_knowledge_sources)
- [ai_messages](#ai_messages)
- [ai_processing_logs](#ai_processing_logs)
- [ai_prompt_templates](#ai_prompt_templates)
- [ai_provider_settings](#ai_provider_settings)
- [ai_usage_logs](#ai_usage_logs)
- [audit_logs](#audit_logs)
- [automation_actions](#automation_actions)
- [automation_error_logs](#automation_error_logs)
- [automation_events](#automation_events)
- [automation_execution_logs](#automation_execution_logs)
- [automation_executions](#automation_executions)
- [automation_rules](#automation_rules)
- [automation_triggers](#automation_triggers)
- [campus_building_boundaries](#campus_building_boundaries)
- [campus_buildings](#campus_buildings)
- [campus_locations](#campus_locations)
- [campus_map_layers](#campus_map_layers)
- [campus_path_nodes](#campus_path_nodes)
- [campus_paths](#campus_paths)
- [campuses](#campuses)
- [clearance_approvals](#clearance_approvals)
- [clearance_history](#clearance_history)
- [clearance_requirement_status](#clearance_requirement_status)
- [clearance_requirements](#clearance_requirements)
- [clearance_steps](#clearance_steps)
- [clearance_templates](#clearance_templates)
- [clubs](#clubs)
- [community_service_records](#community_service_records)
- [departments](#departments)
- [gis_data_sources](#gis_data_sources)
- [gis_location_verifications](#gis_location_verifications)
- [guidance_records](#guidance_records)
- [library_records](#library_records)
- [location_accessibility](#location_accessibility)
- [location_categories](#location_categories)
- [notification_delivery_logs](#notification_delivery_logs)
- [notification_templates](#notification_templates)
- [notifications](#notifications)
- [office_locations](#office_locations)
- [office_staff](#office_staff)
- [offices](#offices)
- [organization_assignments](#organization_assignments)
- [organization_events](#organization_events)
- [organization_members](#organization_members)
- [organizations](#organizations)
- [payment_reconciliation_records](#payment_reconciliation_records)
- [payment_webhook_events](#payment_webhook_events)
- [penalty_assessments](#penalty_assessments)
- [penalty_payments](#penalty_payments)
- [penalty_resolutions](#penalty_resolutions)
- [permissions](#permissions)
- [position_permissions](#position_permissions)
- [positions](#positions)
- [profiles](#profiles)
- [programs](#programs)
- [queue_events](#queue_events)
- [queue_schedules](#queue_schedules)
- [queue_slots](#queue_slots)
- [queue_tickets](#queue_tickets)
- [receipt_obligations](#receipt_obligations)
- [receipt_records](#receipt_records)
- [receipt_verifications](#receipt_verifications)
- [remittance_batch_items](#remittance_batch_items)
- [remittance_batches](#remittance_batches)
- [request_documents](#request_documents)
- [request_status_history](#request_status_history)
- [role_permissions](#role_permissions)
- [scheduled_jobs](#scheduled_jobs)
- [service_locations](#service_locations)
- [service_requests](#service_requests)
- [services](#services)
- [student_clearances](#student_clearances)
- [students](#students)
- [system_settings](#system_settings)
- [user_roles](#user_roles)
- [violation_disputes](#violation_disputes)
- [violation_evidence](#violation_evidence)
- [violation_policies](#violation_policies)
- [violation_policy_versions](#violation_policy_versions)
- [violation_records](#violation_records)
- [violation_reviews](#violation_reviews)


## academic_assignments

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid | yes |  |
| `position_code` | text | yes |  |
| `academic_year_id` | uuid | yes |  |
| `program_id` | uuid |  |  |
| `department_id` | uuid |  |  |
| `is_active` | boolean | yes | true |
| `assigned_by` | uuid |  |  |
| `assigned_at` | timestamp with time zone | yes | now() |
| `revoked_at` | timestamp with time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `academic_assignments_one_scope_chk` CHECK: `CHECK ((num_nonnulls(program_id, department_id) = 1))`
- `academic_assignments_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `academic_assignments_assigned_by_fkey` FOREIGN KEY: `FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `academic_assignments_department_id_fkey` FOREIGN KEY: `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE`
- `academic_assignments_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (position_code) REFERENCES positions(code)`
- `academic_assignments_program_id_fkey` FOREIGN KEY: `FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE`
- `academic_assignments_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `academic_assignments_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE UNIQUE INDEX academic_assignments_unique_idx ON public.academic_assignments USING btree (user_id, position_code, academic_year_id, COALESCE(program_id, department_id))`

**RLS policies**

- `academic_assignments_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('users.manage'::text) AS has_global_permission))`


## academic_years

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `starts_on` | date | yes |  |
| `ends_on` | date | yes |  |
| `is_current` | boolean | yes | false |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `academic_years_code_check` CHECK: `CHECK ((code ~ '^[0-9]{4}-[0-9]{4}$'::text))`
- `academic_years_dates_chk` CHECK: `CHECK ((ends_on > starts_on))`
- `academic_years_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `academic_years_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX academic_years_code_key ON public.academic_years USING btree (code)`
- `CREATE UNIQUE INDEX academic_years_single_current_idx ON public.academic_years USING btree (is_current) WHERE is_current`

**RLS policies**

- `academic_years_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## ai_conversations

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid |  |  |
| `channel` | text | yes |  |
| `public_session_hash` | text |  |  |
| `title` | text |  |  |
| `status` | text | yes | 'active'::text |
| `last_message_at` | timestamp with time zone |  |  |
| `expires_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_conversations_channel_check` CHECK: `CHECK ((channel = ANY (ARRAY['authenticated'::text, 'public'::text])))`
- `ai_conversations_channel_user_chk` CHECK: `CHECK (((channel = 'authenticated'::text) = (user_id IS NOT NULL)))`
- `ai_conversations_public_session_chk` CHECK: `CHECK ((((channel = 'public'::text) = (public_session_hash IS NOT NULL)) AND ((channel <> 'public'::text) OR (expires_at IS NOT NULL))))`
- `ai_conversations_public_session_hash_check` CHECK: `CHECK ((public_session_hash ~ '^[0-9a-f]{64}$'::text))`
- `ai_conversations_status_check` CHECK: `CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text])))`
- `ai_conversations_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `ai_conversations_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX ai_conversations_public_idx ON public.ai_conversations USING btree (public_session_hash) WHERE (channel = 'public'::text)`
- `CREATE INDEX ai_conversations_user_idx ON public.ai_conversations USING btree (user_id, last_message_at DESC)`

**RLS policies**

- `ai_conversations_read_own` (SELECT): `(user_id = ( SELECT auth.uid() AS uid))`


## ai_document_chunks

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `document_id` | uuid | yes |  |
| `chunk_index` | integer | yes |  |
| `heading` | text |  |  |
| `content` | text | yes |  |
| `token_count` | integer |  |  |
| `page_from` | integer |  |  |
| `page_to` | integer |  |  |
| `search_tsv` | tsvector |  | to_tsvector('simple'::regconfig, ((COALESCE(heading, ''::text) \|\| ' '::text) \|\| content)) |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_document_chunks_chunk_index_check` CHECK: `CHECK ((chunk_index >= 0))`
- `ai_document_chunks_content_check` CHECK: `CHECK ((length(TRIM(BOTH FROM content)) > 0))`
- `ai_document_chunks_page_from_check` CHECK: `CHECK ((page_from > 0))`
- `ai_document_chunks_page_to_check` CHECK: `CHECK ((page_to > 0))`
- `ai_document_chunks_token_count_check` CHECK: `CHECK ((token_count >= 0))`
- `ai_document_chunks_document_id_fkey` FOREIGN KEY: `FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE`
- `ai_document_chunks_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_document_chunks_document_id_chunk_index_key` UNIQUE: `UNIQUE (document_id, chunk_index)`

**Indexes**

- `CREATE UNIQUE INDEX ai_document_chunks_document_id_chunk_index_key ON public.ai_document_chunks USING btree (document_id, chunk_index)`
- `CREATE INDEX ai_document_chunks_trgm_idx ON public.ai_document_chunks USING gin (content extensions.gin_trgm_ops)`
- `CREATE INDEX ai_document_chunks_tsv_idx ON public.ai_document_chunks USING gin (search_tsv)`

**RLS policies**

- `ai_document_chunks_read` (SELECT): `(EXISTS ( SELECT 1
   FROM ai_knowledge_documents d
  WHERE (d.id = ai_document_chunks.document_id)))`


## ai_embeddings

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `chunk_id` | uuid | yes |  |
| `provider_setting_id` | uuid | yes |  |
| `model` | text | yes |  |
| `dimensions` | integer | yes |  |
| `embedding` | extensions.vector | yes |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_embeddings_dimensions_check` CHECK: `CHECK (((dimensions >= 1) AND (dimensions <= 4000)))`
- `ai_embeddings_dims_chk` CHECK: `CHECK ((extensions.vector_dims(embedding) = dimensions))`
- `ai_embeddings_chunk_id_fkey` FOREIGN KEY: `FOREIGN KEY (chunk_id) REFERENCES ai_document_chunks(id) ON DELETE CASCADE`
- `ai_embeddings_provider_setting_id_fkey` FOREIGN KEY: `FOREIGN KEY (provider_setting_id) REFERENCES ai_provider_settings(id)`
- `ai_embeddings_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_embeddings_chunk_id_provider_setting_id_key` UNIQUE: `UNIQUE (chunk_id, provider_setting_id)`

**Indexes**

- `CREATE UNIQUE INDEX ai_embeddings_chunk_id_provider_setting_id_key ON public.ai_embeddings USING btree (chunk_id, provider_setting_id)`
- `CREATE INDEX ai_embeddings_setting_idx ON public.ai_embeddings USING btree (provider_setting_id)`

**RLS policies**

- `ai_embeddings_read` (SELECT): `( SELECT private.has_global_permission('ai.manage_knowledge'::text) AS has_global_permission)`


## ai_feedback

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `message_id` | uuid | yes |  |
| `user_id` | uuid | yes |  |
| `rating` | smallint | yes |  |
| `reason` | text |  |  |
| `comment` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_feedback_comment_check` CHECK: `CHECK ((length(comment) <= 2000))`
- `ai_feedback_rating_check` CHECK: `CHECK ((rating = ANY (ARRAY['-1'::integer, 1])))`
- `ai_feedback_reason_check` CHECK: `CHECK ((reason = ANY (ARRAY['inaccurate'::text, 'not_helpful'::text, 'unsafe'::text, 'outdated'::text, 'missing_source'::text, 'other'::text])))`
- `ai_feedback_message_id_fkey` FOREIGN KEY: `FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE`
- `ai_feedback_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `ai_feedback_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_feedback_message_id_user_id_key` UNIQUE: `UNIQUE (message_id, user_id)`

**Indexes**

- `CREATE UNIQUE INDEX ai_feedback_message_id_user_id_key ON public.ai_feedback USING btree (message_id, user_id)`

**RLS policies**

- `ai_feedback_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('ai.view_usage'::text) AS has_global_permission))`


## ai_knowledge_documents

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `source_id` | uuid | yes |  |
| `lineage_id` | uuid | yes | gen_random_uuid() |
| `version` | integer | yes | 1 |
| `supersedes_id` | uuid |  |  |
| `title` | text | yes |  |
| `origin` | text | yes |  |
| `storage_bucket` | text | yes | 'ai-knowledge'::text |
| `storage_path` | text |  |  |
| `source_url` | text |  |  |
| `mime_type` | text |  |  |
| `size_bytes` | integer |  |  |
| `checksum_sha256` | text |  |  |
| `language` | text | yes | 'en'::text |
| `processing_status` | text | yes | 'uploaded'::text |
| `processing_error` | text |  |  |
| `is_current` | boolean | yes | true |
| `effective_from` | date |  |  |
| `uploaded_by` | uuid | yes |  |
| `processed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_documents_failed_error_chk` CHECK: `CHECK (((processing_status <> 'failed'::text) OR (processing_error IS NOT NULL)))`
- `ai_documents_origin_chk` CHECK: `CHECK ((((origin = 'upload'::text) AND (storage_path IS NOT NULL) AND (mime_type IS NOT NULL)) OR ((origin = 'url'::text) AND (source_url IS NOT NULL)) OR (origin = 'manual'::text)))`
- `ai_knowledge_documents_checksum_sha256_check` CHECK: `CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text))`
- `ai_knowledge_documents_mime_type_check` CHECK: `CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'text/plain'::text, 'text/markdown'::text, 'text/html'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text])))`
- `ai_knowledge_documents_origin_check` CHECK: `CHECK ((origin = ANY (ARRAY['upload'::text, 'manual'::text, 'url'::text])))`
- `ai_knowledge_documents_processing_status_check` CHECK: `CHECK ((processing_status = ANY (ARRAY['uploaded'::text, 'extracting'::text, 'chunking'::text, 'embedding'::text, 'ready'::text, 'failed'::text])))`
- `ai_knowledge_documents_size_bytes_check` CHECK: `CHECK (((size_bytes > 0) AND (size_bytes <= 20971520)))`
- `ai_knowledge_documents_title_check` CHECK: `CHECK ((length(TRIM(BOTH FROM title)) > 0))`
- `ai_knowledge_documents_version_check` CHECK: `CHECK ((version > 0))`
- `ai_knowledge_documents_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (source_id) REFERENCES ai_knowledge_sources(id)`
- `ai_knowledge_documents_supersedes_id_fkey` FOREIGN KEY: `FOREIGN KEY (supersedes_id) REFERENCES ai_knowledge_documents(id)`
- `ai_knowledge_documents_uploaded_by_fkey` FOREIGN KEY: `FOREIGN KEY (uploaded_by) REFERENCES profiles(id)`
- `ai_knowledge_documents_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_knowledge_documents_lineage_id_version_key` UNIQUE: `UNIQUE (lineage_id, version)`
- `ai_knowledge_documents_storage_path_key` UNIQUE: `UNIQUE (storage_path)`

**Indexes**

- `CREATE UNIQUE INDEX ai_knowledge_documents_lineage_id_version_key ON public.ai_knowledge_documents USING btree (lineage_id, version)`
- `CREATE UNIQUE INDEX ai_knowledge_documents_one_current_idx ON public.ai_knowledge_documents USING btree (lineage_id) WHERE is_current`
- `CREATE INDEX ai_knowledge_documents_source_idx ON public.ai_knowledge_documents USING btree (source_id, processing_status)`
- `CREATE UNIQUE INDEX ai_knowledge_documents_storage_path_key ON public.ai_knowledge_documents USING btree (storage_path)`

**RLS policies**

- `ai_knowledge_documents_read` (SELECT): `(private.can_manage_knowledge_source(source_id) OR (is_current AND (processing_status = 'ready'::text) AND private.can_access_knowledge_source(source_id)))`


## ai_knowledge_sources

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `name` | text | yes |  |
| `description` | text |  |  |
| `source_type` | text | yes |  |
| `is_official` | boolean | yes | false |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `owner_office_id` | uuid |  |  |
| `owner_organization_id` | uuid |  |  |
| `visibility` | text | yes | 'authenticated'::text |
| `required_permission` | text |  |  |
| `status` | text | yes | 'active'::text |
| `created_by` | uuid | yes |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_knowledge_sources_source_type_check` CHECK: `CHECK ((source_type = ANY (ARRAY['official_policy'::text, 'office_guide'::text, 'faq'::text, 'announcement'::text, 'general'::text])))`
- `ai_knowledge_sources_status_check` CHECK: `CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))`
- `ai_knowledge_sources_visibility_check` CHECK: `CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'permission'::text])))`
- `ai_sources_official_approved_chk` CHECK: `CHECK (((NOT is_official) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL) AND (approved_by <> created_by))))`
- `ai_sources_one_owner_chk` CHECK: `CHECK ((num_nonnulls(owner_office_id, owner_organization_id) <= 1))`
- `ai_sources_permission_chk` CHECK: `CHECK (((visibility = 'permission'::text) = (required_permission IS NOT NULL)))`
- `ai_knowledge_sources_approved_by_fkey` FOREIGN KEY: `FOREIGN KEY (approved_by) REFERENCES profiles(id)`
- `ai_knowledge_sources_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `ai_knowledge_sources_owner_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (owner_office_id) REFERENCES offices(id) ON DELETE SET NULL`
- `ai_knowledge_sources_owner_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (owner_organization_id) REFERENCES organizations(id) ON DELETE SET NULL`
- `ai_knowledge_sources_required_permission_fkey` FOREIGN KEY: `FOREIGN KEY (required_permission) REFERENCES permissions(code)`
- `ai_knowledge_sources_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX ai_knowledge_sources_office_idx ON public.ai_knowledge_sources USING btree (owner_office_id)`
- `CREATE INDEX ai_knowledge_sources_org_idx ON public.ai_knowledge_sources USING btree (owner_organization_id)`

**RLS policies**

- `ai_knowledge_sources_read` (SELECT): `private.can_access_knowledge_source(id)`


## ai_messages

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `conversation_id` | uuid | yes |  |
| `role` | text | yes |  |
| `content` | text | yes |  |
| `citations` | jsonb | yes | '[]'::jsonb |
| `provider` | text |  |  |
| `model` | text |  |  |
| `prompt_template_id` | uuid |  |  |
| `input_tokens` | integer |  |  |
| `output_tokens` | integer |  |  |
| `latency_ms` | integer |  |  |
| `error_code` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_messages_citations_check` CHECK: `CHECK ((jsonb_typeof(citations) = 'array'::text))`
- `ai_messages_input_tokens_check` CHECK: `CHECK ((input_tokens >= 0))`
- `ai_messages_latency_ms_check` CHECK: `CHECK ((latency_ms >= 0))`
- `ai_messages_output_tokens_check` CHECK: `CHECK ((output_tokens >= 0))`
- `ai_messages_role_check` CHECK: `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])))`
- `ai_messages_conversation_id_fkey` FOREIGN KEY: `FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE`
- `ai_messages_prompt_template_id_fkey` FOREIGN KEY: `FOREIGN KEY (prompt_template_id) REFERENCES ai_prompt_templates(id)`
- `ai_messages_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX ai_messages_conversation_idx ON public.ai_messages USING btree (conversation_id, created_at)`

**RLS policies**

- `ai_messages_read_own` (SELECT): `(EXISTS ( SELECT 1
   FROM ai_conversations c
  WHERE (c.id = ai_messages.conversation_id)))`


## ai_processing_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `document_id` | uuid | yes |  |
| `stage` | text | yes |  |
| `status` | text | yes |  |
| `duration_ms` | integer |  |  |
| `details` | jsonb | yes | '{}'::jsonb |
| `error_message` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_processing_failed_error_chk` CHECK: `CHECK (((status <> 'failed'::text) OR (error_message IS NOT NULL)))`
- `ai_processing_logs_duration_ms_check` CHECK: `CHECK ((duration_ms >= 0))`
- `ai_processing_logs_stage_check` CHECK: `CHECK ((stage = ANY (ARRAY['upload'::text, 'extraction'::text, 'chunking'::text, 'embedding'::text, 'indexing'::text])))`
- `ai_processing_logs_status_check` CHECK: `CHECK ((status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text])))`
- `ai_processing_logs_document_id_fkey` FOREIGN KEY: `FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE`
- `ai_processing_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX ai_processing_logs_document_idx ON public.ai_processing_logs USING btree (document_id, created_at)`

**RLS policies**

- `ai_processing_logs_read` (SELECT): `(EXISTS ( SELECT 1
   FROM ai_knowledge_documents d
  WHERE ((d.id = ai_processing_logs.document_id) AND private.can_manage_knowledge_source(d.source_id))))`


## ai_prompt_templates

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `version` | integer | yes |  |
| `purpose` | text | yes |  |
| `body` | text | yes |  |
| `is_active` | boolean | yes | false |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_prompt_templates_body_check` CHECK: `CHECK ((length(TRIM(BOTH FROM body)) > 0))`
- `ai_prompt_templates_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `ai_prompt_templates_purpose_check` CHECK: `CHECK ((purpose = ANY (ARRAY['assistant'::text, 'public_assistant'::text, 'classification'::text, 'summarization'::text, 'analytics'::text, 'admin_assistant'::text, 'queue_insights'::text])))`
- `ai_prompt_templates_version_check` CHECK: `CHECK ((version > 0))`
- `ai_prompt_templates_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `ai_prompt_templates_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_prompt_templates_code_version_key` UNIQUE: `UNIQUE (code, version)`

**Indexes**

- `CREATE UNIQUE INDEX ai_prompt_templates_code_version_key ON public.ai_prompt_templates USING btree (code, version)`
- `CREATE UNIQUE INDEX ai_prompt_templates_one_active_idx ON public.ai_prompt_templates USING btree (code) WHERE is_active`

**RLS policies**

- `ai_prompt_templates_read` (SELECT): `( SELECT private.has_global_permission('ai.manage_providers'::text) AS has_global_permission)`


## ai_provider_settings

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `provider` | text | yes |  |
| `purpose` | text | yes |  |
| `model` | text | yes |  |
| `embedding_dimensions` | integer |  |  |
| `is_enabled` | boolean | yes | false |
| `is_default` | boolean | yes | false |
| `max_requests_per_user_per_day` | integer | yes | 50 |
| `max_input_tokens` | integer | yes | 8000 |
| `max_output_tokens` | integer | yes | 1000 |
| `timeout_ms` | integer | yes | 30000 |
| `temperature` | numeric(3,2) | yes | 0.20 |
| `secret_ref` | text |  |  |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_provider_default_enabled_chk` CHECK: `CHECK (((NOT is_default) OR is_enabled))`
- `ai_provider_embedding_dims_chk` CHECK: `CHECK (((purpose = 'embedding'::text) = (embedding_dimensions IS NOT NULL)))`
- `ai_provider_mock_no_secret_chk` CHECK: `CHECK (((provider <> 'mock'::text) OR (secret_ref IS NULL)))`
- `ai_provider_real_needs_secret_chk` CHECK: `CHECK (((provider = ANY (ARRAY['mock'::text, 'ollama'::text])) OR (secret_ref IS NOT NULL)))`
- `ai_provider_settings_embedding_dimensions_check` CHECK: `CHECK (((embedding_dimensions >= 1) AND (embedding_dimensions <= 4000)))`
- `ai_provider_settings_max_input_tokens_check` CHECK: `CHECK ((max_input_tokens > 0))`
- `ai_provider_settings_max_output_tokens_check` CHECK: `CHECK ((max_output_tokens > 0))`
- `ai_provider_settings_max_requests_per_user_per_day_check` CHECK: `CHECK ((max_requests_per_user_per_day > 0))`
- `ai_provider_settings_model_check` CHECK: `CHECK ((length(TRIM(BOTH FROM model)) > 0))`
- `ai_provider_settings_provider_check` CHECK: `CHECK ((provider = ANY (ARRAY['mock'::text, 'openai'::text, 'anthropic'::text, 'google'::text, 'azure_openai'::text, 'ollama'::text, 'other'::text])))`
- `ai_provider_settings_purpose_check` CHECK: `CHECK ((purpose = ANY (ARRAY['chat'::text, 'embedding'::text, 'classification'::text, 'summarization'::text])))`
- `ai_provider_settings_secret_ref_check` CHECK: `CHECK ((secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'::text))`
- `ai_provider_settings_temperature_check` CHECK: `CHECK (((temperature >= (0)::numeric) AND (temperature <= (2)::numeric)))`
- `ai_provider_settings_timeout_ms_check` CHECK: `CHECK (((timeout_ms >= 1000) AND (timeout_ms <= 300000)))`
- `ai_provider_settings_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `ai_provider_settings_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `ai_provider_settings_provider_purpose_model_key` UNIQUE: `UNIQUE (provider, purpose, model)`

**Indexes**

- `CREATE UNIQUE INDEX ai_provider_settings_one_default_idx ON public.ai_provider_settings USING btree (purpose) WHERE is_default`
- `CREATE UNIQUE INDEX ai_provider_settings_provider_purpose_model_key ON public.ai_provider_settings USING btree (provider, purpose, model)`

**RLS policies**

- `ai_provider_settings_read` (SELECT): `(( SELECT private.has_global_permission('ai.manage_providers'::text) AS has_global_permission) OR ( SELECT private.has_global_permission('ai.view_usage'::text) AS has_global_permission))`


## ai_usage_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `user_id` | uuid |  |  |
| `conversation_id` | uuid |  |  |
| `channel` | text | yes | 'authenticated'::text |
| `feature` | text | yes |  |
| `provider` | text |  |  |
| `model` | text |  |  |
| `input_tokens` | integer |  |  |
| `output_tokens` | integer |  |  |
| `latency_ms` | integer |  |  |
| `status` | text | yes |  |
| `error_code` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `ai_usage_logs_channel_check` CHECK: `CHECK ((channel = ANY (ARRAY['authenticated'::text, 'public'::text, 'system'::text])))`
- `ai_usage_logs_feature_check` CHECK: `CHECK ((feature = ANY (ARRAY['assistant'::text, 'search'::text, 'classification'::text, 'document_processing'::text, 'summarization'::text, 'analytics'::text, 'queue_insights'::text, 'admin_assistant'::text, 'embedding'::text])))`
- `ai_usage_logs_input_tokens_check` CHECK: `CHECK ((input_tokens >= 0))`
- `ai_usage_logs_latency_ms_check` CHECK: `CHECK ((latency_ms >= 0))`
- `ai_usage_logs_output_tokens_check` CHECK: `CHECK ((output_tokens >= 0))`
- `ai_usage_logs_status_check` CHECK: `CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'rate_limited'::text, 'refused'::text])))`
- `ai_usage_logs_conversation_id_fkey` FOREIGN KEY: `FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL`
- `ai_usage_logs_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL`
- `ai_usage_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX ai_usage_logs_created_idx ON public.ai_usage_logs USING btree (created_at DESC)`
- `CREATE INDEX ai_usage_logs_user_idx ON public.ai_usage_logs USING btree (user_id, created_at DESC)`

**RLS policies**

- `ai_usage_logs_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('ai.view_usage'::text) AS has_global_permission))`


## audit_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `occurred_at` | timestamp with time zone | yes | now() |
| `actor_id` | uuid |  |  |
| `action` | text | yes |  |
| `entity_type` | text | yes |  |
| `entity_id` | text |  |  |
| `old_data` | jsonb |  |  |
| `new_data` | jsonb |  |  |
| `context` | jsonb | yes | '{}'::jsonb |

**Constraints**

- `audit_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX audit_logs_actor_idx ON public.audit_logs USING btree (actor_id, occurred_at DESC)`
- `CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id)`
- `CREATE INDEX audit_logs_occurred_idx ON public.audit_logs USING btree (occurred_at DESC)`

**RLS policies**

- `audit_logs_read` (SELECT): `( SELECT private.has_global_permission('audit.view'::text) AS has_global_permission)`


## automation_actions

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `rule_id` | uuid | yes |  |
| `step_order` | integer | yes |  |
| `action_type` | text | yes |  |
| `parameters` | jsonb | yes | '{}'::jsonb |
| `is_enabled` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_actions_action_type_check` CHECK: `CHECK ((action_type = ANY (ARRAY['send_notification'::text, 'send_reminder'::text, 'escalate_to_position'::text, 'reevaluate_clearance'::text, 'generate_report'::text, 'send_email'::text, 'record_note'::text])))`
- `automation_actions_parameters_check` CHECK: `CHECK ((jsonb_typeof(parameters) = 'object'::text))`
- `automation_actions_step_order_check` CHECK: `CHECK ((step_order > 0))`
- `automation_actions_rule_id_fkey` FOREIGN KEY: `FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE`
- `automation_actions_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `automation_actions_rule_id_step_order_key` UNIQUE: `UNIQUE (rule_id, step_order)`

**Indexes**

- `CREATE UNIQUE INDEX automation_actions_rule_id_step_order_key ON public.automation_actions USING btree (rule_id, step_order)`

**RLS policies**

- `automation_actions_read` (SELECT): `(EXISTS ( SELECT 1
   FROM automation_rules r
  WHERE (r.id = automation_actions.rule_id)))`


## automation_error_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `source` | text | yes |  |
| `execution_id` | bigint |  |  |
| `event_id` | bigint |  |  |
| `scheduled_job_id` | uuid |  |  |
| `error_code` | text |  |  |
| `error_message` | text | yes |  |
| `details` | jsonb | yes | '{}'::jsonb |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_error_logs_source_check` CHECK: `CHECK ((source = ANY (ARRAY['event_capture'::text, 'matcher'::text, 'executor'::text, 'scheduler'::text, 'backend_worker'::text, 'delivery'::text])))`
- `automation_error_logs_event_id_fkey` FOREIGN KEY: `FOREIGN KEY (event_id) REFERENCES automation_events(id) ON DELETE SET NULL`
- `automation_error_logs_execution_id_fkey` FOREIGN KEY: `FOREIGN KEY (execution_id) REFERENCES automation_executions(id) ON DELETE SET NULL`
- `automation_error_logs_scheduled_job_id_fkey` FOREIGN KEY: `FOREIGN KEY (scheduled_job_id) REFERENCES scheduled_jobs(id) ON DELETE SET NULL`
- `automation_error_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX automation_error_logs_created_idx ON public.automation_error_logs USING btree (created_at DESC)`

**RLS policies**

- `automation_error_logs_read` (SELECT): `( SELECT private.has_global_permission('automation.manage'::text) AS has_global_permission)`


## automation_events

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `event_type` | text | yes |  |
| `entity_table` | text |  |  |
| `entity_id` | text |  |  |
| `organization_id` | uuid |  |  |
| `office_id` | uuid |  |  |
| `actor_id` | uuid |  |  |
| `payload` | jsonb | yes | '{}'::jsonb |
| `idempotency_key` | text | yes |  |
| `status` | text | yes | 'pending'::text |
| `occurred_at` | timestamp with time zone | yes | now() |
| `processed_at` | timestamp with time zone |  |  |

**Constraints**

- `automation_events_status_check` CHECK: `CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'ignored'::text, 'failed'::text])))`
- `automation_events_event_type_fkey` FOREIGN KEY: `FOREIGN KEY (event_type) REFERENCES automation_triggers(code)`
- `automation_events_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL`
- `automation_events_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL`
- `automation_events_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `automation_events_idempotency_key_key` UNIQUE: `UNIQUE (idempotency_key)`

**Indexes**

- `CREATE UNIQUE INDEX automation_events_idempotency_key_key ON public.automation_events USING btree (idempotency_key)`
- `CREATE INDEX automation_events_type_idx ON public.automation_events USING btree (event_type, occurred_at DESC)`

**RLS policies**

- `automation_events_read` (SELECT): `(( SELECT private.has_global_permission('automation.view'::text) AS has_global_permission) OR ((organization_id IS NOT NULL) AND private.has_org_permission(organization_id, 'automation.view'::text)) OR ((office_id IS NOT NULL) AND private.has_office_permission(office_id, 'automation.view'::text)))`


## automation_execution_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `execution_id` | bigint | yes |  |
| `step_order` | integer |  |  |
| `action_type` | text |  |  |
| `status` | text | yes |  |
| `message` | text |  |  |
| `details` | jsonb | yes | '{}'::jsonb |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_execution_logs_status_check` CHECK: `CHECK ((status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])))`
- `automation_execution_logs_execution_id_fkey` FOREIGN KEY: `FOREIGN KEY (execution_id) REFERENCES automation_executions(id) ON DELETE CASCADE`
- `automation_execution_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX automation_execution_logs_execution_idx ON public.automation_execution_logs USING btree (execution_id, id)`

**RLS policies**

- `automation_execution_logs_read` (SELECT): `(EXISTS ( SELECT 1
   FROM automation_executions x
  WHERE (x.id = automation_execution_logs.execution_id)))`


## automation_executions

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `rule_id` | uuid | yes |  |
| `rule_version` | integer | yes |  |
| `event_id` | bigint | yes |  |
| `organization_id` | uuid |  |  |
| `office_id` | uuid |  |  |
| `executor` | text | yes | 'database'::text |
| `idempotency_key` | text | yes |  |
| `status` | text | yes | 'queued'::text |
| `attempts` | integer | yes | 0 |
| `max_attempts` | integer | yes | 3 |
| `next_attempt_at` | timestamp with time zone | yes | now() |
| `locked_at` | timestamp with time zone |  |  |
| `locked_by` | text |  |  |
| `started_at` | timestamp with time zone |  |  |
| `finished_at` | timestamp with time zone |  |  |
| `last_error` | text |  |  |
| `result` | jsonb |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_executions_attempts_check` CHECK: `CHECK ((attempts >= 0))`
- `automation_executions_executor_check` CHECK: `CHECK ((executor = ANY (ARRAY['database'::text, 'backend'::text])))`
- `automation_executions_max_attempts_check` CHECK: `CHECK (((max_attempts >= 1) AND (max_attempts <= 10)))`
- `automation_executions_status_check` CHECK: `CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'dead'::text, 'skipped'::text])))`
- `automation_executions_event_id_fkey` FOREIGN KEY: `FOREIGN KEY (event_id) REFERENCES automation_events(id) ON DELETE CASCADE`
- `automation_executions_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL`
- `automation_executions_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL`
- `automation_executions_rule_id_fkey` FOREIGN KEY: `FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE`
- `automation_executions_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `automation_executions_idempotency_key_key` UNIQUE: `UNIQUE (idempotency_key)`

**Indexes**

- `CREATE INDEX automation_executions_due_idx ON public.automation_executions USING btree (executor, next_attempt_at) WHERE (status = 'queued'::text)`
- `CREATE UNIQUE INDEX automation_executions_idempotency_key_key ON public.automation_executions USING btree (idempotency_key)`
- `CREATE INDEX automation_executions_rule_idx ON public.automation_executions USING btree (rule_id, created_at DESC)`

**RLS policies**

- `automation_executions_read` (SELECT): `(( SELECT private.has_global_permission('automation.view'::text) AS has_global_permission) OR ((organization_id IS NOT NULL) AND private.has_org_permission(organization_id, 'automation.view'::text)) OR ((office_id IS NOT NULL) AND private.has_office_permission(office_id, 'automation.view'::text)))`


## automation_rules

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `trigger_code` | text | yes |  |
| `conditions` | jsonb | yes | '[]'::jsonb |
| `organization_id` | uuid |  |  |
| `office_id` | uuid |  |  |
| `is_enabled` | boolean | yes | false |
| `version` | integer | yes | 1 |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_rules_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `automation_rules_conditions_check` CHECK: `CHECK ((jsonb_typeof(conditions) = 'array'::text))`
- `automation_rules_one_scope_chk` CHECK: `CHECK ((num_nonnulls(organization_id, office_id) <= 1))`
- `automation_rules_version_check` CHECK: `CHECK ((version > 0))`
- `automation_rules_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `automation_rules_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE`
- `automation_rules_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `automation_rules_trigger_code_fkey` FOREIGN KEY: `FOREIGN KEY (trigger_code) REFERENCES automation_triggers(code)`
- `automation_rules_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `automation_rules_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `automation_rules_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX automation_rules_code_key ON public.automation_rules USING btree (code)`
- `CREATE INDEX automation_rules_trigger_idx ON public.automation_rules USING btree (trigger_code) WHERE is_enabled`

**RLS policies**

- `automation_rules_read` (SELECT): `(( SELECT private.has_global_permission('automation.view'::text) AS has_global_permission) OR ((organization_id IS NOT NULL) AND private.has_org_permission(organization_id, 'automation.view'::text)) OR ((office_id IS NOT NULL) AND private.has_office_permission(office_id, 'automation.view'::text)))`


## automation_triggers

| Column | Type | Not null | Default |
|---|---|---|---|
| `code` | text | yes |  |
| `description` | text | yes |  |
| `source_table` | text |  |  |
| `payload_fields` | text[] | yes | '{}'::text[] |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `automation_triggers_code_check` CHECK: `CHECK ((code ~ '^[a-z_]+\.[a-z_]+$'::text))`
- `automation_triggers_pkey` PRIMARY KEY: `PRIMARY KEY (code)`

**RLS policies**

- `automation_triggers_read` (SELECT): `( SELECT private.has_permission_anywhere('automation.view'::text) AS has_permission_anywhere)`


## campus_building_boundaries

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `building_id` | uuid | yes |  |
| `version` | integer | yes |  |
| `boundary` | extensions.geometry(MultiPolygon,4326) | yes |  |
| `is_current` | boolean | yes | true |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `data_source_id` | uuid |  |  |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_building_boundaries_geometry_ok_chk` CHECK: `CHECK (private.gis_geometry_ok(boundary))`
- `campus_building_boundaries_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `campus_building_boundaries_version_check` CHECK: `CHECK ((version > 0))`
- `campus_building_boundaries_building_id_fkey` FOREIGN KEY: `FOREIGN KEY (building_id) REFERENCES campus_buildings(id) ON DELETE CASCADE`
- `campus_building_boundaries_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `campus_building_boundaries_data_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (data_source_id) REFERENCES gis_data_sources(id)`
- `campus_building_boundaries_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `campus_building_boundaries_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `campus_building_boundaries_building_id_version_key` UNIQUE: `UNIQUE (building_id, version)`

**Indexes**

- `CREATE UNIQUE INDEX campus_building_boundaries_building_id_version_key ON public.campus_building_boundaries USING btree (building_id, version)`
- `CREATE INDEX campus_building_boundaries_gix ON public.campus_building_boundaries USING gist (boundary)`
- `CREATE UNIQUE INDEX campus_building_boundaries_one_current_idx ON public.campus_building_boundaries USING btree (building_id) WHERE is_current`

**RLS policies**

- `campus_building_boundaries_read` (SELECT): `(EXISTS ( SELECT 1
   FROM campus_buildings b
  WHERE (b.id = campus_building_boundaries.building_id)))`


## campus_buildings

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `campus_id` | uuid | yes |  |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `floors` | smallint |  |  |
| `owner_department_id` | uuid |  |  |
| `category_id` | uuid |  |  |
| `layer_id` | uuid |  |  |
| `visibility` | text | yes | 'public'::text |
| `entrance_point` | extensions.geometry(Point,4326) |  |  |
| `is_active` | boolean | yes | true |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `data_source_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_buildings_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `campus_buildings_floors_check` CHECK: `CHECK (((floors >= 1) AND (floors <= 50)))`
- `campus_buildings_geometry_ok_chk` CHECK: `CHECK (private.gis_geometry_ok(entrance_point))`
- `campus_buildings_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `campus_buildings_visibility_check` CHECK: `CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'restricted'::text])))`
- `campus_buildings_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `campus_buildings_category_id_fkey` FOREIGN KEY: `FOREIGN KEY (category_id) REFERENCES location_categories(id)`
- `campus_buildings_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `campus_buildings_data_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (data_source_id) REFERENCES gis_data_sources(id)`
- `campus_buildings_layer_id_fkey` FOREIGN KEY: `FOREIGN KEY (layer_id) REFERENCES campus_map_layers(id) ON DELETE SET NULL`
- `campus_buildings_owner_department_id_fkey` FOREIGN KEY: `FOREIGN KEY (owner_department_id) REFERENCES departments(id) ON DELETE SET NULL`
- `campus_buildings_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id)`
- `campus_buildings_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `campus_buildings_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `campus_buildings_campus_id_code_key` UNIQUE: `UNIQUE (campus_id, code)`

**Indexes**

- `CREATE UNIQUE INDEX campus_buildings_campus_id_code_key ON public.campus_buildings USING btree (campus_id, code)`
- `CREATE INDEX campus_buildings_entrance_gix ON public.campus_buildings USING gist (entrance_point)`
- `CREATE INDEX campus_buildings_name_trgm ON public.campus_buildings USING gin (name extensions.gin_trgm_ops)`

**RLS policies**

- `campus_buildings_read` (SELECT): `(private.can_view_gis(visibility, layer_id) OR ( SELECT private.has_global_permission('gis.manage'::text) AS has_global_permission))`


## campus_locations

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `campus_id` | uuid | yes |  |
| `building_id` | uuid |  |  |
| `name` | text | yes |  |
| `code` | text |  |  |
| `description` | text |  |  |
| `category_id` | uuid |  |  |
| `layer_id` | uuid |  |  |
| `floor` | text |  |  |
| `room` | text |  |  |
| `location` | extensions.geometry(Point,4326) |  |  |
| `owner_organization_id` | uuid |  |  |
| `owner_department_id` | uuid |  |  |
| `visibility` | text | yes | 'public'::text |
| `opening_hours` | jsonb |  |  |
| `contact_info` | text |  |  |
| `is_active` | boolean | yes | true |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `data_source_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_locations_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `campus_locations_geometry_ok_chk` CHECK: `CHECK (private.gis_geometry_ok(location))`
- `campus_locations_name_check` CHECK: `CHECK ((length(TRIM(BOTH FROM name)) > 0))`
- `campus_locations_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `campus_locations_verified_has_point_chk` CHECK: `CHECK (((verification_status <> 'verified'::text) OR (location IS NOT NULL)))`
- `campus_locations_visibility_check` CHECK: `CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'restricted'::text])))`
- `campus_locations_building_id_fkey` FOREIGN KEY: `FOREIGN KEY (building_id) REFERENCES campus_buildings(id) ON DELETE SET NULL`
- `campus_locations_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `campus_locations_category_id_fkey` FOREIGN KEY: `FOREIGN KEY (category_id) REFERENCES location_categories(id)`
- `campus_locations_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `campus_locations_data_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (data_source_id) REFERENCES gis_data_sources(id)`
- `campus_locations_layer_id_fkey` FOREIGN KEY: `FOREIGN KEY (layer_id) REFERENCES campus_map_layers(id) ON DELETE SET NULL`
- `campus_locations_owner_department_id_fkey` FOREIGN KEY: `FOREIGN KEY (owner_department_id) REFERENCES departments(id) ON DELETE SET NULL`
- `campus_locations_owner_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (owner_organization_id) REFERENCES organizations(id) ON DELETE SET NULL`
- `campus_locations_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id)`
- `campus_locations_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `campus_locations_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `campus_locations_campus_id_code_key` UNIQUE: `UNIQUE (campus_id, code)`

**Indexes**

- `CREATE INDEX campus_locations_building_idx ON public.campus_locations USING btree (building_id)`
- `CREATE UNIQUE INDEX campus_locations_campus_id_code_key ON public.campus_locations USING btree (campus_id, code)`
- `CREATE INDEX campus_locations_gix ON public.campus_locations USING gist (location)`
- `CREATE INDEX campus_locations_name_trgm ON public.campus_locations USING gin (name extensions.gin_trgm_ops)`

**RLS policies**

- `campus_locations_read` (SELECT): `(private.can_view_gis(visibility, layer_id) OR ( SELECT private.has_global_permission('gis.manage'::text) AS has_global_permission))`


## campus_map_layers

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `campus_id` | uuid | yes |  |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `layer_type` | text | yes |  |
| `visibility` | text | yes | 'public'::text |
| `required_permission` | text |  |  |
| `style` | jsonb | yes | '{}'::jsonb |
| `display_order` | integer | yes | 100 |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_map_layers_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `campus_map_layers_layer_type_check` CHECK: `CHECK ((layer_type = ANY (ARRAY['boundaries'::text, 'buildings'::text, 'locations'::text, 'paths'::text, 'heatmap'::text, 'custom'::text])))`
- `campus_map_layers_style_check` CHECK: `CHECK ((jsonb_typeof(style) = 'object'::text))`
- `campus_map_layers_visibility_check` CHECK: `CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'restricted'::text])))`
- `campus_map_layers_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `campus_map_layers_required_permission_fkey` FOREIGN KEY: `FOREIGN KEY (required_permission) REFERENCES permissions(code)`
- `campus_map_layers_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `campus_map_layers_campus_id_code_key` UNIQUE: `UNIQUE (campus_id, code)`

**Indexes**

- `CREATE UNIQUE INDEX campus_map_layers_campus_id_code_key ON public.campus_map_layers USING btree (campus_id, code)`

**RLS policies**

- `campus_map_layers_read` (SELECT): `(private.can_view_gis(visibility, NULL::uuid) OR ( SELECT private.has_global_permission('gis.manage'::text) AS has_global_permission))`


## campus_path_nodes

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `campus_id` | uuid | yes |  |
| `node` | extensions.geometry(Point,4326) | yes |  |
| `location_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_path_nodes_geometry_ok_chk` CHECK: `CHECK (private.gis_geometry_ok(node))`
- `campus_path_nodes_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `campus_path_nodes_location_id_fkey` FOREIGN KEY: `FOREIGN KEY (location_id) REFERENCES campus_locations(id) ON DELETE SET NULL`
- `campus_path_nodes_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX campus_path_nodes_gix ON public.campus_path_nodes USING gist (node)`

**RLS policies**

- `campus_path_nodes_read` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## campus_paths

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `campus_id` | uuid | yes |  |
| `name` | text |  |  |
| `path` | extensions.geometry(LineString,4326) | yes |  |
| `length_m` | double precision |  |  |
| `source_node` | bigint |  |  |
| `target_node` | bigint |  |  |
| `surface` | text |  |  |
| `is_accessible` | boolean |  |  |
| `is_one_way` | boolean | yes | false |
| `is_covered` | boolean |  |  |
| `layer_id` | uuid |  |  |
| `visibility` | text | yes | 'public'::text |
| `is_active` | boolean | yes | true |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `data_source_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campus_paths_geometry_ok_chk` CHECK: `CHECK (private.gis_geometry_ok(path))`
- `campus_paths_surface_check` CHECK: `CHECK ((surface = ANY (ARRAY['concrete'::text, 'asphalt'::text, 'gravel'::text, 'dirt'::text, 'grass'::text, 'tile'::text, 'other'::text])))`
- `campus_paths_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `campus_paths_visibility_check` CHECK: `CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'restricted'::text])))`
- `campus_paths_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `campus_paths_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `campus_paths_data_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (data_source_id) REFERENCES gis_data_sources(id)`
- `campus_paths_layer_id_fkey` FOREIGN KEY: `FOREIGN KEY (layer_id) REFERENCES campus_map_layers(id) ON DELETE SET NULL`
- `campus_paths_source_node_fkey` FOREIGN KEY: `FOREIGN KEY (source_node) REFERENCES campus_path_nodes(id)`
- `campus_paths_target_node_fkey` FOREIGN KEY: `FOREIGN KEY (target_node) REFERENCES campus_path_nodes(id)`
- `campus_paths_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id)`
- `campus_paths_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `campus_paths_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX campus_paths_gix ON public.campus_paths USING gist (path)`
- `CREATE INDEX campus_paths_nodes_idx ON public.campus_paths USING btree (source_node, target_node)`

**RLS policies**

- `campus_paths_read` (SELECT): `(private.can_view_gis(visibility, layer_id) OR ( SELECT private.has_global_permission('gis.manage'::text) AS has_global_permission))`


## campuses

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `municipality` | text |  |  |
| `province` | text |  |  |
| `boundary` | extensions.geometry(MultiPolygon,4326) |  |  |
| `reference_point` | extensions.geometry(Point,4326) |  |  |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `data_source_id` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `campuses_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `campuses_geometry_ok_chk` CHECK: `CHECK ((private.gis_geometry_ok(boundary) AND private.gis_geometry_ok(reference_point)))`
- `campuses_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `campuses_verified_has_geometry_chk` CHECK: `CHECK (((verification_status <> 'verified'::text) OR (boundary IS NOT NULL)))`
- `campuses_data_source_id_fkey` FOREIGN KEY: `FOREIGN KEY (data_source_id) REFERENCES gis_data_sources(id)`
- `campuses_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id)`
- `campuses_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `campuses_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `campuses_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE INDEX campuses_boundary_gix ON public.campuses USING gist (boundary)`
- `CREATE UNIQUE INDEX campuses_code_key ON public.campuses USING btree (code)`

**RLS policies**

- `campuses_read` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## clearance_approvals

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `student_clearance_id` | uuid | yes |  |
| `step_id` | uuid | yes |  |
| `step_key` | text | yes |  |
| `step_name` | text | yes |  |
| `sequence` | integer | yes |  |
| `approver_position_code` | text | yes |  |
| `organization_id` | uuid |  |  |
| `office_id` | uuid |  |  |
| `program_id` | uuid |  |  |
| `status` | text | yes | 'pending'::text |
| `acted_by` | uuid |  |  |
| `acted_at` | timestamp with time zone |  |  |
| `remarks` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clearance_approvals_one_scope_chk` CHECK: `CHECK ((num_nonnulls(organization_id, office_id, program_id) = 1))`
- `clearance_approvals_status_check` CHECK: `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'returned'::text])))`
- `clearance_approvals_acted_by_fkey` FOREIGN KEY: `FOREIGN KEY (acted_by) REFERENCES profiles(id)`
- `clearance_approvals_approver_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (approver_position_code) REFERENCES positions(code)`
- `clearance_approvals_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id)`
- `clearance_approvals_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `clearance_approvals_program_id_fkey` FOREIGN KEY: `FOREIGN KEY (program_id) REFERENCES programs(id)`
- `clearance_approvals_step_id_fkey` FOREIGN KEY: `FOREIGN KEY (step_id) REFERENCES clearance_steps(id)`
- `clearance_approvals_student_clearance_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_clearance_id) REFERENCES student_clearances(id) ON DELETE CASCADE`
- `clearance_approvals_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `clearance_approvals_student_clearance_id_step_id_key` UNIQUE: `UNIQUE (student_clearance_id, step_id)`

**Indexes**

- `CREATE INDEX clearance_approvals_office_idx ON public.clearance_approvals USING btree (office_id, status)`
- `CREATE INDEX clearance_approvals_org_idx ON public.clearance_approvals USING btree (organization_id, status)`
- `CREATE INDEX clearance_approvals_program_idx ON public.clearance_approvals USING btree (program_id, status)`
- `CREATE UNIQUE INDEX clearance_approvals_student_clearance_id_step_id_key ON public.clearance_approvals USING btree (student_clearance_id, step_id)`

**RLS policies**

- `clearance_approvals_read` (SELECT): `private.can_view_clearance(student_clearance_id)`


## clearance_history

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `student_clearance_id` | uuid | yes |  |
| `approval_id` | uuid |  |  |
| `event_type` | text | yes |  |
| `actor_id` | uuid |  |  |
| `details` | jsonb | yes | '{}'::jsonb |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clearance_history_event_type_check` CHECK: `CHECK ((event_type = ANY (ARRAY['initiated'::text, 'evaluated'::text, 'approved'::text, 'returned'::text, 'completed'::text, 'cancelled'::text])))`
- `clearance_history_actor_id_fkey` FOREIGN KEY: `FOREIGN KEY (actor_id) REFERENCES profiles(id)`
- `clearance_history_approval_id_fkey` FOREIGN KEY: `FOREIGN KEY (approval_id) REFERENCES clearance_approvals(id)`
- `clearance_history_student_clearance_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_clearance_id) REFERENCES student_clearances(id) ON DELETE CASCADE`
- `clearance_history_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX clearance_history_clearance_idx ON public.clearance_history USING btree (student_clearance_id, created_at)`

**RLS policies**

- `clearance_history_read` (SELECT): `private.can_view_clearance(student_clearance_id)`


## clearance_requirement_status

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `student_clearance_id` | uuid | yes |  |
| `approval_id` | uuid | yes |  |
| `requirement_id` | uuid | yes |  |
| `requirement_key` | text | yes |  |
| `status` | text | yes | 'pending'::text |
| `details` | jsonb | yes | '{}'::jsonb |
| `evaluated_at` | timestamp with time zone |  |  |

**Constraints**

- `clearance_requirement_status_status_check` CHECK: `CHECK ((status = ANY (ARRAY['pending'::text, 'satisfied'::text, 'not_satisfied'::text])))`
- `clearance_requirement_status_approval_id_fkey` FOREIGN KEY: `FOREIGN KEY (approval_id) REFERENCES clearance_approvals(id) ON DELETE CASCADE`
- `clearance_requirement_status_requirement_id_fkey` FOREIGN KEY: `FOREIGN KEY (requirement_id) REFERENCES clearance_requirements(id)`
- `clearance_requirement_status_student_clearance_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_clearance_id) REFERENCES student_clearances(id) ON DELETE CASCADE`
- `clearance_requirement_status_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `clearance_requirement_status_student_clearance_id_requireme_key` UNIQUE: `UNIQUE (student_clearance_id, requirement_id)`

**Indexes**

- `CREATE INDEX clearance_requirement_status_approval_idx ON public.clearance_requirement_status USING btree (approval_id)`
- `CREATE UNIQUE INDEX clearance_requirement_status_student_clearance_id_requireme_key ON public.clearance_requirement_status USING btree (student_clearance_id, requirement_id)`

**RLS policies**

- `clearance_requirement_status_read` (SELECT): `private.can_view_clearance(student_clearance_id)`


## clearance_requirements

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `step_id` | uuid | yes |  |
| `requirement_key` | text | yes |  |
| `name` | text | yes |  |
| `requirement_type` | text | yes |  |
| `organization_selector` | text | yes | 'none'::text |
| `organization_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clearance_requirements_fixed_org_chk` CHECK: `CHECK (((organization_selector = 'fixed'::text) = (organization_id IS NOT NULL)))`
- `clearance_requirements_organization_selector_check` CHECK: `CHECK ((organization_selector = ANY (ARRAY['none'::text, 'fixed'::text, 'student_department_organization'::text, 'student_clubs'::text])))`
- `clearance_requirements_requirement_key_check` CHECK: `CHECK ((requirement_key ~ '^[a-z][a-z0-9_]*$'::text))`
- `clearance_requirements_requirement_type_check` CHECK: `CHECK ((requirement_type = ANY (ARRAY['receipt_obligations'::text, 'guidance_slip'::text, 'library_slip'::text, 'library_receipt'::text, 'library_id_validation'::text, 'no_unresolved_penalties'::text])))`
- `clearance_requirements_selector_chk` CHECK: `CHECK (((requirement_type = ANY (ARRAY['receipt_obligations'::text, 'no_unresolved_penalties'::text])) = (organization_selector <> 'none'::text)))`
- `clearance_requirements_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `clearance_requirements_step_id_fkey` FOREIGN KEY: `FOREIGN KEY (step_id) REFERENCES clearance_steps(id) ON DELETE CASCADE`
- `clearance_requirements_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `clearance_requirements_step_id_requirement_key_key` UNIQUE: `UNIQUE (step_id, requirement_key)`

**Indexes**

- `CREATE UNIQUE INDEX clearance_requirements_step_id_requirement_key_key ON public.clearance_requirements USING btree (step_id, requirement_key)`

**RLS policies**

- `clearance_requirements_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## clearance_steps

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `template_id` | uuid | yes |  |
| `step_key` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `sequence` | integer | yes |  |
| `approver_position_code` | text | yes |  |
| `approver_scope` | text | yes |  |
| `fixed_organization_id` | uuid |  |  |
| `fixed_office_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clearance_steps_approver_scope_check` CHECK: `CHECK ((approver_scope = ANY (ARRAY['fixed_organization'::text, 'fixed_office'::text, 'student_department_organization'::text, 'student_program'::text])))`
- `clearance_steps_fixed_office_chk` CHECK: `CHECK (((approver_scope = 'fixed_office'::text) = (fixed_office_id IS NOT NULL)))`
- `clearance_steps_fixed_org_chk` CHECK: `CHECK (((approver_scope = 'fixed_organization'::text) = (fixed_organization_id IS NOT NULL)))`
- `clearance_steps_sequence_check` CHECK: `CHECK ((sequence > 0))`
- `clearance_steps_step_key_check` CHECK: `CHECK ((step_key ~ '^[a-z][a-z0-9_]*$'::text))`
- `clearance_steps_approver_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (approver_position_code) REFERENCES positions(code)`
- `clearance_steps_fixed_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (fixed_office_id) REFERENCES offices(id)`
- `clearance_steps_fixed_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (fixed_organization_id) REFERENCES organizations(id)`
- `clearance_steps_template_id_fkey` FOREIGN KEY: `FOREIGN KEY (template_id) REFERENCES clearance_templates(id) ON DELETE CASCADE`
- `clearance_steps_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `clearance_steps_template_id_step_key_key` UNIQUE: `UNIQUE (template_id, step_key)`

**Indexes**

- `CREATE UNIQUE INDEX clearance_steps_template_id_step_key_key ON public.clearance_steps USING btree (template_id, step_key)`
- `CREATE INDEX clearance_steps_template_idx ON public.clearance_steps USING btree (template_id, sequence)`

**RLS policies**

- `clearance_steps_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## clearance_templates

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `academic_year_id` | uuid | yes |  |
| `version` | integer | yes | 1 |
| `initiating_office_id` | uuid | yes |  |
| `status` | text | yes | 'draft'::text |
| `created_by` | uuid |  |  |
| `activated_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clearance_templates_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `clearance_templates_status_check` CHECK: `CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))`
- `clearance_templates_version_check` CHECK: `CHECK ((version > 0))`
- `clearance_templates_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `clearance_templates_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `clearance_templates_initiating_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (initiating_office_id) REFERENCES offices(id)`
- `clearance_templates_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `clearance_templates_code_academic_year_id_version_key` UNIQUE: `UNIQUE (code, academic_year_id, version)`

**Indexes**

- `CREATE UNIQUE INDEX clearance_templates_code_academic_year_id_version_key ON public.clearance_templates USING btree (code, academic_year_id, version)`
- `CREATE UNIQUE INDEX clearance_templates_one_active_idx ON public.clearance_templates USING btree (code, academic_year_id) WHERE (status = 'active'::text)`

**RLS policies**

- `clearance_templates_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## clubs

| Column | Type | Not null | Default |
|---|---|---|---|
| `organization_id` | uuid | yes |  |
| `membership_requires_approval` | boolean | yes | true |
| `adviser_name` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `clubs_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `clubs_pkey` PRIMARY KEY: `PRIMARY KEY (organization_id)`

**RLS policies**

- `clubs_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## community_service_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `resolution_id` | uuid | yes |  |
| `assessment_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `service_date` | date | yes |  |
| `hours_rendered` | numeric(6,2) | yes |  |
| `description` | text | yes |  |
| `supervisor_name` | text |  |  |
| `status` | text | yes | 'submitted'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `decision_notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `community_service_not_self_chk` CHECK: `CHECK (((verified_by IS NULL) OR (verified_by <> student_id)))`
- `community_service_records_description_check` CHECK: `CHECK ((length(TRIM(BOTH FROM description)) > 0))`
- `community_service_records_hours_rendered_check` CHECK: `CHECK (((hours_rendered > (0)::numeric) AND (hours_rendered <= (24)::numeric)))`
- `community_service_records_status_check` CHECK: `CHECK ((status = ANY (ARRAY['submitted'::text, 'verified'::text, 'rejected'::text])))`
- `community_service_records_assessment_id_fkey` FOREIGN KEY: `FOREIGN KEY (assessment_id) REFERENCES penalty_assessments(id)`
- `community_service_records_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `community_service_records_resolution_id_fkey` FOREIGN KEY: `FOREIGN KEY (resolution_id) REFERENCES penalty_resolutions(id) ON DELETE CASCADE`
- `community_service_records_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `community_service_records_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `community_service_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX community_service_assessment_idx ON public.community_service_records USING btree (assessment_id)`

**RLS policies**

- `community_service_records_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'penalties.view'::text))`


## departments

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `departments_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `departments_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX departments_code_key ON public.departments USING btree (code)`

**RLS policies**

- `departments_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## gis_data_sources

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `source_type` | text | yes |  |
| `license` | text |  |  |
| `attribution` | text |  |  |
| `url` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `gis_data_sources_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `gis_data_sources_source_type_check` CHECK: `CHECK ((source_type = ANY (ARRAY['administrator_entry'::text, 'field_survey'::text, 'openstreetmap'::text, 'university_records'::text, 'import'::text, 'other'::text])))`
- `gis_sources_osm_attribution_chk` CHECK: `CHECK (((source_type <> 'openstreetmap'::text) OR (attribution IS NOT NULL)))`
- `gis_data_sources_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `gis_data_sources_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX gis_data_sources_code_key ON public.gis_data_sources USING btree (code)`

**RLS policies**

- `gis_data_sources_read` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## gis_location_verifications

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `feature_type` | text | yes |  |
| `campus_id` | uuid |  |  |
| `building_id` | uuid |  |  |
| `boundary_id` | uuid |  |  |
| `location_id` | uuid |  |  |
| `path_id` | bigint |  |  |
| `accessibility_id` | uuid |  |  |
| `action` | text | yes |  |
| `method` | text |  |  |
| `previous_geometry` | extensions.geometry(Geometry,4326) |  |  |
| `new_geometry` | extensions.geometry(Geometry,4326) |  |  |
| `evidence` | text |  |  |
| `notes` | text |  |  |
| `actor_id` | uuid | yes |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `gis_location_verifications_action_check` CHECK: `CHECK ((action = ANY (ARRAY['submitted'::text, 'edited'::text, 'verified'::text, 'rejected'::text, 'retired'::text])))`
- `gis_location_verifications_feature_type_check` CHECK: `CHECK ((feature_type = ANY (ARRAY['campus'::text, 'building'::text, 'building_boundary'::text, 'location'::text, 'path'::text, 'accessibility'::text])))`
- `gis_location_verifications_method_check` CHECK: `CHECK ((method = ANY (ARRAY['field_survey'::text, 'gps_device'::text, 'university_records'::text, 'imagery_review'::text, 'import'::text, 'other'::text])))`
- `gis_verifications_one_target_chk` CHECK: `CHECK ((num_nonnulls(campus_id, building_id, boundary_id, location_id, path_id, accessibility_id) = 1))`
- `gis_location_verifications_accessibility_id_fkey` FOREIGN KEY: `FOREIGN KEY (accessibility_id) REFERENCES location_accessibility(id) ON DELETE CASCADE`
- `gis_location_verifications_actor_id_fkey` FOREIGN KEY: `FOREIGN KEY (actor_id) REFERENCES profiles(id)`
- `gis_location_verifications_boundary_id_fkey` FOREIGN KEY: `FOREIGN KEY (boundary_id) REFERENCES campus_building_boundaries(id) ON DELETE CASCADE`
- `gis_location_verifications_building_id_fkey` FOREIGN KEY: `FOREIGN KEY (building_id) REFERENCES campus_buildings(id) ON DELETE CASCADE`
- `gis_location_verifications_campus_id_fkey` FOREIGN KEY: `FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE`
- `gis_location_verifications_location_id_fkey` FOREIGN KEY: `FOREIGN KEY (location_id) REFERENCES campus_locations(id) ON DELETE CASCADE`
- `gis_location_verifications_path_id_fkey` FOREIGN KEY: `FOREIGN KEY (path_id) REFERENCES campus_paths(id) ON DELETE CASCADE`
- `gis_location_verifications_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX gis_location_verifications_building_idx ON public.gis_location_verifications USING btree (building_id)`
- `CREATE INDEX gis_location_verifications_location_idx ON public.gis_location_verifications USING btree (location_id)`
- `CREATE INDEX gis_location_verifications_path_idx ON public.gis_location_verifications USING btree (path_id)`

**RLS policies**

- `gis_location_verifications_read` (SELECT): `(( SELECT private.has_global_permission('gis.manage'::text) AS has_global_permission) OR ( SELECT private.has_global_permission('gis.verify'::text) AS has_global_permission))`


## guidance_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `student_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `office_id` | uuid | yes |  |
| `teacher_evaluations_status` | text | yes | 'pending'::text |
| `evaluations_confirmed_by` | uuid |  |  |
| `evaluations_confirmed_at` | timestamp with time zone |  |  |
| `slip_status` | text | yes | 'not_issued'::text |
| `slip_number` | text |  |  |
| `slip_issued_by` | uuid |  |  |
| `slip_issued_at` | timestamp with time zone |  |  |
| `remarks` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `guidance_not_self_chk` CHECK: `CHECK (((evaluations_confirmed_by IS DISTINCT FROM student_id) AND (slip_issued_by IS DISTINCT FROM student_id)))`
- `guidance_records_slip_status_check` CHECK: `CHECK ((slip_status = ANY (ARRAY['not_issued'::text, 'issued'::text, 'revoked'::text])))`
- `guidance_records_teacher_evaluations_status_check` CHECK: `CHECK ((teacher_evaluations_status = ANY (ARRAY['pending'::text, 'completed'::text])))`
- `guidance_slip_fields_chk` CHECK: `CHECK (((slip_status <> 'issued'::text) OR ((slip_number IS NOT NULL) AND (slip_issued_by IS NOT NULL))))`
- `guidance_slip_requires_evaluations_chk` CHECK: `CHECK (((slip_status <> 'issued'::text) OR (teacher_evaluations_status = 'completed'::text)))`
- `guidance_records_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `guidance_records_evaluations_confirmed_by_fkey` FOREIGN KEY: `FOREIGN KEY (evaluations_confirmed_by) REFERENCES profiles(id)`
- `guidance_records_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id)`
- `guidance_records_slip_issued_by_fkey` FOREIGN KEY: `FOREIGN KEY (slip_issued_by) REFERENCES profiles(id)`
- `guidance_records_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id) ON DELETE CASCADE`
- `guidance_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `guidance_records_slip_number_key` UNIQUE: `UNIQUE (slip_number)`
- `guidance_records_student_id_academic_year_id_key` UNIQUE: `UNIQUE (student_id, academic_year_id)`

**Indexes**

- `CREATE INDEX guidance_records_office_idx ON public.guidance_records USING btree (office_id, academic_year_id)`
- `CREATE UNIQUE INDEX guidance_records_slip_number_key ON public.guidance_records USING btree (slip_number)`
- `CREATE UNIQUE INDEX guidance_records_student_id_academic_year_id_key ON public.guidance_records USING btree (student_id, academic_year_id)`

**RLS policies**

- `guidance_records_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_office_permission(office_id, 'guidance.manage'::text))`


## library_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `student_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `office_id` | uuid | yes |  |
| `library_id_number` | text |  |  |
| `id_validation_status` | text | yes | 'pending'::text |
| `id_validated_by` | uuid |  |  |
| `id_validated_at` | timestamp with time zone |  |  |
| `receipt_status` | text | yes | 'pending'::text |
| `receipt_number` | text |  |  |
| `receipt_amount` | numeric(10,2) |  |  |
| `receipt_verified_by` | uuid |  |  |
| `receipt_verified_at` | timestamp with time zone |  |  |
| `slip_status` | text | yes | 'not_issued'::text |
| `slip_number` | text |  |  |
| `slip_issued_by` | uuid |  |  |
| `slip_issued_at` | timestamp with time zone |  |  |
| `remarks` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `library_not_self_chk` CHECK: `CHECK (((id_validated_by IS DISTINCT FROM student_id) AND (receipt_verified_by IS DISTINCT FROM student_id) AND (slip_issued_by IS DISTINCT FROM student_id)))`
- `library_receipt_has_number_chk` CHECK: `CHECK (((receipt_status <> 'verified'::text) OR (receipt_number IS NOT NULL)))`
- `library_records_id_validation_status_check` CHECK: `CHECK ((id_validation_status = ANY (ARRAY['pending'::text, 'validated'::text, 'rejected'::text])))`
- `library_records_receipt_amount_check` CHECK: `CHECK (((receipt_amount IS NULL) OR (receipt_amount >= (0)::numeric)))`
- `library_records_receipt_status_check` CHECK: `CHECK ((receipt_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))`
- `library_records_slip_status_check` CHECK: `CHECK ((slip_status = ANY (ARRAY['not_issued'::text, 'issued'::text, 'revoked'::text])))`
- `library_slip_fields_chk` CHECK: `CHECK (((slip_status <> 'issued'::text) OR ((slip_number IS NOT NULL) AND (slip_issued_by IS NOT NULL))))`
- `library_validated_has_id_chk` CHECK: `CHECK (((id_validation_status <> 'validated'::text) OR (library_id_number IS NOT NULL)))`
- `library_records_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `library_records_id_validated_by_fkey` FOREIGN KEY: `FOREIGN KEY (id_validated_by) REFERENCES profiles(id)`
- `library_records_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id)`
- `library_records_receipt_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (receipt_verified_by) REFERENCES profiles(id)`
- `library_records_slip_issued_by_fkey` FOREIGN KEY: `FOREIGN KEY (slip_issued_by) REFERENCES profiles(id)`
- `library_records_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id) ON DELETE CASCADE`
- `library_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `library_records_slip_number_key` UNIQUE: `UNIQUE (slip_number)`
- `library_records_student_id_academic_year_id_key` UNIQUE: `UNIQUE (student_id, academic_year_id)`

**Indexes**

- `CREATE INDEX library_records_office_idx ON public.library_records USING btree (office_id, academic_year_id)`
- `CREATE UNIQUE INDEX library_records_slip_number_key ON public.library_records USING btree (slip_number)`
- `CREATE UNIQUE INDEX library_records_student_id_academic_year_id_key ON public.library_records USING btree (student_id, academic_year_id)`

**RLS policies**

- `library_records_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_office_permission(office_id, 'library.manage'::text))`


## location_accessibility

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `location_id` | uuid |  |  |
| `building_id` | uuid |  |  |
| `path_id` | bigint |  |  |
| `feature` | text | yes |  |
| `is_available` | boolean | yes |  |
| `notes` | text |  |  |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `location_accessibility_feature_check` CHECK: `CHECK ((feature = ANY (ARRAY['wheelchair_ramp'::text, 'elevator'::text, 'stairs'::text, 'accessible_restroom'::text, 'handrail'::text, 'tactile_paving'::text, 'accessible_parking'::text, 'step_free_entrance'::text, 'other'::text])))`
- `location_accessibility_one_target_chk` CHECK: `CHECK ((num_nonnulls(location_id, building_id, path_id) = 1))`
- `location_accessibility_verification_status_check` CHECK: `CHECK (private.gis_status_ok(verification_status))`
- `location_accessibility_building_id_fkey` FOREIGN KEY: `FOREIGN KEY (building_id) REFERENCES campus_buildings(id) ON DELETE CASCADE`
- `location_accessibility_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id)`
- `location_accessibility_location_id_fkey` FOREIGN KEY: `FOREIGN KEY (location_id) REFERENCES campus_locations(id) ON DELETE CASCADE`
- `location_accessibility_path_id_fkey` FOREIGN KEY: `FOREIGN KEY (path_id) REFERENCES campus_paths(id) ON DELETE CASCADE`
- `location_accessibility_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id)`
- `location_accessibility_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `location_accessibility_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**RLS policies**

- `location_accessibility_read` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## location_categories

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `icon` | text |  |  |
| `applies_to` | text | yes | 'location'::text |
| `description` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `location_categories_applies_to_check` CHECK: `CHECK ((applies_to = ANY (ARRAY['location'::text, 'building'::text, 'path'::text, 'any'::text])))`
- `location_categories_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `location_categories_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `location_categories_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX location_categories_code_key ON public.location_categories USING btree (code)`

**RLS policies**

- `location_categories_read` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## notification_delivery_logs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `notification_id` | uuid |  |  |
| `recipient_id` | uuid | yes |  |
| `channel` | text | yes |  |
| `template_id` | uuid |  |  |
| `execution_id` | bigint |  |  |
| `provider` | text |  |  |
| `status` | text | yes |  |
| `attempts` | integer | yes | 0 |
| `provider_message_id` | text |  |  |
| `error_message` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `notification_delivery_logs_channel_check` CHECK: `CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text])))`
- `notification_delivery_logs_status_check` CHECK: `CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))`
- `notification_delivery_logs_execution_id_fkey` FOREIGN KEY: `FOREIGN KEY (execution_id) REFERENCES automation_executions(id) ON DELETE SET NULL`
- `notification_delivery_logs_notification_id_fkey` FOREIGN KEY: `FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE`
- `notification_delivery_logs_recipient_id_fkey` FOREIGN KEY: `FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `notification_delivery_logs_template_id_fkey` FOREIGN KEY: `FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE SET NULL`
- `notification_delivery_logs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX notification_delivery_logs_recipient_idx ON public.notification_delivery_logs USING btree (recipient_id, created_at DESC)`

**RLS policies**

- `notification_delivery_logs_read` (SELECT): `((recipient_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('automation.manage'::text) AS has_global_permission))`


## notification_templates

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `channel` | text | yes | 'in_app'::text |
| `version` | integer | yes | 1 |
| `locale` | text | yes | 'en'::text |
| `subject` | text | yes |  |
| `body` | text | yes |  |
| `placeholders` | text[] | yes | '{}'::text[] |
| `is_active` | boolean | yes | true |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `notification_templates_channel_check` CHECK: `CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text])))`
- `notification_templates_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `notification_templates_version_check` CHECK: `CHECK ((version > 0))`
- `notification_templates_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `notification_templates_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `notification_templates_code_channel_locale_version_key` UNIQUE: `UNIQUE (code, channel, locale, version)`

**Indexes**

- `CREATE UNIQUE INDEX notification_templates_code_channel_locale_version_key ON public.notification_templates USING btree (code, channel, locale, version)`
- `CREATE UNIQUE INDEX notification_templates_one_active_idx ON public.notification_templates USING btree (code, channel, locale) WHERE is_active`

**RLS policies**

- `notification_templates_read` (SELECT): `( SELECT private.has_global_permission('automation.view'::text) AS has_global_permission)`


## notifications

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid | yes |  |
| `category` | text | yes |  |
| `title` | text | yes |  |
| `body` | text |  |  |
| `link` | text |  |  |
| `read_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `notifications_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `notifications_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC)`
- `CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL)`

**RLS policies**

- `notifications_mark_read_own` (UPDATE): `(user_id = ( SELECT auth.uid() AS uid))`
- `notifications_read_own` (SELECT): `(user_id = ( SELECT auth.uid() AS uid))`


## office_locations

| Column | Type | Not null | Default |
|---|---|---|---|
| `office_id` | uuid | yes |  |
| `location_id` | uuid | yes |  |
| `is_primary` | boolean | yes | true |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `office_locations_location_id_fkey` FOREIGN KEY: `FOREIGN KEY (location_id) REFERENCES campus_locations(id) ON DELETE CASCADE`
- `office_locations_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE`
- `office_locations_pkey` PRIMARY KEY: `PRIMARY KEY (office_id, location_id)`

**Indexes**

- `CREATE INDEX office_locations_location_idx ON public.office_locations USING btree (location_id)`
- `CREATE UNIQUE INDEX office_locations_one_primary_idx ON public.office_locations USING btree (office_id) WHERE is_primary`

**RLS policies**

- `office_locations_read` (SELECT): `(EXISTS ( SELECT 1
   FROM campus_locations l
  WHERE (l.id = office_locations.location_id)))`


## office_staff

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid | yes |  |
| `office_id` | uuid | yes |  |
| `position_code` | text | yes |  |
| `academic_year_id` | uuid | yes |  |
| `is_active` | boolean | yes | true |
| `assigned_by` | uuid |  |  |
| `assigned_at` | timestamp with time zone | yes | now() |
| `revoked_at` | timestamp with time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `office_staff_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `office_staff_assigned_by_fkey` FOREIGN KEY: `FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `office_staff_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE`
- `office_staff_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (position_code) REFERENCES positions(code)`
- `office_staff_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `office_staff_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `office_staff_user_id_office_id_position_code_academic_year__key` UNIQUE: `UNIQUE (user_id, office_id, position_code, academic_year_id)`

**Indexes**

- `CREATE INDEX office_staff_office_idx ON public.office_staff USING btree (office_id, academic_year_id) WHERE is_active`
- `CREATE UNIQUE INDEX office_staff_user_id_office_id_position_code_academic_year__key ON public.office_staff USING btree (user_id, office_id, position_code, academic_year_id)`

**RLS policies**

- `office_staff_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('users.manage'::text) AS has_global_permission) OR private.has_office_permission(office_id, 'queue.manage'::text))`


## offices

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `location` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `offices_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `offices_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `offices_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX offices_code_key ON public.offices USING btree (code)`

**RLS policies**

- `offices_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## organization_assignments

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `position_code` | text | yes |  |
| `academic_year_id` | uuid | yes |  |
| `program_id` | uuid |  |  |
| `section` | text |  |  |
| `is_active` | boolean | yes | true |
| `assigned_by` | uuid |  |  |
| `assigned_at` | timestamp with time zone | yes | now() |
| `revoked_at` | timestamp with time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `organization_assignments_section_chk` CHECK: `CHECK (((section IS NULL) OR (program_id IS NOT NULL)))`
- `organization_assignments_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `organization_assignments_assigned_by_fkey` FOREIGN KEY: `FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `organization_assignments_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `organization_assignments_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (position_code) REFERENCES positions(code)`
- `organization_assignments_program_id_fkey` FOREIGN KEY: `FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE`
- `organization_assignments_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `organization_assignments_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX organization_assignments_org_idx ON public.organization_assignments USING btree (organization_id, academic_year_id) WHERE is_active`
- `CREATE UNIQUE INDEX organization_assignments_unique_idx ON public.organization_assignments USING btree (user_id, organization_id, position_code, academic_year_id, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(section, ''::text))`

**RLS policies**

- `organization_assignments_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('users.manage'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'org.view_members'::text))`


## organization_events

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `name` | text | yes |  |
| `event_date` | date | yes |  |
| `description` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `organization_events_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `organization_events_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `organization_events_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `organization_events_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `organization_events_organization_id_name_event_date_key` UNIQUE: `UNIQUE (organization_id, name, event_date)`

**Indexes**

- `CREATE UNIQUE INDEX organization_events_organization_id_name_event_date_key ON public.organization_events USING btree (organization_id, name, event_date)`

**RLS policies**

- `organization_events_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## organization_members

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `status` | text | yes | 'active'::text |
| `joined_on` | date | yes | CURRENT_DATE |
| `recorded_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `organization_members_status_check` CHECK: `CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))`
- `organization_members_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `organization_members_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `organization_members_recorded_by_fkey` FOREIGN KEY: `FOREIGN KEY (recorded_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `organization_members_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id) ON DELETE CASCADE`
- `organization_members_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `organization_members_organization_id_student_id_academic_ye_key` UNIQUE: `UNIQUE (organization_id, student_id, academic_year_id)`

**Indexes**

- `CREATE UNIQUE INDEX organization_members_organization_id_student_id_academic_ye_key ON public.organization_members USING btree (organization_id, student_id, academic_year_id)`
- `CREATE INDEX organization_members_student_idx ON public.organization_members USING btree (student_id, academic_year_id)`

**RLS policies**

- `organization_members_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'org.view_members'::text))`


## organizations

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `organization_type` | text | yes |  |
| `department_id` | uuid |  |  |
| `description` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `organizations_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `organizations_organization_type_check` CHECK: `CHECK ((organization_type = ANY (ARRAY['student_government'::text, 'department_organization'::text, 'club'::text, 'other'::text])))`
- `organizations_department_id_fkey` FOREIGN KEY: `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL`
- `organizations_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `organizations_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX organizations_code_key ON public.organizations USING btree (code)`
- `CREATE INDEX organizations_type_idx ON public.organizations USING btree (organization_type)`

**RLS policies**

- `organizations_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## payment_reconciliation_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `penalty_payment_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `reconciled_by` | uuid | yes |  |
| `source` | text | yes |  |
| `provider_reference` | text |  |  |
| `provider_amount` | numeric(12,2) |  |  |
| `provider_status` | text |  |  |
| `result` | text | yes |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `payment_reconciliation_records_result_check` CHECK: `CHECK ((result = ANY (ARRAY['matched'::text, 'amount_mismatch'::text, 'status_mismatch'::text, 'not_found_at_provider'::text])))`
- `payment_reconciliation_records_source_check` CHECK: `CHECK ((source = ANY (ARRAY['provider_api'::text, 'settlement_report'::text, 'manual_review'::text])))`
- `payment_reconciliation_records_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `payment_reconciliation_records_penalty_payment_id_fkey` FOREIGN KEY: `FOREIGN KEY (penalty_payment_id) REFERENCES penalty_payments(id)`
- `payment_reconciliation_records_reconciled_by_fkey` FOREIGN KEY: `FOREIGN KEY (reconciled_by) REFERENCES profiles(id)`
- `payment_reconciliation_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX payment_reconciliation_payment_idx ON public.payment_reconciliation_records USING btree (penalty_payment_id)`

**RLS policies**

- `payment_reconciliation_records_read` (SELECT): `(( SELECT private.has_global_permission('payments.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'payments.reconcile'::text))`


## payment_webhook_events

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `provider` | text | yes |  |
| `provider_event_id` | text | yes |  |
| `event_type` | text |  |  |
| `signature_valid` | boolean | yes |  |
| `payload` | jsonb | yes |  |
| `penalty_payment_id` | uuid |  |  |
| `processing_status` | text | yes | 'received'::text |
| `processing_error` | text |  |  |
| `received_at` | timestamp with time zone | yes | now() |
| `processed_at` | timestamp with time zone |  |  |

**Constraints**

- `payment_webhook_events_processing_status_check` CHECK: `CHECK ((processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'failed'::text])))`
- `payment_webhook_events_provider_check` CHECK: `CHECK ((provider = ANY (ARRAY['gcash'::text, 'maya'::text, 'landbank'::text])))`
- `payment_webhook_events_penalty_payment_id_fkey` FOREIGN KEY: `FOREIGN KEY (penalty_payment_id) REFERENCES penalty_payments(id)`
- `payment_webhook_events_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `payment_webhook_events_provider_provider_event_id_key` UNIQUE: `UNIQUE (provider, provider_event_id)`

**Indexes**

- `CREATE INDEX payment_webhook_events_payment_idx ON public.payment_webhook_events USING btree (penalty_payment_id)`
- `CREATE UNIQUE INDEX payment_webhook_events_provider_provider_event_id_key ON public.payment_webhook_events USING btree (provider, provider_event_id)`

**RLS policies**

- `payment_webhook_events_read` (SELECT): `( SELECT private.has_global_permission('payments.view_webhooks'::text) AS has_global_permission)`


## penalty_assessments

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `policy_id` | uuid | yes |  |
| `policy_version_id` | uuid | yes |  |
| `policy_snapshot` | jsonb | yes |  |
| `violation_count` | integer | yes |  |
| `required_hours` | numeric(8,2) |  |  |
| `required_amount` | numeric(12,2) |  |  |
| `status` | text | yes | 'open'::text |
| `selected_resolution` | text |  |  |
| `superseded_by` | uuid |  |  |
| `assessed_by` | uuid | yes |  |
| `assessed_at` | timestamp with time zone | yes | now() |
| `resolved_by` | uuid |  |  |
| `resolved_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `penalty_assessments_not_self_chk` CHECK: `CHECK (((assessed_by <> student_id) AND ((resolved_by IS NULL) OR (resolved_by <> student_id))))`
- `penalty_assessments_required_amount_check` CHECK: `CHECK ((required_amount >= (0)::numeric))`
- `penalty_assessments_required_hours_check` CHECK: `CHECK ((required_hours >= (0)::numeric))`
- `penalty_assessments_resolved_fields_chk` CHECK: `CHECK (((status <> 'resolved'::text) OR ((resolved_by IS NOT NULL) AND (resolved_at IS NOT NULL))))`
- `penalty_assessments_selected_resolution_check` CHECK: `CHECK ((selected_resolution = ANY (ARRAY['community_service'::text, 'payment'::text])))`
- `penalty_assessments_status_check` CHECK: `CHECK ((status = ANY (ARRAY['open'::text, 'pending_verification'::text, 'resolved'::text, 'superseded'::text])))`
- `penalty_assessments_violation_count_check` CHECK: `CHECK ((violation_count > 0))`
- `penalty_assessments_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `penalty_assessments_assessed_by_fkey` FOREIGN KEY: `FOREIGN KEY (assessed_by) REFERENCES profiles(id)`
- `penalty_assessments_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `penalty_assessments_policy_id_fkey` FOREIGN KEY: `FOREIGN KEY (policy_id) REFERENCES violation_policies(id)`
- `penalty_assessments_policy_version_id_fkey` FOREIGN KEY: `FOREIGN KEY (policy_version_id) REFERENCES violation_policy_versions(id)`
- `penalty_assessments_resolved_by_fkey` FOREIGN KEY: `FOREIGN KEY (resolved_by) REFERENCES profiles(id)`
- `penalty_assessments_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `penalty_assessments_superseded_by_fkey` FOREIGN KEY: `FOREIGN KEY (superseded_by) REFERENCES penalty_assessments(id)`
- `penalty_assessments_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE UNIQUE INDEX penalty_assessments_one_live_idx ON public.penalty_assessments USING btree (organization_id, student_id, academic_year_id, policy_id) WHERE (status = ANY (ARRAY['open'::text, 'pending_verification'::text]))`
- `CREATE INDEX penalty_assessments_org_status_idx ON public.penalty_assessments USING btree (organization_id, status)`
- `CREATE INDEX penalty_assessments_student_idx ON public.penalty_assessments USING btree (student_id, academic_year_id)`

**RLS policies**

- `penalty_assessments_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'penalties.view'::text))`


## penalty_payments

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `reference` | text | yes | ((('CSP-'::text \|\| to_char(now(), 'YYYY'::text)) \|\| '-'::text) \|\| lpad((nextval('payment_reference_seq'::regclass))::text, 8, '0'::text)) |
| `idempotency_key` | text | yes |  |
| `assessment_id` | uuid | yes |  |
| `resolution_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `amount` | numeric(12,2) | yes |  |
| `currency` | text | yes | 'PHP'::text |
| `provider` | text | yes |  |
| `provider_transaction_id` | text |  |  |
| `provider_checkout_url` | text |  |  |
| `status` | text | yes | 'created'::text |
| `status_reason` | text |  |  |
| `paid_at` | timestamp with time zone |  |  |
| `expires_at` | timestamp with time zone |  |  |
| `verification_status` | text | yes | 'unverified'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `verification_notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `penalty_payments_amount_check` CHECK: `CHECK ((amount > (0)::numeric))`
- `penalty_payments_currency_check` CHECK: `CHECK ((currency = 'PHP'::text))`
- `penalty_payments_idempotency_key_check` CHECK: `CHECK (((length(idempotency_key) >= 8) AND (length(idempotency_key) <= 128)))`
- `penalty_payments_not_self_chk` CHECK: `CHECK (((verified_by IS NULL) OR (verified_by <> student_id)))`
- `penalty_payments_paid_at_chk` CHECK: `CHECK (((status <> 'paid'::text) OR (paid_at IS NOT NULL)))`
- `penalty_payments_provider_check` CHECK: `CHECK ((provider = ANY (ARRAY['gcash'::text, 'maya'::text, 'landbank'::text])))`
- `penalty_payments_status_check` CHECK: `CHECK ((status = ANY (ARRAY['created'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'cancelled'::text, 'refunded'::text])))`
- `penalty_payments_verification_status_check` CHECK: `CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text])))`
- `penalty_payments_verified_requires_paid_chk` CHECK: `CHECK (((verification_status <> 'verified'::text) OR (status = 'paid'::text)))`
- `penalty_payments_assessment_id_fkey` FOREIGN KEY: `FOREIGN KEY (assessment_id) REFERENCES penalty_assessments(id)`
- `penalty_payments_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `penalty_payments_resolution_id_fkey` FOREIGN KEY: `FOREIGN KEY (resolution_id) REFERENCES penalty_resolutions(id)`
- `penalty_payments_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `penalty_payments_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `penalty_payments_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `penalty_payments_provider_provider_transaction_id_key` UNIQUE: `UNIQUE (provider, provider_transaction_id)`
- `penalty_payments_reference_key` UNIQUE: `UNIQUE (reference)`
- `penalty_payments_student_id_idempotency_key_key` UNIQUE: `UNIQUE (student_id, idempotency_key)`

**Indexes**

- `CREATE UNIQUE INDEX penalty_payments_one_live_idx ON public.penalty_payments USING btree (assessment_id) WHERE ((status = ANY (ARRAY['created'::text, 'pending'::text])) OR ((status = 'paid'::text) AND (verification_status <> 'rejected'::text)))`
- `CREATE INDEX penalty_payments_org_idx ON public.penalty_payments USING btree (organization_id, status)`
- `CREATE UNIQUE INDEX penalty_payments_provider_provider_transaction_id_key ON public.penalty_payments USING btree (provider, provider_transaction_id)`
- `CREATE UNIQUE INDEX penalty_payments_reference_key ON public.penalty_payments USING btree (reference)`
- `CREATE UNIQUE INDEX penalty_payments_student_id_idempotency_key_key ON public.penalty_payments USING btree (student_id, idempotency_key)`
- `CREATE INDEX penalty_payments_student_idx ON public.penalty_payments USING btree (student_id)`

**RLS policies**

- `penalty_payments_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('payments.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'payments.verify'::text) OR private.has_org_permission(organization_id, 'penalties.view'::text))`


## penalty_resolutions

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `assessment_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `resolution_type` | text | yes |  |
| `status` | text | yes | 'selected'::text |
| `selected_at` | timestamp with time zone | yes | now() |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `penalty_resolutions_not_self_chk` CHECK: `CHECK (((verified_by IS NULL) OR (verified_by <> student_id)))`
- `penalty_resolutions_resolution_type_check` CHECK: `CHECK ((resolution_type = ANY (ARRAY['community_service'::text, 'payment'::text])))`
- `penalty_resolutions_status_check` CHECK: `CHECK ((status = ANY (ARRAY['selected'::text, 'submitted'::text, 'verified'::text, 'rejected'::text, 'cancelled'::text])))`
- `penalty_resolutions_assessment_id_fkey` FOREIGN KEY: `FOREIGN KEY (assessment_id) REFERENCES penalty_assessments(id) ON DELETE CASCADE`
- `penalty_resolutions_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `penalty_resolutions_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `penalty_resolutions_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE UNIQUE INDEX penalty_resolutions_one_live_idx ON public.penalty_resolutions USING btree (assessment_id) WHERE (status = ANY (ARRAY['selected'::text, 'submitted'::text, 'verified'::text]))`

**RLS policies**

- `penalty_resolutions_read` (SELECT): `(EXISTS ( SELECT 1
   FROM penalty_assessments a
  WHERE (a.id = penalty_resolutions.assessment_id)))`


## permissions

| Column | Type | Not null | Default |
|---|---|---|---|
| `code` | text | yes |  |
| `description` | text | yes |  |

**Constraints**

- `permissions_code_check` CHECK: `CHECK ((code ~ '^[a-z_]+\.[a-z_]+$'::text))`
- `permissions_pkey` PRIMARY KEY: `PRIMARY KEY (code)`

**RLS policies**

- `permissions_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## position_permissions

| Column | Type | Not null | Default |
|---|---|---|---|
| `position_code` | text | yes |  |
| `permission_code` | text | yes |  |

**Constraints**

- `position_permissions_permission_code_fkey` FOREIGN KEY: `FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE`
- `position_permissions_position_code_fkey` FOREIGN KEY: `FOREIGN KEY (position_code) REFERENCES positions(code) ON DELETE CASCADE`
- `position_permissions_pkey` PRIMARY KEY: `PRIMARY KEY (position_code, permission_code)`

**RLS policies**

- `position_permissions_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## positions

| Column | Type | Not null | Default |
|---|---|---|---|
| `code` | text | yes |  |
| `scope` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `positions_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `positions_scope_check` CHECK: `CHECK ((scope = ANY (ARRAY['organization'::text, 'office'::text, 'academic'::text])))`
- `positions_pkey` PRIMARY KEY: `PRIMARY KEY (code)`

**RLS policies**

- `positions_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## profiles

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes |  |
| `email` | text | yes |  |
| `full_name` | text | yes | ''::text |
| `phone` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `profiles_id_fkey` FOREIGN KEY: `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `profiles_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE UNIQUE INDEX profiles_email_lower_idx ON public.profiles USING btree (lower(email))`

**RLS policies**

- `profiles_read` (SELECT): `(private.can_view_student(id) OR (id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission))`


## programs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `department_id` | uuid |  |  |
| `department_organization_id` | uuid |  |  |
| `organization_mapping_status` | text | yes | 'unconfirmed'::text |
| `organization_mapping_notes` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `programs_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `programs_confirmed_mapping_chk` CHECK: `CHECK (((organization_mapping_status = 'unconfirmed'::text) OR (department_organization_id IS NOT NULL)))`
- `programs_organization_mapping_status_check` CHECK: `CHECK ((organization_mapping_status = ANY (ARRAY['confirmed'::text, 'unconfirmed'::text])))`
- `programs_department_id_fkey` FOREIGN KEY: `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL`
- `programs_department_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (department_organization_id) REFERENCES organizations(id) ON DELETE SET NULL`
- `programs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `programs_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX programs_code_key ON public.programs USING btree (code)`
- `CREATE INDEX programs_department_idx ON public.programs USING btree (department_id)`
- `CREATE INDEX programs_department_org_idx ON public.programs USING btree (department_organization_id)`

**RLS policies**

- `programs_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## queue_events

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `ticket_id` | uuid | yes |  |
| `event_type` | text | yes |  |
| `from_status` | text |  |  |
| `to_status` | text | yes |  |
| `actor_id` | uuid |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `queue_events_event_type_check` CHECK: `CHECK ((event_type = ANY (ARRAY['reserved'::text, 'checked_in'::text, 'called'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text, 'rescheduled'::text])))`
- `queue_events_actor_id_fkey` FOREIGN KEY: `FOREIGN KEY (actor_id) REFERENCES profiles(id)`
- `queue_events_ticket_id_fkey` FOREIGN KEY: `FOREIGN KEY (ticket_id) REFERENCES queue_tickets(id) ON DELETE CASCADE`
- `queue_events_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX queue_events_ticket_idx ON public.queue_events USING btree (ticket_id, created_at)`

**RLS policies**

- `queue_events_read` (SELECT): `(EXISTS ( SELECT 1
   FROM queue_tickets t
  WHERE (t.id = queue_events.ticket_id)))`


## queue_schedules

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `service_id` | uuid | yes |  |
| `day_of_week` | smallint | yes |  |
| `start_time` | time without time zone | yes |  |
| `end_time` | time without time zone | yes |  |
| `slot_minutes` | integer | yes |  |
| `capacity_per_slot` | integer | yes |  |
| `effective_from` | date | yes |  |
| `effective_until` | date |  |  |
| `is_active` | boolean | yes | true |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `queue_schedules_capacity_per_slot_check` CHECK: `CHECK (((capacity_per_slot >= 1) AND (capacity_per_slot <= 500)))`
- `queue_schedules_dates_chk` CHECK: `CHECK (((effective_until IS NULL) OR (effective_until >= effective_from)))`
- `queue_schedules_day_of_week_check` CHECK: `CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))`
- `queue_schedules_slot_minutes_check` CHECK: `CHECK (((slot_minutes >= 5) AND (slot_minutes <= 240)))`
- `queue_schedules_times_chk` CHECK: `CHECK ((end_time > start_time))`
- `queue_schedules_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `queue_schedules_service_id_fkey` FOREIGN KEY: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- `queue_schedules_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX queue_schedules_service_idx ON public.queue_schedules USING btree (service_id) WHERE is_active`

**RLS policies**

- `queue_schedules_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## queue_slots

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `service_id` | uuid | yes |  |
| `schedule_id` | uuid |  |  |
| `slot_date` | date | yes |  |
| `start_time` | time without time zone | yes |  |
| `end_time` | time without time zone | yes |  |
| `capacity` | integer | yes |  |
| `reserved_count` | integer | yes | 0 |
| `last_queue_number` | integer | yes | 0 |
| `status` | text | yes | 'open'::text |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `queue_slots_capacity_check` CHECK: `CHECK ((capacity > 0))`
- `queue_slots_capacity_chk` CHECK: `CHECK (((reserved_count >= 0) AND (reserved_count <= capacity)))`
- `queue_slots_status_check` CHECK: `CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text])))`
- `queue_slots_times_chk` CHECK: `CHECK ((end_time > start_time))`
- `queue_slots_schedule_id_fkey` FOREIGN KEY: `FOREIGN KEY (schedule_id) REFERENCES queue_schedules(id) ON DELETE SET NULL`
- `queue_slots_service_id_fkey` FOREIGN KEY: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- `queue_slots_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `queue_slots_service_id_slot_date_start_time_key` UNIQUE: `UNIQUE (service_id, slot_date, start_time)`

**Indexes**

- `CREATE INDEX queue_slots_date_idx ON public.queue_slots USING btree (slot_date, service_id)`
- `CREATE UNIQUE INDEX queue_slots_service_id_slot_date_start_time_key ON public.queue_slots USING btree (service_id, slot_date, start_time)`

**RLS policies**

- `queue_slots_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## queue_tickets

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `slot_id` | uuid | yes |  |
| `service_id` | uuid | yes |  |
| `office_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `queue_number` | integer | yes |  |
| `status` | text | yes | 'reserved'::text |
| `reserved_at` | timestamp with time zone | yes | now() |
| `checked_in_at` | timestamp with time zone |  |  |
| `called_at` | timestamp with time zone |  |  |
| `served_by` | uuid |  |  |
| `completed_at` | timestamp with time zone |  |  |
| `cancelled_at` | timestamp with time zone |  |  |
| `cancelled_by` | uuid |  |  |
| `cancel_reason` | text |  |  |
| `rescheduled_from_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `queue_tickets_queue_number_check` CHECK: `CHECK ((queue_number > 0))`
- `queue_tickets_status_check` CHECK: `CHECK ((status = ANY (ARRAY['reserved'::text, 'checked_in'::text, 'serving'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text])))`
- `queue_tickets_cancelled_by_fkey` FOREIGN KEY: `FOREIGN KEY (cancelled_by) REFERENCES profiles(id)`
- `queue_tickets_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id)`
- `queue_tickets_rescheduled_from_id_fkey` FOREIGN KEY: `FOREIGN KEY (rescheduled_from_id) REFERENCES queue_tickets(id)`
- `queue_tickets_served_by_fkey` FOREIGN KEY: `FOREIGN KEY (served_by) REFERENCES profiles(id)`
- `queue_tickets_service_id_fkey` FOREIGN KEY: `FOREIGN KEY (service_id) REFERENCES services(id)`
- `queue_tickets_slot_id_fkey` FOREIGN KEY: `FOREIGN KEY (slot_id) REFERENCES queue_slots(id)`
- `queue_tickets_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id) ON DELETE CASCADE`
- `queue_tickets_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `queue_tickets_slot_id_queue_number_key` UNIQUE: `UNIQUE (slot_id, queue_number)`

**Indexes**

- `CREATE INDEX queue_tickets_office_idx ON public.queue_tickets USING btree (office_id, status)`
- `CREATE UNIQUE INDEX queue_tickets_one_live_per_slot_idx ON public.queue_tickets USING btree (slot_id, student_id) WHERE (status = ANY (ARRAY['reserved'::text, 'checked_in'::text, 'serving'::text]))`
- `CREATE UNIQUE INDEX queue_tickets_slot_id_queue_number_key ON public.queue_tickets USING btree (slot_id, queue_number)`
- `CREATE INDEX queue_tickets_student_idx ON public.queue_tickets USING btree (student_id, status)`

**RLS policies**

- `queue_tickets_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_office_permission(office_id, 'queue.manage'::text))`


## receipt_obligations

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `amount` | numeric(10,2) | yes |  |
| `applicability` | text | yes |  |
| `applicability_confirmed` | boolean | yes | false |
| `is_active` | boolean | yes | true |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `receipt_obligations_amount_check` CHECK: `CHECK ((amount > (0)::numeric))`
- `receipt_obligations_applicability_check` CHECK: `CHECK ((applicability = ANY (ARRAY['all_students'::text, 'department_members'::text, 'club_members'::text])))`
- `receipt_obligations_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `receipt_obligations_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `receipt_obligations_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `receipt_obligations_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `receipt_obligations_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `receipt_obligations_organization_id_academic_year_id_code_key` UNIQUE: `UNIQUE (organization_id, academic_year_id, code)`

**Indexes**

- `CREATE INDEX receipt_obligations_ay_idx ON public.receipt_obligations USING btree (academic_year_id) WHERE is_active`
- `CREATE UNIQUE INDEX receipt_obligations_organization_id_academic_year_id_code_key ON public.receipt_obligations USING btree (organization_id, academic_year_id, code)`

**RLS policies**

- `receipt_obligations_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## receipt_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `receipt_number` | text | yes | ('OR-'::text \|\| lpad((nextval('receipt_number_seq'::regclass))::text, 8, '0'::text)) |
| `obligation_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `amount` | numeric(10,2) | yes |  |
| `source` | text | yes |  |
| `batch_item_id` | uuid |  |  |
| `status` | text | yes | 'pending_verification'::text |
| `recorded_by` | uuid | yes |  |
| `recorded_at` | timestamp with time zone | yes | now() |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `receipt_records_amount_check` CHECK: `CHECK ((amount > (0)::numeric))`
- `receipt_records_not_self_verified_chk` CHECK: `CHECK (((verified_by IS NULL) OR (verified_by <> student_id)))`
- `receipt_records_source_check` CHECK: `CHECK ((source = ANY (ARRAY['individual'::text, 'batch'::text])))`
- `receipt_records_source_chk` CHECK: `CHECK (((source = 'batch'::text) = (batch_item_id IS NOT NULL)))`
- `receipt_records_status_check` CHECK: `CHECK ((status = ANY (ARRAY['pending_verification'::text, 'verified'::text, 'rejected'::text, 'void'::text])))`
- `receipt_records_verified_fields_chk` CHECK: `CHECK (((status <> 'verified'::text) OR ((verified_by IS NOT NULL) AND (verified_at IS NOT NULL))))`
- `receipt_records_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `receipt_records_batch_item_id_fkey` FOREIGN KEY: `FOREIGN KEY (batch_item_id) REFERENCES remittance_batch_items(id)`
- `receipt_records_obligation_id_fkey` FOREIGN KEY: `FOREIGN KEY (obligation_id) REFERENCES receipt_obligations(id)`
- `receipt_records_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `receipt_records_recorded_by_fkey` FOREIGN KEY: `FOREIGN KEY (recorded_by) REFERENCES profiles(id)`
- `receipt_records_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `receipt_records_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `receipt_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `receipt_records_batch_item_id_key` UNIQUE: `UNIQUE (batch_item_id)`
- `receipt_records_receipt_number_key` UNIQUE: `UNIQUE (receipt_number)`

**Indexes**

- `CREATE UNIQUE INDEX receipt_records_batch_item_id_key ON public.receipt_records USING btree (batch_item_id)`
- `CREATE UNIQUE INDEX receipt_records_one_live_idx ON public.receipt_records USING btree (obligation_id, student_id) WHERE (status = ANY (ARRAY['pending_verification'::text, 'verified'::text]))`
- `CREATE INDEX receipt_records_org_idx ON public.receipt_records USING btree (organization_id, status)`
- `CREATE UNIQUE INDEX receipt_records_receipt_number_key ON public.receipt_records USING btree (receipt_number)`
- `CREATE INDEX receipt_records_student_idx ON public.receipt_records USING btree (student_id, academic_year_id)`

**RLS policies**

- `receipt_records_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'receipts.view'::text))`


## receipt_verifications

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `receipt_record_id` | uuid | yes |  |
| `verifier_id` | uuid | yes |  |
| `decision` | text | yes |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `receipt_verifications_decision_check` CHECK: `CHECK ((decision = ANY (ARRAY['verified'::text, 'rejected'::text, 'voided'::text])))`
- `receipt_verifications_receipt_record_id_fkey` FOREIGN KEY: `FOREIGN KEY (receipt_record_id) REFERENCES receipt_records(id) ON DELETE CASCADE`
- `receipt_verifications_verifier_id_fkey` FOREIGN KEY: `FOREIGN KEY (verifier_id) REFERENCES profiles(id)`
- `receipt_verifications_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX receipt_verifications_receipt_idx ON public.receipt_verifications USING btree (receipt_record_id)`

**RLS policies**

- `receipt_verifications_read` (SELECT): `(EXISTS ( SELECT 1
   FROM receipt_records r
  WHERE (r.id = receipt_verifications.receipt_record_id)))`


## remittance_batch_items

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `batch_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `amount` | numeric(10,2) | yes |  |
| `status` | text | yes | 'pending'::text |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `rejection_reason` | text |  |  |
| `receipt_record_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `batch_items_not_self_verified_chk` CHECK: `CHECK (((verified_by IS NULL) OR (verified_by <> student_id)))`
- `batch_items_rejection_reason_chk` CHECK: `CHECK (((status <> 'rejected'::text) OR (rejection_reason IS NOT NULL)))`
- `remittance_batch_items_amount_check` CHECK: `CHECK ((amount > (0)::numeric))`
- `remittance_batch_items_status_check` CHECK: `CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))`
- `remittance_batch_items_batch_id_fkey` FOREIGN KEY: `FOREIGN KEY (batch_id) REFERENCES remittance_batches(id) ON DELETE CASCADE`
- `remittance_batch_items_receipt_fk` FOREIGN KEY: `FOREIGN KEY (receipt_record_id) REFERENCES receipt_records(id)`
- `remittance_batch_items_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `remittance_batch_items_verified_by_fkey` FOREIGN KEY: `FOREIGN KEY (verified_by) REFERENCES profiles(id)`
- `remittance_batch_items_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `remittance_batch_items_batch_id_student_id_key` UNIQUE: `UNIQUE (batch_id, student_id)`

**Indexes**

- `CREATE UNIQUE INDEX remittance_batch_items_batch_id_student_id_key ON public.remittance_batch_items USING btree (batch_id, student_id)`
- `CREATE INDEX remittance_batch_items_student_idx ON public.remittance_batch_items USING btree (student_id)`

**RLS policies**

- `remittance_batch_items_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM remittance_batches b
  WHERE (b.id = remittance_batch_items.batch_id))))`


## remittance_batches

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `batch_number` | text | yes | ('RB-'::text \|\| lpad((nextval('remittance_batch_number_seq'::regclass))::text, 7, '0'::text)) |
| `obligation_id` | uuid | yes |  |
| `organization_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `class_officer_id` | uuid | yes |  |
| `program_id` | uuid |  |  |
| `section` | text |  |  |
| `declared_total` | numeric(12,2) | yes |  |
| `items_total` | numeric(12,2) | yes | 0 |
| `received_total` | numeric(12,2) |  |  |
| `status` | text | yes | 'draft'::text |
| `submitted_at` | timestamp with time zone |  |  |
| `review_started_at` | timestamp with time zone |  |  |
| `reviewed_by` | uuid |  |  |
| `completed_at` | timestamp with time zone |  |  |
| `return_reason` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `remittance_batches_declared_total_check` CHECK: `CHECK ((declared_total >= (0)::numeric))`
- `remittance_batches_received_total_check` CHECK: `CHECK ((received_total >= (0)::numeric))`
- `remittance_batches_status_check` CHECK: `CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'completed'::text, 'returned'::text])))`
- `remittance_batches_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `remittance_batches_class_officer_id_fkey` FOREIGN KEY: `FOREIGN KEY (class_officer_id) REFERENCES profiles(id)`
- `remittance_batches_obligation_id_fkey` FOREIGN KEY: `FOREIGN KEY (obligation_id) REFERENCES receipt_obligations(id)`
- `remittance_batches_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `remittance_batches_program_id_fkey` FOREIGN KEY: `FOREIGN KEY (program_id) REFERENCES programs(id)`
- `remittance_batches_reviewed_by_fkey` FOREIGN KEY: `FOREIGN KEY (reviewed_by) REFERENCES profiles(id)`
- `remittance_batches_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `remittance_batches_batch_number_key` UNIQUE: `UNIQUE (batch_number)`

**Indexes**

- `CREATE UNIQUE INDEX remittance_batches_batch_number_key ON public.remittance_batches USING btree (batch_number)`
- `CREATE INDEX remittance_batches_officer_idx ON public.remittance_batches USING btree (class_officer_id)`
- `CREATE INDEX remittance_batches_org_idx ON public.remittance_batches USING btree (organization_id, status)`

**RLS policies**

- `remittance_batches_read` (SELECT): `((class_officer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'remittance.review'::text))`


## request_documents

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `request_id` | uuid | yes |  |
| `storage_bucket` | text | yes | 'request-documents'::text |
| `storage_path` | text | yes |  |
| `file_name` | text | yes |  |
| `mime_type` | text | yes |  |
| `size_bytes` | integer | yes |  |
| `uploaded_by` | uuid | yes |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `request_documents_mime_type_check` CHECK: `CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])))`
- `request_documents_size_bytes_check` CHECK: `CHECK (((size_bytes > 0) AND (size_bytes <= 10485760)))`
- `request_documents_request_id_fkey` FOREIGN KEY: `FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE`
- `request_documents_uploaded_by_fkey` FOREIGN KEY: `FOREIGN KEY (uploaded_by) REFERENCES profiles(id)`
- `request_documents_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `request_documents_storage_path_key` UNIQUE: `UNIQUE (storage_path)`

**Indexes**

- `CREATE INDEX request_documents_request_idx ON public.request_documents USING btree (request_id)`
- `CREATE UNIQUE INDEX request_documents_storage_path_key ON public.request_documents USING btree (storage_path)`

**RLS policies**

- `request_documents_read` (SELECT): `(EXISTS ( SELECT 1
   FROM service_requests r
  WHERE (r.id = request_documents.request_id)))`


## request_status_history

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | bigint | yes |  |
| `request_id` | uuid | yes |  |
| `from_status` | text |  |  |
| `to_status` | text | yes |  |
| `changed_by` | uuid |  |  |
| `remarks` | text |  |  |
| `changed_at` | timestamp with time zone | yes | now() |

**Constraints**

- `request_status_history_changed_by_fkey` FOREIGN KEY: `FOREIGN KEY (changed_by) REFERENCES profiles(id)`
- `request_status_history_request_id_fkey` FOREIGN KEY: `FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE`
- `request_status_history_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX request_status_history_request_idx ON public.request_status_history USING btree (request_id, changed_at)`

**RLS policies**

- `request_status_history_read` (SELECT): `(EXISTS ( SELECT 1
   FROM service_requests r
  WHERE (r.id = request_status_history.request_id)))`


## role_permissions

| Column | Type | Not null | Default |
|---|---|---|---|
| `role` | text | yes |  |
| `permission_code` | text | yes |  |

**Constraints**

- `role_permissions_role_check` CHECK: `CHECK ((role = ANY (ARRAY['student'::text, 'office_staff'::text, 'administrator'::text, 'cashier'::text, 'department_head'::text])))`
- `role_permissions_permission_code_fkey` FOREIGN KEY: `FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE`
- `role_permissions_pkey` PRIMARY KEY: `PRIMARY KEY (role, permission_code)`

**RLS policies**

- `role_permissions_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## scheduled_jobs

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `job_type` | text | yes |  |
| `cron_expression` | text | yes |  |
| `parameters` | jsonb | yes | '{}'::jsonb |
| `is_enabled` | boolean | yes | false |
| `last_run_at` | timestamp with time zone |  |  |
| `last_status` | text |  |  |
| `last_error` | text |  |  |
| `run_count` | integer | yes | 0 |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `scheduled_jobs_code_check` CHECK: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `scheduled_jobs_cron_expression_check` CHECK: `CHECK ((cron_expression ~ '^\s*(\S+\s+){4}\S+\s*$'::text))`
- `scheduled_jobs_job_type_check` CHECK: `CHECK ((job_type = ANY (ARRAY['pending_request_reminders'::text, 'overdue_request_escalation'::text, 'clearance_deadline_reminders'::text, 'generate_queue_slots'::text, 'scheduled_report'::text, 'expire_public_ai_sessions'::text])))`
- `scheduled_jobs_last_status_check` CHECK: `CHECK ((last_status = ANY (ARRAY['succeeded'::text, 'failed'::text])))`
- `scheduled_jobs_parameters_check` CHECK: `CHECK ((jsonb_typeof(parameters) = 'object'::text))`
- `scheduled_jobs_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `scheduled_jobs_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `scheduled_jobs_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `scheduled_jobs_code_key` UNIQUE: `UNIQUE (code)`

**Indexes**

- `CREATE UNIQUE INDEX scheduled_jobs_code_key ON public.scheduled_jobs USING btree (code)`

**RLS policies**

- `scheduled_jobs_read` (SELECT): `( SELECT private.has_global_permission('automation.view'::text) AS has_global_permission)`


## service_locations

| Column | Type | Not null | Default |
|---|---|---|---|
| `service_id` | uuid | yes |  |
| `location_id` | uuid | yes |  |
| `is_primary` | boolean | yes | true |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `service_locations_location_id_fkey` FOREIGN KEY: `FOREIGN KEY (location_id) REFERENCES campus_locations(id) ON DELETE CASCADE`
- `service_locations_service_id_fkey` FOREIGN KEY: `FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE`
- `service_locations_pkey` PRIMARY KEY: `PRIMARY KEY (service_id, location_id)`

**Indexes**

- `CREATE INDEX service_locations_location_idx ON public.service_locations USING btree (location_id)`
- `CREATE UNIQUE INDEX service_locations_one_primary_idx ON public.service_locations USING btree (service_id) WHERE is_primary`

**RLS policies**

- `service_locations_read` (SELECT): `(EXISTS ( SELECT 1
   FROM campus_locations l
  WHERE (l.id = service_locations.location_id)))`


## service_requests

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `request_number` | text | yes | ('REQ-'::text \|\| lpad((nextval('service_request_number_seq'::regclass))::text, 7, '0'::text)) |
| `student_id` | uuid | yes |  |
| `service_id` | uuid | yes |  |
| `office_id` | uuid | yes |  |
| `purpose` | text | yes |  |
| `details` | text |  |  |
| `status` | text | yes | 'submitted'::text |
| `handled_by` | uuid |  |  |
| `remarks` | text |  |  |
| `submitted_at` | timestamp with time zone | yes | now() |
| `completed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |
| `due_at` | timestamp with time zone |  |  |
| `ai_suggested_category` | text |  |  |
| `ai_suggestion_confidence` | numeric(4,3) |  |  |
| `ai_suggested_at` | timestamp with time zone |  |  |

**Constraints**

- `service_requests_ai_suggestion_confidence_check` CHECK: `CHECK (((ai_suggestion_confidence >= (0)::numeric) AND (ai_suggestion_confidence <= (1)::numeric)))`
- `service_requests_purpose_check` CHECK: `CHECK ((length(TRIM(BOTH FROM purpose)) > 0))`
- `service_requests_status_check` CHECK: `CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'ready_for_release'::text, 'released'::text, 'rejected'::text, 'cancelled'::text])))`
- `service_requests_handled_by_fkey` FOREIGN KEY: `FOREIGN KEY (handled_by) REFERENCES profiles(id)`
- `service_requests_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id)`
- `service_requests_service_id_fkey` FOREIGN KEY: `FOREIGN KEY (service_id) REFERENCES services(id)`
- `service_requests_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id) ON DELETE CASCADE`
- `service_requests_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `service_requests_request_number_key` UNIQUE: `UNIQUE (request_number)`

**Indexes**

- `CREATE INDEX service_requests_office_status_idx ON public.service_requests USING btree (office_id, status)`
- `CREATE UNIQUE INDEX service_requests_request_number_key ON public.service_requests USING btree (request_number)`
- `CREATE INDEX service_requests_student_idx ON public.service_requests USING btree (student_id, created_at DESC)`

**RLS policies**

- `service_requests_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_office_permission(office_id, 'requests.manage'::text))`


## services

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `office_id` | uuid | yes |  |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `service_kind` | text | yes | 'queue'::text |
| `max_active_tickets_per_student` | integer | yes | 1 |
| `cancellation_cutoff_minutes` | integer | yes | 30 |
| `allow_reschedule` | boolean | yes | true |
| `required_documents` | text[] | yes | '{}'::text[] |
| `is_active` | boolean | yes | true |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |
| `target_processing_days` | integer |  |  |

**Constraints**

- `services_cancellation_cutoff_minutes_check` CHECK: `CHECK ((cancellation_cutoff_minutes >= 0))`
- `services_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `services_max_active_tickets_per_student_check` CHECK: `CHECK (((max_active_tickets_per_student >= 1) AND (max_active_tickets_per_student <= 10)))`
- `services_service_kind_check` CHECK: `CHECK ((service_kind = ANY (ARRAY['queue'::text, 'request'::text, 'both'::text])))`
- `services_target_processing_days_check` CHECK: `CHECK (((target_processing_days >= 1) AND (target_processing_days <= 365)))`
- `services_office_id_fkey` FOREIGN KEY: `FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE`
- `services_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `services_office_id_code_key` UNIQUE: `UNIQUE (office_id, code)`

**Indexes**

- `CREATE UNIQUE INDEX services_office_id_code_key ON public.services USING btree (office_id, code)`

**RLS policies**

- `services_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## student_clearances

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `clearance_number` | text | yes | ('CLR-'::text \|\| lpad((nextval('clearance_number_seq'::regclass))::text, 7, '0'::text)) |
| `student_id` | uuid | yes |  |
| `template_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `template_snapshot` | jsonb | yes |  |
| `status` | text | yes | 'in_progress'::text |
| `initiated_by` | uuid | yes |  |
| `initiated_at` | timestamp with time zone | yes | now() |
| `completed_at` | timestamp with time zone |  |  |
| `cancelled_by` | uuid |  |  |
| `cancelled_at` | timestamp with time zone |  |  |
| `cancel_reason` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |
| `due_date` | date |  |  |

**Constraints**

- `student_clearances_not_self_chk` CHECK: `CHECK ((initiated_by <> student_id))`
- `student_clearances_status_check` CHECK: `CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])))`
- `student_clearances_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `student_clearances_cancelled_by_fkey` FOREIGN KEY: `FOREIGN KEY (cancelled_by) REFERENCES profiles(id)`
- `student_clearances_initiated_by_fkey` FOREIGN KEY: `FOREIGN KEY (initiated_by) REFERENCES profiles(id)`
- `student_clearances_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `student_clearances_template_id_fkey` FOREIGN KEY: `FOREIGN KEY (template_id) REFERENCES clearance_templates(id)`
- `student_clearances_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `student_clearances_clearance_number_key` UNIQUE: `UNIQUE (clearance_number)`

**Indexes**

- `CREATE UNIQUE INDEX student_clearances_clearance_number_key ON public.student_clearances USING btree (clearance_number)`
- `CREATE UNIQUE INDEX student_clearances_one_live_idx ON public.student_clearances USING btree (student_id, template_id) WHERE (status <> 'cancelled'::text)`
- `CREATE INDEX student_clearances_status_idx ON public.student_clearances USING btree (academic_year_id, status)`

**RLS policies**

- `student_clearances_read` (SELECT): `private.can_view_clearance(id)`


## students

| Column | Type | Not null | Default |
|---|---|---|---|
| `profile_id` | uuid | yes |  |
| `student_number` | text | yes |  |
| `program_id` | uuid | yes |  |
| `year_level` | smallint | yes |  |
| `section` | text |  |  |
| `enrollment_status` | text | yes | 'enrolled'::text |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `students_enrollment_status_check` CHECK: `CHECK ((enrollment_status = ANY (ARRAY['enrolled'::text, 'not_enrolled'::text, 'graduated'::text, 'withdrawn'::text])))`
- `students_year_level_check` CHECK: `CHECK (((year_level >= 1) AND (year_level <= 6)))`
- `students_profile_id_fkey` FOREIGN KEY: `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `students_program_id_fkey` FOREIGN KEY: `FOREIGN KEY (program_id) REFERENCES programs(id)`
- `students_pkey` PRIMARY KEY: `PRIMARY KEY (profile_id)`
- `students_student_number_key` UNIQUE: `UNIQUE (student_number)`

**Indexes**

- `CREATE INDEX students_program_idx ON public.students USING btree (program_id, year_level, section)`
- `CREATE UNIQUE INDEX students_student_number_key ON public.students USING btree (student_number)`

**RLS policies**

- `students_read` (SELECT): `private.can_view_student(profile_id)`


## system_settings

| Column | Type | Not null | Default |
|---|---|---|---|
| `key` | text | yes |  |
| `value` | jsonb | yes |  |
| `description` | text | yes |  |
| `is_confirmed` | boolean | yes | false |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `system_settings_key_check` CHECK: `CHECK ((key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'::text))`
- `system_settings_updated_by_fkey` FOREIGN KEY: `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `system_settings_pkey` PRIMARY KEY: `PRIMARY KEY (key)`

**RLS policies**

- `system_settings_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## user_roles

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `user_id` | uuid | yes |  |
| `role` | text | yes |  |
| `granted_by` | uuid |  |  |
| `granted_at` | timestamp with time zone | yes | now() |

**Constraints**

- `user_roles_role_check` CHECK: `CHECK ((role = ANY (ARRAY['student'::text, 'office_staff'::text, 'administrator'::text, 'cashier'::text, 'department_head'::text])))`
- `user_roles_granted_by_fkey` FOREIGN KEY: `FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `user_roles_user_id_fkey` FOREIGN KEY: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`
- `user_roles_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `user_roles_user_id_role_key` UNIQUE: `UNIQUE (user_id, role)`

**Indexes**

- `CREATE INDEX user_roles_role_idx ON public.user_roles USING btree (role)`
- `CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role)`

**RLS policies**

- `user_roles_read` (SELECT): `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('users.manage'::text) AS has_global_permission))`


## violation_disputes

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `violation_record_id` | uuid | yes |  |
| `student_id` | uuid | yes |  |
| `reason` | text | yes |  |
| `record_status_before` | text | yes |  |
| `status` | text | yes | 'open'::text |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `violation_disputes_not_self_decided_chk` CHECK: `CHECK (((decided_by IS NULL) OR (decided_by <> student_id)))`
- `violation_disputes_reason_check` CHECK: `CHECK ((length(TRIM(BOTH FROM reason)) >= 10))`
- `violation_disputes_record_status_before_check` CHECK: `CHECK ((record_status_before = ANY (ARRAY['reported'::text, 'verified'::text])))`
- `violation_disputes_status_check` CHECK: `CHECK ((status = ANY (ARRAY['open'::text, 'upheld'::text, 'denied'::text])))`
- `violation_disputes_decided_by_fkey` FOREIGN KEY: `FOREIGN KEY (decided_by) REFERENCES profiles(id)`
- `violation_disputes_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `violation_disputes_violation_record_id_fkey` FOREIGN KEY: `FOREIGN KEY (violation_record_id) REFERENCES violation_records(id) ON DELETE CASCADE`
- `violation_disputes_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE UNIQUE INDEX violation_disputes_one_open_idx ON public.violation_disputes USING btree (violation_record_id) WHERE (status = 'open'::text)`

**RLS policies**

- `violation_disputes_read` (SELECT): `(EXISTS ( SELECT 1
   FROM violation_records v
  WHERE (v.id = violation_disputes.violation_record_id)))`


## violation_evidence

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `violation_record_id` | uuid | yes |  |
| `storage_path` | text | yes |  |
| `file_name` | text | yes |  |
| `mime_type` | text | yes |  |
| `size_bytes` | integer | yes |  |
| `uploaded_by` | uuid | yes |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `violation_evidence_mime_type_check` CHECK: `CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'application/pdf'::text])))`
- `violation_evidence_size_bytes_check` CHECK: `CHECK (((size_bytes > 0) AND (size_bytes <= 5242880)))`
- `violation_evidence_uploaded_by_fkey` FOREIGN KEY: `FOREIGN KEY (uploaded_by) REFERENCES profiles(id)`
- `violation_evidence_violation_record_id_fkey` FOREIGN KEY: `FOREIGN KEY (violation_record_id) REFERENCES violation_records(id) ON DELETE CASCADE`
- `violation_evidence_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `violation_evidence_storage_path_key` UNIQUE: `UNIQUE (storage_path)`

**Indexes**

- `CREATE INDEX violation_evidence_record_idx ON public.violation_evidence USING btree (violation_record_id)`
- `CREATE UNIQUE INDEX violation_evidence_storage_path_key ON public.violation_evidence USING btree (storage_path)`

**RLS policies**

- `violation_evidence_read` (SELECT): `(EXISTS ( SELECT 1
   FROM violation_records v
  WHERE (v.id = violation_evidence.violation_record_id)))`


## violation_policies

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `code` | text | yes |  |
| `name` | text | yes |  |
| `description` | text |  |  |
| `is_active` | boolean | yes | true |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `violation_policies_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `violation_policies_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `violation_policies_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`
- `violation_policies_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `violation_policies_organization_id_code_key` UNIQUE: `UNIQUE (organization_id, code)`

**Indexes**

- `CREATE UNIQUE INDEX violation_policies_organization_id_code_key ON public.violation_policies USING btree (organization_id, code)`

**RLS policies**

- `violation_policies_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## violation_policy_versions

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `policy_id` | uuid | yes |  |
| `version_number` | integer | yes |  |
| `academic_year_id` | uuid | yes |  |
| `calculation_type` | text | yes |  |
| `quantity_unit` | text |  |  |
| `quantity_per_violation` | integer |  |  |
| `hours_per_violation` | numeric(6,2) |  |  |
| `amount_per_violation` | numeric(10,2) |  |  |
| `allowed_resolutions` | text[] | yes | '{}'::text[] |
| `penalty_confirmed` | boolean | yes | false |
| `status` | text | yes | 'draft'::text |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `activated_at` | timestamp with time zone |  |  |
| `retired_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `policy_versions_confirmed_has_options_chk` CHECK: `CHECK (((NOT penalty_confirmed) OR (cardinality(allowed_resolutions) > 0)))`
- `policy_versions_payment_rate_chk` CHECK: `CHECK (((NOT ('payment'::text = ANY (allowed_resolutions))) OR (amount_per_violation IS NOT NULL)))`
- `policy_versions_per_violation_fields_chk` CHECK: `CHECK (((calculation_type <> 'per_violation'::text) OR ((quantity_unit IS NULL) AND (quantity_per_violation IS NULL))))`
- `policy_versions_service_rate_chk` CHECK: `CHECK (((NOT ('community_service'::text = ANY (allowed_resolutions))) OR (hours_per_violation IS NOT NULL)))`
- `policy_versions_threshold_fields_chk` CHECK: `CHECK (((calculation_type <> 'quantity_threshold'::text) OR ((quantity_unit IS NOT NULL) AND (quantity_per_violation IS NOT NULL))))`
- `violation_policy_versions_allowed_resolutions_check` CHECK: `CHECK ((allowed_resolutions <@ ARRAY['community_service'::text, 'payment'::text]))`
- `violation_policy_versions_amount_per_violation_check` CHECK: `CHECK ((amount_per_violation >= (0)::numeric))`
- `violation_policy_versions_calculation_type_check` CHECK: `CHECK ((calculation_type = ANY (ARRAY['per_violation'::text, 'quantity_threshold'::text])))`
- `violation_policy_versions_hours_per_violation_check` CHECK: `CHECK ((hours_per_violation >= (0)::numeric))`
- `violation_policy_versions_quantity_per_violation_check` CHECK: `CHECK ((quantity_per_violation > 0))`
- `violation_policy_versions_status_check` CHECK: `CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))`
- `violation_policy_versions_version_number_check` CHECK: `CHECK ((version_number > 0))`
- `violation_policy_versions_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `violation_policy_versions_created_by_fkey` FOREIGN KEY: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`
- `violation_policy_versions_policy_id_fkey` FOREIGN KEY: `FOREIGN KEY (policy_id) REFERENCES violation_policies(id) ON DELETE RESTRICT`
- `violation_policy_versions_pkey` PRIMARY KEY: `PRIMARY KEY (id)`
- `violation_policy_versions_policy_id_version_number_key` UNIQUE: `UNIQUE (policy_id, version_number)`

**Indexes**

- `CREATE UNIQUE INDEX violation_policy_versions_one_active_idx ON public.violation_policy_versions USING btree (policy_id, academic_year_id) WHERE (status = 'active'::text)`
- `CREATE UNIQUE INDEX violation_policy_versions_policy_id_version_number_key ON public.violation_policy_versions USING btree (policy_id, version_number)`

**RLS policies**

- `violation_policy_versions_read_signed_in` (SELECT): `( SELECT private.is_active_user() AS is_active_user)`


## violation_records

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `organization_id` | uuid | yes |  |
| `policy_id` | uuid | yes |  |
| `policy_version_id` | uuid | yes |  |
| `calculation_type` | text | yes |  |
| `event_id` | uuid |  |  |
| `student_id` | uuid | yes |  |
| `academic_year_id` | uuid | yes |  |
| `reported_by` | uuid | yes |  |
| `category` | text |  |  |
| `description` | text | yes |  |
| `quantity` | integer |  |  |
| `violation_count` | integer |  |  |
| `occurred_on` | date | yes | CURRENT_DATE |
| `status` | text | yes | 'reported'::text |
| `reviewed_by` | uuid |  |  |
| `reviewed_at` | timestamp with time zone |  |  |
| `assessment_id` | uuid |  |  |
| `created_at` | timestamp with time zone | yes | now() |
| `updated_at` | timestamp with time zone | yes | now() |

**Constraints**

- `violation_records_calculation_type_check` CHECK: `CHECK ((calculation_type = ANY (ARRAY['per_violation'::text, 'quantity_threshold'::text])))`
- `violation_records_description_check` CHECK: `CHECK ((length(TRIM(BOTH FROM description)) > 0))`
- `violation_records_not_self_reported_chk` CHECK: `CHECK ((reported_by <> student_id))`
- `violation_records_not_self_reviewed_chk` CHECK: `CHECK (((reviewed_by IS NULL) OR (reviewed_by <> student_id)))`
- `violation_records_quantity_check` CHECK: `CHECK ((quantity >= 0))`
- `violation_records_status_check` CHECK: `CHECK ((status = ANY (ARRAY['reported'::text, 'verified'::text, 'rejected'::text, 'disputed'::text, 'voided'::text])))`
- `violation_records_threshold_fields_chk` CHECK: `CHECK (((calculation_type <> 'quantity_threshold'::text) OR ((quantity IS NOT NULL) AND (event_id IS NOT NULL))))`
- `violation_records_verified_count_chk` CHECK: `CHECK (((status <> 'verified'::text) OR (violation_count IS NOT NULL)))`
- `violation_records_violation_count_check` CHECK: `CHECK ((violation_count >= 0))`
- `violation_records_academic_year_id_fkey` FOREIGN KEY: `FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)`
- `violation_records_assessment_fk` FOREIGN KEY: `FOREIGN KEY (assessment_id) REFERENCES penalty_assessments(id)`
- `violation_records_event_id_fkey` FOREIGN KEY: `FOREIGN KEY (event_id) REFERENCES organization_events(id)`
- `violation_records_organization_id_fkey` FOREIGN KEY: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `violation_records_policy_id_fkey` FOREIGN KEY: `FOREIGN KEY (policy_id) REFERENCES violation_policies(id)`
- `violation_records_policy_version_id_fkey` FOREIGN KEY: `FOREIGN KEY (policy_version_id) REFERENCES violation_policy_versions(id)`
- `violation_records_reported_by_fkey` FOREIGN KEY: `FOREIGN KEY (reported_by) REFERENCES profiles(id)`
- `violation_records_reviewed_by_fkey` FOREIGN KEY: `FOREIGN KEY (reviewed_by) REFERENCES profiles(id)`
- `violation_records_student_id_fkey` FOREIGN KEY: `FOREIGN KEY (student_id) REFERENCES students(profile_id)`
- `violation_records_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX violation_records_assessment_idx ON public.violation_records USING btree (assessment_id)`
- `CREATE UNIQUE INDEX violation_records_one_tally_per_event_idx ON public.violation_records USING btree (policy_id, student_id, event_id) WHERE ((calculation_type = 'quantity_threshold'::text) AND (status <> ALL (ARRAY['rejected'::text, 'voided'::text])))`
- `CREATE INDEX violation_records_org_status_idx ON public.violation_records USING btree (organization_id, status)`
- `CREATE INDEX violation_records_student_idx ON public.violation_records USING btree (student_id, organization_id, academic_year_id)`

**RLS policies**

- `violation_records_read` (SELECT): `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_global_permission('records.view_all'::text) AS has_global_permission) OR private.has_org_permission(organization_id, 'violations.view'::text))`


## violation_reviews

| Column | Type | Not null | Default |
|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() |
| `violation_record_id` | uuid | yes |  |
| `reviewer_id` | uuid | yes |  |
| `decision` | text | yes |  |
| `computed_violation_count` | integer |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | yes | now() |

**Constraints**

- `violation_reviews_decision_check` CHECK: `CHECK ((decision = ANY (ARRAY['verified'::text, 'rejected'::text, 'dispute_upheld'::text, 'dispute_denied'::text])))`
- `violation_reviews_reviewer_id_fkey` FOREIGN KEY: `FOREIGN KEY (reviewer_id) REFERENCES profiles(id)`
- `violation_reviews_violation_record_id_fkey` FOREIGN KEY: `FOREIGN KEY (violation_record_id) REFERENCES violation_records(id) ON DELETE CASCADE`
- `violation_reviews_pkey` PRIMARY KEY: `PRIMARY KEY (id)`

**Indexes**

- `CREATE INDEX violation_reviews_record_idx ON public.violation_reviews USING btree (violation_record_id)`

**RLS policies**

- `violation_reviews_read` (SELECT): `(EXISTS ( SELECT 1
   FROM violation_records v
  WHERE (v.id = violation_reviews.violation_record_id)))`
