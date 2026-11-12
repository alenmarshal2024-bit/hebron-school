# Hebron School — Neon-ready school management foundation

**Updated:** 8 November 2026. **Stage:** Real-app source code and local tests complete, **not live deployed**.

This project includes:

- `/` — database-backed staff portal. Not an insecure local demo.
- `/preview/` — complete **fictional-data-only** browser demo preserved from the earlier Hebron project.
- Server endpoints in `netlify/functions/api.mjs`, PostgreSQL schema in `db/001_school.sql`, and Neon infrastructure declarations in `neon.ts`.

## What's implemented in the real-app source

- Login with staff email, secure scrypt password hashing, server-side sessions and HttpOnly/Secure cookie.
- Admin/Principal, Teacher and Accountant home pages (the principal sees welfare and escalations instead of fee statistics).
- Principal can invite staff with unique email and temporary password, select roles, assign classes and revoke non-principal access.
- Staff must change the temporary password. Teachers are asked to fill in their own profile after first login.
- Principal adds students individually or uploads CSV with a preview of rejected rows and duplicate admission-number checks.
- Teacher sees only assigned-class students; **only their class's assigned class teacher** may create student observations and escalations.
- Fee collection: record charges and cash/UPI/bank/cheque payments, view ledger and financial summaries; payment amount is stored in integer paise with idempotency keys.
- Full existing school demo remains available separately under `/preview/` for *fictional* records only.

**Not yet implemented as a real school service:** emailed invites / email verification and resets; complete Neon Managed Auth delegation; receipt PDF generation and approvals; payment reversals; WhatsApp sending; production file uploads; 3-consecutive-school-day absences (requires submitted attendance sheets and holiday calendar); realtime subscriptions; AI-gateway business use; automated backups; all remaining school operation modules. The preview covers most as simulations, not shared records.

## 1. Run the local build (no Docker)

You need Node.js **20.19+**. In this folder:

```bash
npm run build
npm test
npm start
```

Open `http://localhost:4173` for the new login screen. It **cannot log in** until a PostgreSQL database and backend are connected.

For the existing **fictional demo**, open `http://localhost:4173/preview/` and use one of these (ONLY demo):

| Role | Demo email | Password |
| --- | --- | --- |
| Principal | `principal@hebron.demo` | `Demo@1234` |
| Teacher | `anu.teacher@hebron.demo` | `Demo@1234` |
| Accountant | `accounts@hebron.demo` | `Demo@1234` |
| Teacher + Store | `priya.teacher@hebron.demo` | `Demo@1234` |

The demo password **never** works in the real API. Never import real students into `/preview/`.

## 2. Install and initialize Neon

Neon CLI documentation: <https://neon.com/docs/reference/cli-init>.

```bash
npm i -g neon@latest
# If global installation fails:
npx neon@latest --version
# Then replace `neon` with `npx neon@latest` in the commands below.
```

In your **extracted project root**:

```bash
neon init -y --org-id org-wispy-morning-04192294 --project-id shiny-truth-37743197 --branch production --services postgres,auth,ai-gateway,object-storage,functions,realtime
```

If the CLI launches a browser login, **complete the sign-in there**. If it times out, run `neon login` and then retry the init command.

This repository already provides a `neon.ts` declaring the services. Verify it against the installed CLI:

```bash
neon config plan
neon deploy
neon env pull
```

Do not commit `.env.local`, `.env`, `.neon`, or credentials to a public repository.

If Neon warns that the chosen **production branch is protected**, do not disable protection just to bypass the warning. Review the proposed changes and approve them using Neon controls only after confirming the impact.

### What gets created by `neon.ts`

- Postgres (every Neon project provides it)
- Managed Neon Auth (provisioned but **not** the authentication provider used by this initial app; migration to managed Auth is future work)
- AI Gateway (configuration only, deliberately no student data sent to models)
- A private object storage bucket `hebron-private` (provisioned but uploads not yet active)
- A Neon Function `health` with a live PostgreSQL query (source included, not deployed here)
- Realtime beta enablement (not yet used by app; polling/refetch is the current approach)

Availability of these services and realtime beta varies by project and region. Neon may require extra account approvals. Some incur costs.

## 3. Database migration and first real principal

Once `neon deploy` has created `.env.local`, run in this directory:

```bash
npm install
npm run db:migrate
```

The migration creates the tables; it **does not create a demo principal**. To set up the **first real principal**, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` without putting credentials into code:

```bash
# Example Mac/Linux commands, use your own email and a strong new password:
export ADMIN_EMAIL='your.actual.email@school.org'
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
npm run db:bootstrap
unset ADMIN_PASSWORD
```

`npm run db:bootstrap` only creates the principal if that email does not already exist and inserts default school/class structure. Do not run it repeatedly. A principal password reset flow is still required before production use.

**Never share the first principal password in ChatGPT, email or a public issue.**

`npm run db:migrate` and `npm run db:bootstrap` automatically read `.env.local` via Node's `--env-file` support.

### Database-only changes don't deploy Netlify

Neon handles the backend services, but **does not automatically replace your existing Netlify site**. Netlify hosts the static UI and same-origin API Functions.

## 4. Publish to your Netlify site

Your requested site is:

`https://gilded-churros-d7ff5d.netlify.app`

1. Link this project folder to the existing Netlify site (via Netlify Git deployment or Netlify CLI; sign in when prompted).
2. Netlify build command: `npm run build`.
3. Publish directory: `dist`.
4. Functions directory: `netlify/functions`.
5. Set the following as **Netlify environment variables** (from Neon `.env.local`, without revealing them publicly):
   - `DATABASE_URL` (required secret)
   - `CORS_ORIGIN=https://gilded-churros-d7ff5d.netlify.app`
   - Optional Neon service variables if and when their corresponding features are enabled.
6. Trigger a new site deployment.
7. Test these addresses in order:
   - `https://gilded-churros-d7ff5d.netlify.app/api/health` should return JSON with `ok:true` and `postgres:true`.
   - Log in using the unique real principal email and password created in step 3.
   - Invite a fictional teacher and test their login/profile, then revoke their access.
   - Import a small fictional CSV and test duplicate-row reporting.
   - Create a **fictional** fee charge/payment and verify the ledger; check it on a second device.

**Do not use real student names, phone numbers, fee records or parents' WhatsApp details until these tests and the privacy, backup, role-permission and recovery review are complete.**

### Why Netlify Drop is not enough

Static ZIP upload is okay for a fictional demo. This real version uses server-side Functions and a live Neon database; deploy the **entire project with its `netlify.toml` and functions** using Git-based deployment or Netlify CLI. Do not upload just the `dist` folder to Netlify Drop and expect logins to work.

## 5. Import students

The principal can use **Students → + Add Student** for one student, or **Students → Import CSV** for a batch. A starter template is at `templates/students_template.csv` and available from within the UI.

Accepted columns:

| Column | Required? | Example |
| --- | --- | --- |
| `admission_number` | Yes | HB2001 |
| `name` | Yes | Sample Student |
| `class` | Yes | Class 3 |
| `guardian_name` | No | Sample Guardian |
| `guardian_phone` | No | +919999999999 |
| `preferred_language` | No | `en` or `ml` |

The principal sees row-level errors before committing; unknown class, duplicate admission, invalid language and invalid phone are rejected. Each batch is capped at **1,000 students**. Parents' WhatsApp consent defaults to **false**.

**Other import options:** use Excel → **Save As CSV UTF-8**, or Google Sheets → **File → Download → CSV**, then import the CSV. Native `.xlsx` import, copy/paste from a spreadsheet and Google Sheets sync can be implemented later. For a one-off 200-student import, CSV is simplest and cheapest.

## 6. Status of the requested verification

| Requested step | Status in this delivery |
| --- | --- |
| `npm i -g neon@latest` | **Failed**: this runtime can't reach `registry.npmjs.org` (`EAI_AGAIN`) |
| `npx neon@latest` | **Failed** with the same network/DNS error |
| `neon init ...` | **Not executed** because CLI install failed (`neon: command not found`) |
| `neon deploy` | **Not executed** for the same reason |
| `npm run build` | **Passed locally** |
| `npm test` | **21/21 passed locally**, with mocked DB responses where needed |
| Static HTTP smoke check | `HTTP/1.1 200 OK` from local Node server |
| End-to-end live Neon Postgres/Auth/AI/Storage/Functions/Realtime | **Not tested and cannot be claimed as working** |
| Existing Netlify site update | **Not done** (no authenticated deploy access) |
| Real mobile browser verification | **Blocked by this environment's browser policy** |

Current code is a deployable development foundation, not a security-certified or production-ready school system. Real operation needs successful hosted end-to-end testing, login rate limits, account recovery, backups, robust financial controls, and a data-protection review.

## 7. Structure

```
public/                     Real staff portal UI and styles
preview/                    Fictional-data-only full demo
server/api.mjs              Main role-protected REST API
server/security.mjs         Password hashing and sessions
server/csv.mjs              Spreadsheet CSV parsing/validation
server/finance.mjs          Integer-paise financial rules
netlify/functions/api.mjs   Netlify server function wrapper
db/001_school.sql           PostgreSQL schema
scripts/build.mjs           Frontend build without Docker
scripts/migrate.mjs         Database migration
scripts/bootstrap.mjs       First real principal setup
neon.ts                     Neon provisioning declaration
neon-functions/health.ts    Neon Function with PostgreSQL query
tests/                      Automated local tests
```

## 8. Priorities before real school rollout

1. Authenticate the Neon and Netlify connections and verify deployment.
2. Migrate the auth flow to Neon Managed Auth if required, or formally accept independently managed application sessions; don't maintain two conflicting identity sources.
3. Confirm class-teacher assignments; add secure password recovery and invitation email provider.
4. Enable daily encrypted off-site backups and test restoration.
5. Complete fee receipts, reversals, ledger controls and daily reconciliation reports.
6. Add attendance submissions, holidays and reliable 3+ school-day absence alerts.
7. Integrate official WhatsApp Business messaging with parental opt-in, template approval and delivery audit.
8. Enable private file uploads, realtime subscriptions, and optional AI only if their use cases justify the cost and privacy obligations.

## Dashboard refresh — 11 November 2026

The principal home now includes pastel attendance cards, a recorded-attendance
ring and class breakdown, unresolved teacher concerns, quick fee entry, and a
desktop sidebar with bottom navigation on phones. Missing attendance is shown
as unmarked, not present. Late and half-day records count in the labelled
present category; percentages use marked students as the denominator.

Lesson reviews, announcements/WhatsApp and consecutive-school-day absence
tracking still require their backing workflows. Their panels explicitly show
that they are not connected. No calendar-based absence count is inferred.
The full fictional demo at /preview/ is unchanged.

Validation: build and 23 automated tests pass, including dashboard aggregation
and principal-only school-wide data. No live Neon database validation was run.
Browser screenshot validation was blocked by this environment's Chromium
socket restrictions; responsive CSS still needs a visual check after deployment.

Redeploy this complete project to the existing Netlify site with its current
Neon environment variables. Use the existing build command `npm run build`,
publish directory `dist`, and functions directory `netlify/functions`. A static
folder-only upload will not rebuild the updated API function. No schema changes
are required for this dashboard refresh.
