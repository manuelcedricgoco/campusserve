# CampusServe

A web-based campus-wide digital transaction, online queueing and clearance management system: student
transactions, queue reservations, organization receipts and batch remittance, Guidance and Library
requirements, violations and penalties, digital payments, and student clearance — following the school's
actual process and preserving each organization's and office's authority.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Supabase database: schema, business rules, RLS, seed, tests, documentation | **Done** — applied to Supabase project `iafcgxwckoelhmfaddzp` and verified |
| 1 (extension) | AI, automation and advanced GIS database foundation | **Done** — migrations 011–016 applied and verified (274 SQL checks locally; new suites also live) |
| 2–3 fixes | Migrations 017–020 (error helper grant, inactive sign-ups, visibility performance, remittance helper) | **Applied live and verified** |
| 2 | Backend (Node.js, Express, TypeScript): 161 REST endpoints, worker | **Built and tested locally** (80 integration tests). Not deployed |
| 2 | Frontend (React, Vite, TypeScript, Tailwind, Radix): public site and six workspaces | **Built and tested locally** (unit tests, 45-page browser and accessibility sweep). Not deployed |
| 3 | Integration, QA, security testing | **Done**: see [QA_AND_SECURITY_REPORT.md](Docs/QA_AND_SECURITY_REPORT.md). Migrations 018–020 applied live |
| 4 | Deployment (Vercel, Render, Supabase) | Not started |
| — | GCash / Maya / LANDBANK | **Not integrated.** The database is prepared; no provider is enabled. |
| — | AI provider | **None connected.** Mock provider only. |
| — | Campus geographic data | **None entered.** Campus row exists without coordinates (unverified). |

## Structure

```
CampusServe/
├── Backend/      REST API and worker — see Docs/API_DOCUMENTATION.md
├── Frontend/     web app
├── Database/     migrations, seed, tests, tools — see Database/README.md
├── Docs/         documentation
├── README.md
├── .gitignore
└── .env.example
```

## Documentation

| Document | |
|---|---|
| [DATABASE_SCHEMA.md](Docs/DATABASE_SCHEMA.md) | design, tables by domain, ERDs (Mermaid), integrity rules, functions |
| [DATABASE_TABLE_REFERENCE.md](Docs/DATABASE_TABLE_REFERENCE.md) | generated column / constraint / index / policy reference |
| [USER_ROLES_AND_PERMISSIONS.md](Docs/USER_ROLES_AND_PERMISSIONS.md) | roles, positions, permission matrix, RLS by table |
| [CLEARANCE_WORKFLOW.md](Docs/CLEARANCE_WORKFLOW.md) | the clearance process and how it is configured |
| [VIOLATION_POLICIES.md](Docs/VIOLATION_POLICIES.md) | SSG and PADC rules, versions, what is unconfirmed |
| [PAYMENT_WORKFLOW.md](Docs/PAYMENT_WORKFLOW.md) | payment records, webhooks, verification (no live provider) |
| [SYSTEM_ARCHITECTURE.md](Docs/SYSTEM_ARCHITECTURE.md) | components, trust boundaries, where rules live |
| [AI_MODULE.md](Docs/AI_MODULE.md) | AI assistant / RAG foundation |
| [AUTOMATION_MODULE.md](Docs/AUTOMATION_MODULE.md) | event-driven and scheduled automation |
| [GIS_MODULE.md](Docs/GIS_MODULE.md) · [GIS_DATA_GUIDE.md](Docs/GIS_DATA_GUIDE.md) | campus GIS and how to enter verified data |
| [PHASE1_EXTENSION_IMPACT_ASSESSMENT.md](Docs/PHASE1_EXTENSION_IMPACT_ASSESSMENT.md) | the authorized extension plan |
| [PROJECT_OVERVIEW.md](Docs/PROJECT_OVERVIEW.md) | what CampusServe is and who uses it |
| [REQUIREMENTS.md](Docs/REQUIREMENTS.md) | requirements and their current status |
| [API_DOCUMENTATION.md](Docs/API_DOCUMENTATION.md) | REST API: auth, errors, all endpoints |
| [QA_AND_SECURITY_REPORT.md](Docs/QA_AND_SECURITY_REPORT.md) | Phase 3 findings, fixes and test results |
| [INSTALLATION_GUIDE.md](Docs/INSTALLATION_GUIDE.md) | Supabase setup, running the backend and frontend locally |
| [TESTING_GUIDE.md](Docs/TESTING_GUIDE.md) | running and reading the tests |
| [CHANGELOG.md](Docs/CHANGELOG.md) | migration history, advisor findings |

Still to write in Phase 4: `DEPLOYMENT_GUIDE.md`.

## Open items that need the school's confirmation

CBAM organization mapping · PADC penalty amount and options · JOES, JFMS and YMO violation policies ·
real receipt amounts and club receipt applicability · full program names · whether the library receipt
must come before the library slip · academic year dates · verified campus boundary, buildings, locations,
walking paths and accessibility · official policy documents for the knowledge base · the approved AI provider ·
service processing times and clearance deadlines.
