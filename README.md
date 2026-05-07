# 📦 EPL Magazine Tracker

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)
![License](https://img.shields.io/badge/License-Private-red)

> *Your documentation is a direct reflection of your software, so hold it to the same standards.*

**New here?** Read [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) for project orientation, then [`docs/ROADMAP.md`](docs/ROADMAP.md) for current state and direction. AI agents working on this repo: see [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).


## 🌟 Highlights

- Track periodical magazine receipts across multiple library branches
- **Multi-vendor subscription periods** — run EBSCO (Jun-May) and calendar-year (Jan-Dec) periods in parallel, one per magazine
- **Subscription-aware status** — completed, overdue, expected this week, upcoming, never received, not subscribed
- **Multi-period dashboard** — progress bars per active period, combined overdue/expected cards with period badges
- **Auto-deactivation** — periods automatically deactivate when their end date passes
- Automatic overdue detection based on each magazine's publication cadence
- Role-based access control — staff mark receipts, admins manage magazines, subscriptions, and users
- Admin data reports with period, branch, and magazine name filtering + .xlsx export
- Full audit logging of every meaningful action
- Inter-branch magazine transfers with full lifecycle tracking (pending, completed, cancelled)
- Receipt edit/delete for admins — correct dates, branches, or notes directly from the UI
- "Same as" period creation — copy subscriptions from an existing period with one click
- Period activation with conflict detection — prevents double-assigning magazines
- Docker health monitoring with automatic container restart on failure
- Safe database migration script with automatic backup and test-on-copy
- Zero external dependencies beyond the app itself — SQLite database, file-based logs, no third-party services


## ℹ️ Overview

EPL Magazine Tracker is an internal web application built for Edison Public Library staff to manage periodical magazine subscriptions and receipts. When magazines arrive at a branch, staff log the receipt; the system then tracks each title's publication cadence, flags overdue issues, and shows what's expected each week. Admins also have access to data reports covering Oversight, Accountability, and Operations metrics.

The application is designed for internal LAN deployment only via Docker Compose. It uses SQLite for storage (no database server needed), JWT-based session authentication, and file-based audit logging — keeping infrastructure simple and self-contained.

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (`strict: true`) |
| Database | SQLite via Prisma ORM v7 |
| Auth | JWT sessions with jose + bcrypt |
| Styling | Tailwind CSS + shadcn/ui |
| Validation | Zod (runtime input validation) |
| Audit Log | Winston (JSON lines to file) |


## ⬇️ Installation

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- **Docker** and **Docker Compose** (for production deployment)

### Local Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd epl-magazines

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and set SESSION_SECRET:
#   SESSION_SECRET=$(openssl rand -base64 32)

# Generate Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# Seed the database with production data (magazines + historical receipts)
npm run seed

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Docker Deployment

```bash
# 1. Create required directories and environment file
mkdir -p logs
cat > .env.local << EOF
SESSION_SECRET=$(openssl rand -base64 32)
DATABASE_URL="file:./prisma/dev.db"
EOF

# 2. Build the image
docker compose build

# 3. Run database migrations
docker compose run --rm migrate

# 4. Seed the database (fresh install only)
docker compose run --rm migrate tsx prisma/seed.ts

# 5. Start the app
docker compose up -d
```

The `.env.local` file is **required** — the build will fail without it. It is gitignored and must be created on each server.

This mounts `prisma/` (SQLite database) and `logs/` (audit log) as volumes for persistence. The container includes a health check that polls `/api/health` every 30 seconds and automatically restarts if unhealthy.

Back up by copying `prisma/dev.db` and `logs/audit.log`. Before applying schema migrations, use `npm run migrate:safe` to automatically back up the database and test migrations on a copy first.


## 🚀 Usage

1. **Log in** with your username and password at `/login`
2. **Select your branch** from the sidebar selector
3. **View the dashboard** to see progress bars per active subscription period, overdue, and expected this week
4. **Mark a magazine as received** from the magazines list or magazine detail page
5. **Admin users** can manage magazines, subscriptions, users, and view reports from the admin panel

### Staff Workflow

| Action | Where |
|---|---|
| See what's overdue or expected | Dashboard (`/dashboard`) |
| Mark a magazine as received | Magazines (`/magazines`) |
| Receive a pending transfer | Magazine detail (`/magazines/[id]`) — blue "Receive Transfer" button appears automatically |
| View receipt history for a title | Magazine detail (`/magazines/[id]`) |

### Admin Actions

| Action | Where |
|---|---|
| Create/manage subscription periods | Admin > Subscriptions (`/admin/subscriptions`) |
| Manage magazine subscriptions per period | Admin > Subscriptions > [Period] (`/admin/subscriptions/[id]`) |
| Create, edit, or deactivate magazines | Admin > Magazines (`/admin/magazines`) |
| Filter magazines by cadence, language, or status | Admin > Magazines (`/admin/magazines`) |
| Edit or delete receipt records | Magazine detail (`/magazines/[id]`) — pencil/trash icons |
| Manage inter-branch transfers | Admin > Transfers (`/admin/transfers`) |
| Manage users | Admin > Users (`/admin/users`) |
| View audit log | Log (`/log`) |
| View period-scoped reports with .xlsx export | Admin > Reports (`/admin/reports`) |


## ✍️ Authors

**Edison Public Library** — Lucas Luize 

Built and maintained by library staff for library staff.


## 💭 Feedback and Contributing

This is an internal project for EPL. If you're a team member:

- **Bug reports and feature requests**: Open an issue in the repository
- **Questions or discussion**: Reach out to the Internal Tools team

Contributions from team members are welcome. Please ensure all code follows the project's TypeScript strict mode conventions and includes appropriate TSDoc comments on exported functions.
