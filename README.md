# ARCHONIX

ARCHONIX is a React and TypeScript workspace for monitoring a building portfolio, recording inspection evidence, tracking follow-up tasks, and producing printable inspection reports.

## Run locally

```sh
npm install
npm run dev
```

Check the production build and lint rules with:

```sh
npm run build
npm run lint
```

## Supabase setup

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` to enable Supabase email/password sign-in, sign-up, password recovery, email changes, and organization onboarding. Configure Supabase Auth's email confirmation, SMTP delivery, and allowed redirect URLs for your deployment.

Apply the SQL migration in `supabase/migrations` before using organization onboarding. It creates organization, membership, and invitation tables plus secure create/join RPCs. The first user creating an organization becomes its administrator. Administrators can create single-use, seven-day invitation tokens for a specified email and role; the token must be shared with that person through a trusted channel, and joining requires an authenticated account with the matching email. This prototype does not send invitation email.

The migration adds `buildings.organisation_id` and enforces organization-scoped row-level access. Existing building rows are intentionally left unassigned; have a database administrator map each existing row to the correct organization before expecting members to see it. Do not blanket-assign rows if they belong to different organizations. The browser workspace still keeps building additions, inspections, tasks, alerts, checklist templates, and audit history in `localStorage`; CSV imports do not insert rows into Supabase.

Membership roles are `administrator`, `structural_engineer`, `inspector`, and `viewer`. The migration limits organization membership and building access with Supabase Row Level Security. Client-side role checks remain a user-experience control, not a security boundary. Never put a Supabase service-role key in the browser. Review the migration against your project schema and back up your database before applying it to production.

Without Supabase configuration, **Sign In as Operator** and **Enter Demo Workspace** both open the local demo immediately; neither authenticates a user.

## Data and inspection limitations

Building additions, alerts, inspection records, work orders, reusable checklist templates, audit history, and browser notification deduplication are stored in this browser's `localStorage`; authenticated data is separated by account but is not synchronized between team members or devices. The demo workspace uses a separate local data set. Uploaded images are resized and stored with their inspection record in browser storage. Clearing browser data removes these local records.

Inspection records are inspector-entered. They support draft, submit, review, changes-requested, approval, and close states. Checklist results and reviewer notes are recorded with each local inspection. Audit history is a local convenience log, not an immutable or compliance-grade audit trail. The application does **not** analyze photographs, calculate structural risk, or generate certified engineering advice. Preloaded alerts and inspection records are illustrative demo content. The report screen provides a browser print flow that can be saved as PDF; it is not a certified or standards-compliant structural report.

Building CSV import validates and previews rows before adding valid rows to the local portfolio. Required headers are `name,location,lat,lng`; optional headers are `type,year,floors,description`. Invalid rows are skipped and displayed with their row numbers. Due/overdue task reminders appear in the app; optional browser notifications are shown only while the app is open and require explicit permission.

The map uses Leaflet and CARTO/OSM map tiles. A network connection is required to load the basemap.
