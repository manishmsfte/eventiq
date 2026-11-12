---
title: "Azure Cosmos DB Hands-on Labs: Event Schedule and Registration Portal"
description: "Role-based event management and registration portal for hands-on labs."
---

This project is a role-based event management web app for hands-on labs. Publishers create and manage events, supervisors monitor activity, facilitators (speaker/proctor) view assigned sessions, and registrants browse and enroll.

## What this app does

- Public event discovery with compact filtering and status facets.
- Unified persona login (`publisher`, `supervisor`, `registrant`, `facilitator`, plus legacy `speaker` and `proctor`).
- Event lifecycle management (`upcoming`, `ongoing`, `completed`, `canceled`).
- Registration with ICS calendar invite download.
- Registrant dashboard and self-service deregistration.
- Role-neutral event-team workflow with per-session Speaker and Proctor assignments.
- Publisher reporting views: registrations, organizations, feedback.
- Post-event follow-up template support (subject/body/optional attachment).
- Notification automation hooks for SMTP or Power Automate.

## Architecture at a glance

- Runtime: Node.js + Express + EJS
- Data store: Azure Cosmos DB (NoSQL)
- Auth model: metadata-based login documents (`login-user`)
- Email transport: SMTP or Power Automate webhook
- Static assets: `public`
- Views: `views`

## Quick start (local)

1. Install dependencies.

```bash
npm install
```

2. Copy environment template and update values.

```bash
copy .env.example .env
```

Replace the example account and tenant values. Generate a different random value
for each of `SESSION_SECRET` and `BOOTSTRAP_API_TOKEN`; do not use the placeholders:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

3. Start the app.

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Required environment variables

Set these in `.env`.

### Core app

- `PORT`
- `SESSION_SECRET`
- `BOOTSTRAP_API_TOKEN`

### Cosmos DB (preferred: AAD auth)

- `COSMOS_DB_ENDPOINT`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID` (optional for local if using `az login`)
- `AZURE_CLIENT_SECRET` (optional for local if using `az login`)
- `COSMOS_DB_DATABASE`
- `COSMOS_DB_EVENTS_CONTAINER`
- `COSMOS_DB_REGISTRATIONS_CONTAINER`
- `COSMOS_DB_FEEDBACK_CONTAINER`
- `COSMOS_DB_METADATA_CONTAINER`
- `COSMOS_DB_PREFERRED_LOCATIONS` (optional, comma-separated)
- `COSMOS_DB_AUTO_PROVISION` (`false` by default)

Fallback only when key auth is enabled:

- `COSMOS_DB_CONNECTION_STRING`

### Email (optional but recommended)

SMTP:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Power Automate alternative:

- `POWER_AUTOMATE_WEBHOOK_URL`

## Personas and login routes

Primary route:

- `GET /login`

Legacy routes redirect to unified login:

- `GET /publisher/login`
- `GET /supervisor/login`
- `GET /registrant/login`

Persona destinations after login:

- Publisher: `GET /publisher/dashboard`
- Supervisor: `GET /supervisor/dashboard`
- Registrant: `GET /registrant/dashboard`
- Facilitator (speaker/proctor): `GET /facilitator/dashboard`

## Data model essentials

Required containers:

- `events`
- `registrations`
- `feedback`
- `metadata`

Login users are stored in `metadata` with `type=login-user`.

Example:

```json
{
  "id": "login-publisher-alice",
  "type": "login-user",
  "userType": "publisher",
  "email": "alice@microsoft.com",
  "password": "ChangeMeNow123!",
  "active": true
}
```

## Bootstrap APIs

Use these to validate setup and seed login documents.

- `GET /admin/bootstrap/status`
- `POST /admin/bootstrap/seed-logins`

Auth:

- Header: `x-bootstrap-token: <BOOTSTRAP_API_TOKEN>`

Seed body sample:

```json
{
  "publishers": [
    {
      "id": "login-publisher-alice",
      "email": "alice@microsoft.com",
      "password": "ChangeMeNow123!",
      "active": true
    }
  ],
  "supervisors": [
    {
      "id": "login-supervisor-main",
      "email": "supervisor@microsoft.com",
      "password": "Supervisor#123",
      "active": true
    }
  ]
}
```

## Notification operations

Run pipeline endpoint:

- `POST /admin/notifications/run`
- Auth: `x-bootstrap-token`
- Default safe mode: `{"dryRun": true}`
- Send mode: `{"dryRun": false}`

Transport test endpoint:

- `POST /admin/notifications/test`

Sample payload:

```json
{
  "to": "user@contoso.com",
  "subject": "Lab Automation test notification",
  "text": "This is a test message"
}
```

If using Power Automate, configure the HTTP trigger to accept `to`, `subject`, `text`, and optional `attachments[]` fields.

## Smoke testing

Script:

```bash
npm run smoke:test
```

Optional env vars used by smoke checks:

- `SMOKE_LOGIN_EMAIL`
- `SMOKE_REG_EMAIL`
- `SMOKE_SEND_FOLLOWUP` (`true` or `false`)
- `SMOKE_FOLLOWUP_TO` (required when `SMOKE_SEND_FOLLOWUP=true`)
- `BASE_URL` (optional)

What it validates:

- Event listing and baseline data access
- Persona login lookup for key roles
- Registration dedupe-path readiness
- Follow-up template lookup
- Optional follow-up send path

## Source repository and packaging

Repository: [manishmsfte/eventiq](https://github.com/manishmsfte/eventiq).

The source repository and source ZIP exclude installed dependencies, deployment
archives, logs, local tooling output, environment secrets, attendee exports,
agreements, and local Office documents. These private files stay on the original
machine; they are not needed to install and run the app from source.

After cloning or extracting the source, run `npm ci`, then configure `.env` using
the quick-start steps above. Word screenshot walkthroughs are distributed
separately.

To create a compact ZIP containing only committed source files:

```bash
git archive --format=zip --output=eventiq-source.zip HEAD
```

Do not compress the entire working folder for sharing. Keep `package-lock.json`,
the application source, tests, views, public assets, and the redirect source in
`deploy/nosqlreg-redirect`.

## Deployment notes (Azure App Service)

- Production target: `eventiq` at `https://eventiq.azurewebsites.net` in `rg-hol-reg`,
  using the existing `hol-registrations` database.
- `NoSQLReg` runs only a permanent HTTP 308 redirect to
  `https://eventiq.azurewebsites.net`, preserving request paths and query strings.
  EventIQ serves the application and existing production data.
- Redirect-only source is in `deploy/nosqlreg-redirect`. NoSQLReg starts with
  `node /home/site/wwwroot/redirect-server.js`, deployed using the Kudu VFS API.
  Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=false`; the redirect has no dependencies.
  An initial ZIP deployment failed in Oryx, so the redirect file was deployed
  directly instead. Do not deploy the main application to NoSQLReg unless you
  intend to remove the redirect.
- Verify redirect behavior with `node --test tests/nosqlreg-redirect.test.js`.
  Existing browser sessions do not transfer between the two hostnames, so users
  may need to sign in again on EventIQ.
- EventIQ uses the existing `asp-hol-reg-linux` plan and its own managed identity
  with the same Cosmos DB data access as NoSQLReg.
- Set `PUBLIC_APP_BASE_URL=https://eventiq.azurewebsites.net` on EventIQ so generated
  public links use the new hostname.
- The initial EventIQ deployment copies the live NoSQLReg build, including its
  packaged dependencies. Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=false` for this prebuilt
  package; enable build automation when deploying source without built dependencies.
- Test target: `hol-reg-mansha-001` in `rg-hol-reg`, using the isolated
  `hol-registrations-test` database.
- Zip deploy works reliably when excluding large transient folders (`node_modules`, logs, `.git`).
- If `Compress-Archive` hits file lock issues, package with `tar` as a fallback.

Typical validation sequence after deploy:

```bash
node --check server.js
node --check db.js
node --check services/mailer.js
npm run smoke:test
```

Health check example:

```powershell
Invoke-WebRequest -Uri "https://nosqlreg.azurewebsites.net" -UseBasicParsing | Select-Object StatusCode, StatusDescription
Invoke-WebRequest -Uri "https://eventiq.azurewebsites.net" -UseBasicParsing | Select-Object StatusCode, StatusDescription
Invoke-WebRequest -Uri "https://hol-reg-mansha-001.azurewebsites.net" -UseBasicParsing | Select-Object StatusCode, StatusDescription
```

## Additional guide

For benchmark-specific interpretation and performance-lab workflow details, see:

- `AZURE_DOCUMENTDB_PERF_LAB_GUIDE.md`

## License

The original project code is licensed under the
[PolyForm Noncommercial License 1.0.0](./LICENSE)
(SPDX: `PolyForm-Noncommercial-1.0.0`).

Noncommercial learning, personal study, research, testing, and hobby use are
permitted. Commercial use is not granted under this license. Keep the license
and required notices when sharing permitted copies or modifications.

This standard license also permits other noncommercial purposes; it is not
restricted solely to education. The full license controls the permitted uses.
Third-party dependencies and assets retain their own licenses and ownership.

Required Notice: Copyright (c) 2026 manishmsfte
