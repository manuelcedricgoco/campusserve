# Project overview

**CampusServe** is a web system for Occidental Mindoro State University, Mamburao Campus. It moves the
everyday paper-and-hallway work of students, student organizations and offices online: queue reservations,
document requests, organization receipts and class remittances, Guidance and Library requirements,
violations and penalties, online penalty payments, and the student clearance. It keeps each organization's
and office's authority intact.

## Who uses it

| People | What they do in CampusServe |
|---|---|
| Students | Reserve queue slots, request documents, follow their clearance, see receipts, settle or dispute penalties, ask the assistant |
| Organization officers (SSG, department organizations, clubs) | Record and verify receipts, run class remittances, report and review violations, assess penalties, verify payments and community service, sign clearances |
| Office staff (SAS, Guidance, Library, Registrar, Cashier) | Run the queue board, process requests, confirm Guidance and Library requirements, start clearances, sign, see reports |
| Program and department heads | Sign clearances, see reports |
| Administrators | Accounts and positions, services and schedules, policies and fees, clearance templates, assistant knowledge, automation, campus map data, audit log |
| Visitors | Read services, the campus map and public answers without an account |

## How it is built

- **Database (Supabase Postgres):** all records, every business rule, Row Level Security, audit log,
  workflow functions, AI retrieval (pgvector), GIS (PostGIS, pgRouting), scheduled automation (pg_cron).
- **Backend (Node.js, Express, TypeScript):** a REST API at `/api/v1`. It verifies the Supabase session and runs
  each request as that user, so the database rules apply. It also holds the provider adapters (payments, AI,
  storage), webhooks and the background worker. See [API_DOCUMENTATION.md](API_DOCUMENTATION.md).
- **Frontend (React, Vite, TypeScript, Tailwind):** a responsive site with a public area and six workspaces
  (student, organization, office, department, cashier, administration). It shows what each person can do;
  the server decides.

Details: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md).

## Principles

- The school's real process, configured in data: the clearance order, policies and fees live in the
  database and can change without code changes.
- Nothing counts until the responsible person verifies it: receipts, violations, community service and
  payments. A batch total never pays anyone; a screenshot is never proof of payment.
- No invented facts: no made-up coordinates, payment endpoints, policies or AI answers.
- The assistant informs; people decide.

## Phases

1. Database (done) and its AI, automation and GIS extension (done).
2. Backend and frontend (this phase).
3. Integration, QA and security testing.
4. Deployment (Vercel, Render, Supabase) and final documentation.
