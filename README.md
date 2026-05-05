# BB Score — Basketball Live Score Update App

A simple, current-state basketball scoring web app:

- **Next.js 14 App Router** + **TypeScript** + **Tailwind CSS**
- **Supabase** Postgres + Auth + Realtime
- **No event log** — the database stores only the current state of each match
- Public live scoreboards (no login)
- Protected admin & scorer pages, optimized for tablet/mobile

## Pages

| Page | Access | Purpose |
|---|---|---|
| `/` | public | Lists live + upcoming matches |
| `/live/match/[matchId]` | public | Realtime scoreboard, timers, team & player stats |
| `/login` | public | Username + password sign-in |
| `/admin` | admin | Counters: teams, players, matches, live, completed, upcoming |
| `/admin/seasons` | admin | CRUD seasons |
| `/admin/teams` | admin | CRUD teams |
| `/admin/players` | admin | CRUD players (no team_id) |
| `/admin/team-players` | admin | Per-season rosters; one active per (season, player) |
| `/admin/matches` | admin | CRUD matches, links to Score/Public |
| `/admin/users` | admin | Create/update/delete admins and scorers |
| `/admin/settings` | admin | Edit site name and upload navbar logo |
| `/scorer/matches` | scorer / admin | List of upcoming and live matches to score |
| `/scorer/match/[matchId]` | scorer / admin | Live scorer console (timers, scoring, fouls, subs) |

## Scorer features

Optimized for one or two taps per action:

- Match timer: start/pause, reset to period duration, custom mm:ss
- 24-second shot clock: start/pause, reset to 24, reset to 14
- Period stepper (Q1–Qn)
- Match status (scheduled / live / paused / completed / cancelled)
- Per-team `+1` `+2` `+3` and `−1` correction; `+/−` team foul
- Per-player select then `+1` `+2` `+3` (also bumps the team total) and `+/−` foul
- On-court / bench split with single-click substitution (select an on-court player, click a bench player to swap)
- Realtime sync between multiple scorer tabs

## Database design — current state, no event log

Tables (all UUID PKs, all RLS-enabled):

- `seasons` — name, start/end dates, is_active
- `teams` — name, short_name, logo_url, status
- `players` — full_name, display_name, status (no team_id)
- `team_players` — season_id × team_id × player_id, jersey_number, position, active
  - Partial unique index: one active assignment per (season, player)
- `matches` — owns: scores, team fouls, period, period duration, time remaining, shot clock seconds, `timer_running`, `shot_clock_running`, status
- `match_player_stats` — per-match per-player: points, fouls, **is_active** (on court)
- `score_corrections` — small audit-only table (kept tiny by design)

### Atomic operations

Five `SECURITY DEFINER` Postgres functions handle all stat changes so the
scorer never has to compute totals client-side. They are clamped at zero.

| Function | Effect |
|---|---|
| `add_player_points(match, team, player, delta)` | `match_player_stats.points` ± delta · matches.{home,away}_score ± delta |
| `add_team_points(match, team, delta)` | matches.{home,away}_score ± delta |
| `add_player_foul(match, team, player, delta)` | `match_player_stats.fouls` ± delta · matches.{home,away}_team_fouls ± delta |
| `add_team_foul(match, team, delta)` | matches.{home,away}_team_fouls ± delta |
| `substitute_player(match, team, out, in)` | flips `is_active` on the two rows |
| `seed_match_roster(match)` | idempotently inserts `match_player_stats` rows for the active roster |

Each function asserts `auth.uid() is not null` so anonymous clients can't
call them even with the publishable key.

### Realtime

Realtime is enabled on `matches` and `match_player_stats` (plus the rest
for admin convenience). The live page listens on
`postgres_changes` for the specific `match_id`.

The match timer and shot clock are stored as **snapshots** (`time_remaining_seconds`,
`shot_clock_seconds`) plus boolean `timer_running` / `shot_clock_running`.
Clients tick locally between server snapshots; the scorer persists a
fresh snapshot every 5s while running and on every pause.

### Security

- `seasons`, `teams`, `players`, `team_players`, `matches`,
  `match_player_stats` — `select` allowed for anyone, `insert/update/delete`
  allowed only for `authenticated`.
- `score_corrections` — public read, authenticated insert.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure Supabase

1. Create a project at <https://supabase.com>.
2. Open **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role** → `SUPABASE_SECRET_KEY`
3. `cp .env.example .env.local` and paste the values.

### 3. Apply the migration

In the Supabase **SQL Editor**, run the contents of
`supabase/migrations/0001_initial_schema.sql`. Or with the CLI:

```bash
supabase db push
```

This creates every table, every check constraint, the unique
"one active assignment" index, the five RPC helpers, the realtime
publication entries, and all RLS policies.

### 4. First admin user

Login uses **username + password**. Supabase Auth still keys on email under
the hood; the migration adds a `public.users` profile table linked 1:1 to
`auth.users` and an RPC that resolves username → email at sign-in.

#### Seeded admin login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `Admin@123456` |
| Email (internal) | `admin@bbscore.local` |
| Role | `admin` |

The migration tries to insert this user directly into `auth.users` +
`auth.identities`. It's wrapped in an exception handler so the migration
never fails on locked-down auth schemas — if direct seeding is blocked,
it skips quietly with a `NOTICE`.

**If login fails** (i.e. Option A was blocked):

1. Supabase Dashboard → **Authentication → Users → Add user**
   - Email: `admin@bbscore.local`
   - Password: `Admin@123456`
   - "Auto-confirm user": yes
   - User metadata:
     ```json
     { "username": "admin", "full_name": "Demo Admin", "role": "admin" }
     ```
2. Re-run `supabase db push`. The migration's upsert reconciles the
   `public.users` row and forces `username = 'admin'`, `role = 'admin'`.

If a different user already owns `username = 'admin'` (e.g. an
`admin@gmail.com` row that was backfilled earlier and squatted on the
slot), the migration renames that user to `<email-prefix>_legacy` so the
seeded admin can claim `admin`. The renamed user keeps their auth
account; they sign in with the new username (or you can rename them back
from `/admin/users`).

#### Bootstrap (existing users)

In addition to the seeded admin, the migration runs a one-time bootstrap:

> If no user has `role = 'admin'` yet, promote the oldest user to admin.

This means any account you'd already created in Supabase Auth before
running the migration also becomes an admin automatically (e.g. an
`admin@gmail.com` you added via the dashboard ends up with `username =
admin`, `role = admin`).

#### Adding more users

Once signed in as an admin, manage everyone at `/admin/users` — create
admins/scorers, reset passwords, toggle `active`/`inactive`. Or via SQL:

```sql
update public.users set role = 'admin' where username = 'jane.doe';
```

### 5. Run

```bash
npm run dev
# http://localhost:3000
```

### 6. Smoke test

The migration also seeds **2025 Season**, two teams (BB Warriors, BB
Titans) with 5 players each, a Warriors-vs-Titans scheduled match, and
`match_player_stats` rows for all ten players — so you can hit the scorer
console immediately without setting up data.

1. Sign in at `/login` as `admin` / `Admin@123456`.
2. Browse `/admin/seasons`, `/admin/teams`, `/admin/players`,
   `/admin/team-players`, `/admin/matches` — pre-seeded data should
   already be there.
3. In **Users**, create a `scorer` role user. Sign out and back in as
   that user — you should land on `/scorer/matches` and be blocked from
   `/admin`.
4. From `/admin/matches`, open the seeded match → switch its status to
   **live**, then open `/scorer/match/<id>` (one tab) and
   `/live/match/<id>` (another).
5. Tap **+2** or **▶ Start clock** — the public page mirrors instantly.

### Theme (light / dark / system)

Powered by [`next-themes`](https://github.com/pacocoursey/next-themes). The
theme toggle (sun / moon / monitor icon) is in the navbar on **every page
that has a header** — public landing, login, admin, scorer, and the live
public scoreboard.

- Three options: **Light**, **Dark**, **System** (matches the OS).
- Persisted per-user/device in `localStorage` (key: `theme`).
- The root `<html>` gets a `class="dark"` attribute when dark is active;
  Tailwind's `darkMode: "class"` and the CSS variables in
  `src/app/globals.css` switch the palette accordingly.
- Accent color is basketball orange in both modes
  (`--primary: 24 95% 53%`).

To extend the theme, edit the CSS custom properties under `:root` (light)
and `.dark` in `globals.css`. Don't hardcode hex colors in components —
use Tailwind tokens (`bg-background`, `text-foreground`, `bg-primary`,
etc.) which read from those variables.

### Branding (logo + site name)

The navbar shows a configurable logo and site name on every page that has a
header — **including the public landing page, the live scoreboard, and the
login page** (i.e. branding is loaded without authentication).

- Storage: `public.app_settings` (one row, pinned with a `singleton` boolean
  + unique index). Default `site_name = 'BB Score'`, `logo_url = null`
  (renders the basketball icon fallback).
- Read access: anyone (RLS `select using (true)`).
- Write access: only authenticated users with `role = 'admin'` and
  `status = 'active'` in `public.users`.
- Logo files: stored in the public Supabase Storage bucket **`app-assets`**,
  under `branding/logo-<timestamp>.<ext>`. Allowed mimes: PNG, JPEG, WebP,
  SVG. Max 2 MB. Bucket-level RLS mirrors the table: public read,
  admin-only insert/update/delete.

Edit at **`/admin/settings`** — admin only. The page previews the navbar
before saving. Replacing the logo uploads a new file and best-effort deletes
the previous one.

### Roles

| Role | Can access |
|---|---|
| `admin` | `/admin/*` and `/scorer/*` |
| `scorer` | `/scorer/*` only |
| (none / signed out) | `/`, `/live/match/[id]`, `/login` |

Inactive users (`status = 'inactive'`) are signed out on every load and
sent back to `/login?error=inactive`.

---

## Deploy to Vercel

1. Push to GitHub.
2. Import at <https://vercel.com/new>.
3. Add environment variables (mark `SUPABASE_SECRET_KEY` as **Secret**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
4. Deploy. In Supabase **Authentication → URL Configuration**, add the
   Vercel URL to **Site URL** and **Redirect URLs**.

`src/lib/supabase/admin.ts` imports `server-only`, so the build will
fail loudly if it's ever pulled into a client component.

---

## Project structure

```
src/
  app/
    layout.tsx
    page.tsx                       # public landing
    globals.css
    login/                         # sign-in
    auth/{callback,signout}/       # auth helpers
    admin/
      layout.tsx                   # auth gate + nav
      page.tsx                     # dashboard counters
      seasons/                     # CRUD
      teams/
      players/
      team-players/
      matches/
    scorer/
      layout.tsx                   # auth gate
      match/[matchId]/             # scorer console
    live/match/[matchId]/          # public realtime scoreboard
  components/
    ui/                            # shadcn-style primitives
    scorer/scorer-board.tsx
    live/live-scoreboard.tsx
  lib/
    supabase/{client,server,admin,middleware}.ts
    types/database.ts
    utils.ts
  middleware.ts
supabase/
  migrations/0001_initial_schema.sql
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the built app |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript without emit |
