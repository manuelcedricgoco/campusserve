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
| 2+ | Backend (Node.js, Express, TypeScript) | Not started — `Backend/` is empty |
| 2+ | Frontend (React, Vite, TypeScript, Tailwind, shadcn/ui) | Not started — `Frontend/` is empty |
| — | GCash / Maya / LANDBANK | **Not integrated.** The database is prepared; no provider is enabled. |
| — | AI provider | **None connected.** Mock provider only. |
| — | Campus geographic data | **None entered.** Campus row exists without coordinates (unverified). |

## Structure

```
CampusServe/
├── Backend/      (Phase 2)
├── Frontend/     (Phase 2)
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
| [INSTALLATION_GUIDE.md](Docs/INSTALLATION_GUIDE.md) | Supabase setup |
| [TESTING_GUIDE.md](Docs/TESTING_GUIDE.md) | running and reading the tests |
| [CHANGELOG.md](Docs/CHANGELOG.md) | migration history, advisor findings |

Still to write with the backend and frontend: `PROJECT_OVERVIEW.md`, `REQUIREMENTS.md`, `API_DOCUMENTATION.md`,
`DEPLOYMENT_GUIDE.md`.

## Open items that need the school's confirmation

CBAM organization mapping · PADC penalty amount and options · JOES, JFMS and YMO violation policies ·
real receipt amounts and club receipt applicability · full program names · whether the library receipt
must come before the library slip · academic year dates · verified campus boundary, buildings, locations,
walking paths and accessibility · official policy documents for the knowledge base · the approved AI provider ·
service processing times and clearance deadlines.
