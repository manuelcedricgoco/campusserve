# Step-by-step: run and test CampusServe on your computer

You will run the **backend** and **frontend** on your own computer, connected to your existing Supabase
project (**CampusServe**, ref `iafcgxwckoelhmfaddzp`). That project already has the full database, the
sample data and the 18 sample accounts. Plan about 30 minutes for setup.

> The steps that were verified from the development environment are marked ✅. The database role your SQL editor and
> the pooler connection use (`postgres`) was checked: it can run step 3d and the backend's per-request role switching.
> Two steps could not be
> run from there because they need your private keys or your computer's network: the backend's connection
> to your Supabase **database** (step 4) and **file uploads** to Supabase Storage. If either fails, see
> [Troubleshooting](#troubleshooting).

---

## 1. Install the tools (once)

| Tool | Version | Get it |
|---|---|---|
| Node.js | **22 LTS** (22.12 or newer) | https://nodejs.org (choose "LTS") |
| A browser | Chrome, Edge or Firefox | |
| A text editor | e.g. VS Code | https://code.visualstudio.com |

Check in a terminal (Windows: *PowerShell*; macOS: *Terminal*):

```bash
node -v
```

It should print `v22.something`.

## 2. Unzip the project

Unzip `CampusServe-full-system.zip` to a simple folder, e.g. `C:\CampusServe` or `~/CampusServe`.
You should see the folders `Backend`, `Frontend`, `Database` and `Docs`.

## 3. Prepare your Supabase project (dashboard: https://supabase.com/dashboard)

Open the **CampusServe** project, then:

**3a. Copy the API values** — *Project Settings → API Keys* (and *Data API* for the URL). Keep these handy:

| Value | Looks like | Used by |
|---|---|---|
| Project URL | `https://iafcgxwckoelhmfaddzp.supabase.co` | backend and frontend |
| Publishable key | `sb_publishable_...` (or the legacy `anon` key) | frontend only |
| Secret key | `sb_secret_...` (or the legacy `service_role` key) | **backend only. Never put it in the frontend or share it.** |

**3b. Get the database connection string.** Click **Connect** (top of the project page), then choose **Session pooler**
and copy the URI. It looks like:

```
postgresql://postgres.iafcgxwckoelhmfaddzp:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Replace `[YOUR-PASSWORD]` with your database password. If you do not know it:
*Project Settings → Database → Reset database password*, set a new one, and use that.
Use the **Session pooler** URI. The "Direct connection" host often fails on home networks because it is IPv6-only.

**3c. Download the database SSL certificate.** On *Project Settings → Database*, find **SSL Configuration** and click
**Download certificate**. Save the file (usually `prod-ca-2021.crt`) into the project's `Backend` folder.

**3d. Give the sample accounts a test password.** Open *SQL Editor → New query* and paste the whole content of
`Database/seed/002_dev_test_passwords.sql`, then click **Run**. ✅ (tested on your project in a rolled-back
transaction). The result lists the 18 sample accounts with `can_sign_in = true`.

> ⚠️ This sets the password **`CampusServe@2026`** on all sample accounts, including the sample **administrator**.
> Anyone who knows it can sign in to your project. Use it only while testing (step 9 removes it).

**3e. (Recommended) Auth settings**: *Authentication → URL Configuration*: set **Site URL** to `http://localhost:5173`.
In *Authentication → Sign In / Providers*, turn **off** "Allow new users to sign up".

## 4. Start the backend (API)

In a terminal:

```bash
cd Backend
```

```bash
npm ci
```

Create the settings file by copying the example:

```bash
cp .env.example .env
```

(Windows PowerShell: `Copy-Item .env.example .env`)

Open `Backend/.env` in your editor and set these lines (leave the others as they are):

```ini
NODE_ENV=development
DATABASE_URL=postgresql://postgres.iafcgxwckoelhmfaddzp:YOUR-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
DATABASE_SSL_CA_FILE=./prod-ca-2021.crt
SUPABASE_URL=https://iafcgxwckoelhmfaddzp.supabase.co
SUPABASE_JWT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...your secret key...
STORAGE_MODE=supabase
CORS_ORIGINS=http://localhost:5173
PAYMENT_SANDBOX=true
PAYMENT_SANDBOX_SECRET=any-random-text-at-least-16-chars
PAYMENT_RETURN_URL=http://localhost:5173/student/payments
```

(Leave `SUPABASE_JWT_SECRET` empty: sign-in tokens are checked with your project's public keys. ✅ tested with a real
sign-in on your project.)

Start it:

```bash
npm run dev
```

Check it in the browser: open http://localhost:4000/api/v1/health/ready. You should see
`{"data":{"status":"ready","database":"ok"}}`. Keep this terminal open.

## 5. Start the frontend (website)

Open a **second** terminal:

```bash
cd Frontend
```

```bash
npm ci
```

```bash
cp .env.example .env
```

Edit `Frontend/.env`:

```ini
VITE_SUPABASE_URL=https://iafcgxwckoelhmfaddzp.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...your publishable key...
VITE_API_URL=
VITE_DEV_AUTH=false
```

Start it:

```bash
npm run dev
```

Open **http://localhost:5173**. You should see the CampusServe landing page. ✅

## 6. Sign in with the test accounts

Click **Sign in**. Every sample account uses the password **`CampusServe@2026`**. ✅ (sign-in, wrong-password message
and sign-out tested on your project)

| Email | Who | Opens in |
|---|---|---|
| `admin@campusserve.test` | Administrator | Administration |
| `cashier@campusserve.test` | Cashier | Cashier (online payments) |
| `sas.staff@campusserve.test` | SAS staff: starts clearances | Office |
| `sas.head@campusserve.test` | SAS Head: signs clearances | Office |
| `guidance.staff@campusserve.test` | Guidance: evaluations, guidance slip, counseling queue | Office |
| `library.staff@campusserve.test` | Library: ID validation, receipt, library slip | Office |
| `registrar.staff@campusserve.test` | Registrar: document requests, queue | Office |
| `programhead.bsit@campusserve.test` | BSIT Program Head: signs clearances | Department |
| `ssg.governor@campusserve.test` | SSG Governor: violations, penalties, signs clearances | Organization (also Student) |
| `ssg.treasurer@campusserve.test` | SSG Treasurer: receipts, remittance review, payment verification | Organization (also Student) |
| `padc.mayor@campusserve.test` | PADC Mayor (BSIT department organization): signs clearances | Organization (also Student) |
| `padc.treasurer@campusserve.test` | PADC Treasurer | Organization (also Student) |
| `class.officer@campusserve.test` | BSIT 3A class officer: remittance batches | Organization (also Student) |
| `english.president@campusserve.test` | English Club President | Organization (also Student) |
| `student.bsit1@campusserve.test` | Student, BSIT 3A, English Club member | Student |
| `student.bsit2@campusserve.test` | Student, BSIT 3A | Student |
| `student.beed@campusserve.test` | Student, BEED | Student |
| `student.cbam@campusserve.test` | Student, CBAM (department organization not yet confirmed) | Student |

Officers are also students: switch with the **workspace menu** at the top of the left sidebar. Use a second browser
(or a private window) to stay signed in as two people at once.

## 7. Test scenarios (follow in order)

Each line says **who**, **what to do** and **what you should see**.

### A. Queue
1. **student.bsit1**: *Queue → Book a slot*, choose *Guidance Office: Counseling appointment*, pick a time, *Reserve*.
   → A ticket with a big queue number. *Book a slot* again for the same service → refused ("at most 1 active reservation").
2. **guidance.staff**: *Queue board*, pick the ticket's day → *Check in → Start serving* ("Now serving" shows the number) → *Done*.
3. **student.bsit1**: open the ticket → its history shows each step.
   *If there are no open times:* the sample slots cover about two weeks from when the database was set up. Sign in as
   **admin** → *Services and settings → Queue schedules → Open slots*, choose dates, then try again.

### B. Document request
1. **student.cbam**: *Requests → New request* → *Registrar's Office: Document request*, purpose "Transcript" → *Send*.
   Attach a PDF or JPG (a renamed .exe or .html is refused).
2. **registrar.staff**: *Requests* → open it → *Suggest* (category suggestion, it decides nothing) → *Start review* →
   *Mark ready for release* → *Mark released*.
3. **student.cbam**: the bell shows a notification; the request shows *Released*.

### C. Full clearance (the main flow)
1. **sas.staff**: *Clearances → Start a clearance* → search "BSIT 2" → *Start clearance*. The four signing stations appear.
2. **ssg.governor**: *Clearance signing* → open BSIT 2 → *Sign* is disabled / refused: requirements are not met yet.
3. **class.officer**: *Remittances → New batch* → fee *SSG*, total 50 → open the batch → add "BSIT 2" → *Submit to treasurer*.
4. **ssg.treasurer**: *Remittances* → open the batch → cash received 50 → *Start review* → *Verify* BSIT 2 → *Finish review*.
   (Only verified students get receipts; the batch total alone pays nobody.)
5. **padc.treasurer**: *Receipts → Record a receipt* → fee *PADC*, student BSIT 2 → then *Verify* it.
6. **guidance.staff**: *Guidance* → pick BSIT 2 → *Issue guidance slip* (refused) → *Confirm teacher evaluations* → *Issue guidance slip*.
7. **library.staff**: *Library* → pick BSIT 2 → *Validate library ID* (any ID number) → *Check library receipt* (any receipt number, amount e.g. 20) → *Issue library slip*.
8. Sign in order — **ssg.governor**, then **sas.head**, then **padc.mayor**, then **programhead.bsit**: *Clearance signing* →
   open BSIT 2 → *Re-check requirements* → *Sign*. (Signing out of order is refused.)
9. **student.bsit2** (try it on your phone width too): *Clearance* → "Clearance complete", each station signed with a name.

### D. Violations, penalties and online payment (sandbox)
1. **admin**: *Services and settings → System settings* → edit `payments.enabled_providers` → value `["gcash"]` → *Save*.
   (Read the warning: in real use, only after the real GCash integration exists.)
2. **ssg.governor**: *Violations → Report a violation* → policy *SSG event violation*, student BEED, "Absent at assembly" →
   then *Verify* it. *Penalties → Assess a penalty* → same policy and student → "1 h or ₱60".
3. **student.beed**: *Penalties* → open it → choose *Pay ₱60* → *Pay with GCash* → the **Simulated checkout (development only)**
   page → *Simulate a successful payment*. The payment shows *Paid* but organization check *Waiting*.
4. **ssg.treasurer**: *Payments* → *Verify* → the student's penalty becomes *Resolved*.
5. Variant: choose *community service* instead, submit hours as the student, verify as **ssg.governor**.
6. **ssg.governor** reports a violation for CBAM → **student.cbam**: *Penalties → Violations → Dispute* (explain why) →
   **ssg.governor** decides it on *Violations → Disputes* (accepting voids the violation).

### E. Administration
1. **admin**: *Users and roles* → open an account → add/remove a role, assign a position.
2. *Policies and fees*, *Clearance templates* (copy to draft → edit → activate), *Audit log* (every change with who did it).
3. *Assistant knowledge* → *Add a source* (e.g. "Student FAQ", visible to signed-in users) → open it → paste some text →
   *Add text*. Then as any student: *Assistant* → ask about it → the answer quotes your text with the source named.
   (This is the development assistant: no AI model is connected, so it quotes documents instead of writing answers.)
4. **cashier**: sees every online payment and can record reconciliations.

### F. Things that should be refused
- A student opening `/admin` → "This area is not part of your account".
- **ssg.treasurer** recording a PADC receipt → refused.
- A new person signing up (if sign-up is still on) → "Your account is not active yet" until **admin** activates them.

## 8. Optional

- **Automation worker** (runs report/email automation rules), in a third terminal:

```bash
cd Backend
```

```bash
npm run build
```

```bash
npm run worker
```

- **Automated tests**: these run against a throwaway local PostgreSQL with PostGIS, pgvector, pgRouting and pg_cron,
  never your Supabase project. See [TESTING_GUIDE.md](TESTING_GUIDE.md).

## 9. When you finish testing

1. In the Supabase SQL editor, run `Database/seed/901_remove_dev_test_passwords.sql` (removes the test passwords and signs
   the sample accounts out).
2. Set `payments.enabled_providers` back to `[]` (admin → System settings).
3. Before real use: remove all sample data with `Database/seed/900_remove_dev_seed.sql`, turn on leaked-password
   protection, keep public sign-up off, and never ship `PAYMENT_SANDBOX=true`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `health/ready` says `DATABASE_UNAVAILABLE`, or the terminal shows `password authentication failed` | Check the password in `DATABASE_URL` (reset it in the dashboard if unsure). Special characters in the password must be URL-encoded (e.g. `@` → `%40`, `#` → `%23`). |
| `self-signed certificate in certificate chain` | `DATABASE_SSL_CA_FILE` must point to the downloaded certificate (step 3c), relative to the `Backend` folder. |
| `getaddrinfo ENOTFOUND db.iafcgxwckoelhmfaddzp.supabase.co` | You used the direct connection; use the **Session pooler** URI (step 3b). |
| `permission denied to set role` | Use the pooler user `postgres.iafcgxwckoelhmfaddzp` from the dashboard's URI, not a custom role. |
| Backend exits with `Invalid environment configuration` | The message lists the missing/invalid variables in `Backend/.env`. |
| Sign-in says "Sign-in is not set up on this site yet" | `Frontend/.env` is missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; restart `npm run dev` after editing it. |
| "That email and password do not match an account" | Step 3d was not run, or the password differs. |
| Every page says "Cannot reach CampusServe" | The backend is not running on port 4000 (step 4). |
| Requests fail with a CORS error | `CORS_ORIGINS` in `Backend/.env` must be exactly `http://localhost:5173`. |
| "Sign-in could not be checked right now" (503) | The backend cannot reach `https://iafcgxwckoelhmfaddzp.supabase.co` to check sign-in keys. Check your internet / firewall. |
| File upload fails with `STORAGE_ERROR` | `SUPABASE_SERVICE_ROLE_KEY` must be the **secret** (or legacy service_role) key, and `STORAGE_MODE=supabase`. |
| Online payment button disabled | Step D1 (enable `gcash` in settings) and `PAYMENT_SANDBOX=true` in `Backend/.env`. |
