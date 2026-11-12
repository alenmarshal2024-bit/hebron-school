# Release 1 — Two-school foundation (STAGING FIRST)

## Status
Code and SQL files prepared. **No Neon database or Netlify deployment has been modified.** The existing `db/001_school.sql` is unchanged. This release is not production-ready until the staging checks below pass.

## Important compatibility notes
- `db/002_multi_school.sql` is **additive**, and does not delete or copy existing school records.
- The existing `staff_users.school_id` remains the default school for all users; central admins can switch school using an authorized API request header. Membership records are prepared for a later authorization migration, but staff permissions still use the existing school-bound roles in Release 1.
- Existing principal accounts retain their original school-scoped privileges to avoid unexpected lockouts. **Before production approval, review all existing principal accounts** if the central admin must be the only person with full administration rights.
- A central admin must be **explicitly designated**; nobody is promoted automatically.
- The logo file is included as `public/true-light-logo.png`. Its use requires the school row to have `logo_path='/true-light-logo.png'`.
- The app has not been tested against your actual Neon schema or live Netlify configuration.

## Prepare staging (do not use production database)
1. Save a verified backup of the current Neon production database and record the existing school IDs and current admin email.
2. Create a separate Neon database branch for staging, based on the current schema/data. Limit access to authorized testers because it may contain real student information.
3. Install Node.js 20.19+ and run `npm install` in `hebron-neon-ready`.
4. Run `npm run check` locally. This builds the frontend and runs automated tests.
5. Review `db/002_multi_school.sql`. Apply it **only to staging** using your preferred Neon SQL editor or `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002_multi_school.sql`. The existing `npm run db:migrate` command only executes `001_school.sql` and does not apply this release's migration.
6. Verify the intended central admin's UUID from `staff_users` using a SELECT statement, then manually add that user to `platform_admins` in staging:
   `INSERT INTO platform_admins(user_id) VALUES ('<verified-user-uuid>');`
7. Create True Light in staging only:
   `INSERT INTO schools(name,timezone,logo_path) VALUES ('True Light English Medium School','Asia/Kolkata','/true-light-logo.png');`
   If it already exists, update that existing row instead. Do not create duplicates.
8. Configure a **separate staging Netlify site** with staging `DATABASE_URL` and appropriate `CORS_ORIGIN`, then deploy the repository folder `hebron-neon-ready` (build command `npm run build`, publish `dist`, functions `netlify/functions`). Never place secrets in frontend files.
9. Sign in as central admin, verify the school dropdown, switch both ways, and check that the students, fees, dashboard, and staff views remain isolated. Sign in as a teacher and accountant and verify the school selector is absent and a manually injected `X-School-Id` header is rejected with HTTP 403.
10. Confirm existing Hebron data counts, login, payment and student workflows still work; verify no True Light records appear in Hebron views.

## Before production release
- Obtain explicit approval for production migration and deployment.
- Review the old principal users and define a safe transition to central-admin-only full permissions. This release deliberately does not silently revoke existing access.
- Test data isolation with real staging data and complete a backup/restore rehearsal.
- Apply migration to production only in an agreed maintenance window, then explicitly grant the intended admin and create/update the True Light school row.
- Deploy code **after** the migration. The updated API expects the new `platform_admins` and `schools.is_active` fields, so deploying code first can cause login errors.
- If deployment fails, roll back the Netlify code release. Schema changes are additive; avoid dropping tables or removing columns to roll back. Restore from verified backup only after assessing data changes.

## What's NOT in Release 1
New attendance workflow, WhatsApp delivery, referrals, supplies, faculty modules, new school onboarding data, and actual logo-driven theme switching are future releases. No WhatsApp messages are sent by this code.
