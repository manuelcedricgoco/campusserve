# CampusServe database table reference

Generated from the database by `Database/tools/generate_table_reference.sh`. Do not edit by hand.

55 tables in schema `public`, all with Row Level Security enabled.

- [academic_assignments](#academic_assignments)
- [academic_years](#academic_years)
- [audit_logs](#audit_logs)
- [clearance_approvals](#clearance_approvals)
- [clearance_history](#clearance_history)
- [clearance_requirement_status](#clearance_requirement_status)
- [clearance_requirements](#clearance_requirements)
- [clearance_steps](#clearance_steps)
- [clearance_templates](#clearance_templates)
- [clubs](#clubs)
- [community_service_records](#community_service_records)
- [departments](#departments)
- [guidance_records](#guidance_records)
- [library_records](#library_records)
- [notifications](#notifications)
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

**Constraints**

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

**Constraints**

- `services_cancellation_cutoff_minutes_check` CHECK: `CHECK ((cancellation_cutoff_minutes >= 0))`
- `services_code_check` CHECK: `CHECK ((code ~ '^[A-Z0-9_]+$'::text))`
- `services_max_active_tickets_per_student_check` CHECK: `CHECK (((max_active_tickets_per_student >= 1) AND (max_active_tickets_per_student <= 10)))`
- `services_service_kind_check` CHECK: `CHECK ((service_kind = ANY (ARRAY['queue'::text, 'request'::text, 'both'::text])))`
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
