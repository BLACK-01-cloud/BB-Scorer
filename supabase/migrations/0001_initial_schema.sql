-- =============================================================================
-- BB Score — initial schema, RPCs, RLS, storage, and seed data.
-- Apply via the Supabase SQL editor or `supabase db push`.
-- Idempotent: re-running will not duplicate rows or policies.
-- =============================================================================

-- =============================================================================
-- 1. Extensions
-- =============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- 2. Trigger helper — `updated_at` bumper
-- =============================================================================
create or replace function public.tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end; $$ language plpgsql;

-- =============================================================================
-- 3. Username helpers (used by the auth → public.users bridge)
-- =============================================================================
create or replace function public.sanitize_username(p_raw text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(p_raw, ''), '[^a-zA-Z0-9._-]', '', 'g'));
$$;

create or replace function public.pick_unique_username(p_base text)
returns text as $$
declare
  v_base text := nullif(public.sanitize_username(p_base), '');
  v_candidate text;
  v_attempts int := 0;
begin
  v_base := coalesce(v_base, 'user');
  if length(v_base) < 2 then v_base := v_base || 'r'; end if;
  v_candidate := v_base;
  while exists (select 1 from public.users where username = v_candidate) loop
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'could not allocate unique username for base=%', p_base;
    end if;
    v_candidate := v_base || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end loop;
  return v_candidate;
end;
$$ language plpgsql volatile security definer set search_path = public;

-- =============================================================================
-- 4. Schema
-- =============================================================================

-- ---- Seasons ----------------------------------------------------------------
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint seasons_dates_chk check (end_date >= start_date)
);
create index if not exists seasons_active_idx on public.seasons(is_active);

-- ---- Teams ------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  logo_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint teams_status_chk check (status in ('active','inactive','archived'))
);
create index if not exists teams_status_idx on public.teams(status);

-- ---- Players ----------------------------------------------------------------
-- `photo_url` points at the public URL of the profile image stored in the
-- `app-assets` bucket under `players/<timestamp>.<ext>`.
-- `position` is the player's primary position (e.g. PG/SG/SF/PF/C). It belongs
-- on the player, not on team_players, since position doesn't change per season.
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  display_name text,
  photo_url text,
  position text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint players_status_chk check (status in ('active','inactive','archived'))
);
-- Upgrade-safe: ensure both new columns exist on pre-existing tables.
alter table public.players add column if not exists photo_url text;
alter table public.players add column if not exists position  text;
create index if not exists players_status_idx on public.players(status);

-- ---- Team players (per-season roster) ---------------------------------------
-- Position is intentionally not here — it lives on `players`.
create table if not exists public.team_players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  jersey_number text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Upgrade-safe: drop the old per-assignment position column if present, after
-- moving any data over to public.players.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'team_players'
       and column_name  = 'position'
  ) then
    update public.players p
       set position = sub.position
      from (
        select distinct on (player_id) player_id, position
          from public.team_players
         where position is not null
         order by player_id, created_at desc
      ) sub
     where sub.player_id = p.id and p.position is null;
    alter table public.team_players drop column position;
  end if;
end $$;
-- One active assignment per (season, player).
create unique index if not exists team_players_one_active_per_season
  on public.team_players(season_id, player_id)
  where active = true;
-- Jersey numbers unique within an active (season, team).
create unique index if not exists team_players_unique_jersey
  on public.team_players(season_id, team_id, jersey_number)
  where jersey_number is not null and active = true;
create index if not exists team_players_team_idx   on public.team_players(team_id);
create index if not exists team_players_season_idx on public.team_players(season_id);
create index if not exists team_players_player_idx on public.team_players(player_id);

-- ---- Matches ----------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  match_type text not null default 'league',
  match_status text not null default 'scheduled',
  match_date timestamptz not null,
  venue text,
  current_period int not null default 1,
  period_duration_seconds int not null default 600,
  time_remaining_seconds int not null default 600,
  shot_clock_seconds int not null default 24,
  shot_clock_running boolean not null default false,
  timer_running boolean not null default false,
  home_score int not null default 0,
  away_score int not null default 0,
  home_team_fouls int not null default 0,
  away_team_fouls int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_teams_diff      check (home_team_id <> away_team_id),
  constraint matches_type_chk        check (match_type in ('league','quarter_final','semi_final','final')),
  constraint matches_status_chk      check (match_status in ('scheduled','live','paused','completed','cancelled')),
  constraint matches_period_chk      check (current_period between 1 and 10),
  constraint matches_period_dur_chk  check (period_duration_seconds > 0),
  constraint matches_time_chk        check (time_remaining_seconds >= 0),
  constraint matches_shot_clock_chk  check (shot_clock_seconds between 0 and 24),
  constraint matches_scores_chk      check (home_score >= 0 and away_score >= 0),
  constraint matches_team_fouls_chk  check (home_team_fouls >= 0 and away_team_fouls >= 0)
);
create index if not exists matches_season_idx on public.matches(season_id);
create index if not exists matches_status_idx on public.matches(match_status);
create index if not exists matches_date_idx   on public.matches(match_date);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at before update on public.matches
  for each row execute function public.tg_set_updated_at();

-- ---- Match player stats (current state per match × player) ------------------
create table if not exists public.match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete cascade,
  points int not null default 0,
  fouls int not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id),
  constraint mps_points_chk check (points >= 0),
  constraint mps_fouls_chk  check (fouls >= 0)
);
create index if not exists mps_match_idx      on public.match_player_stats(match_id);
create index if not exists mps_match_team_idx on public.match_player_stats(match_id, team_id);

drop trigger if exists mps_set_updated_at on public.match_player_stats;
create trigger mps_set_updated_at before update on public.match_player_stats
  for each row execute function public.tg_set_updated_at();

-- ---- Score corrections (small audit-only table) ----------------------------
create table if not exists public.score_corrections (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists score_corrections_match_idx on public.score_corrections(match_id);

-- ---- Users (1:1 with auth.users) -------------------------------------------
-- App login is username + password. Supabase Auth still keys on email under
-- the hood; the login page resolves username → email via an RPC. Passwords
-- are never stored here.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  full_name text,
  role text not null default 'scorer',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_username_lower_chk  check (username = lower(username)),
  constraint users_username_format_chk check (username ~ '^[a-z0-9._-]+$' and length(username) between 2 and 64),
  constraint users_role_chk            check (role in ('admin','scorer')),
  constraint users_status_chk          check (status in ('active','inactive'))
);
create unique index if not exists users_username_idx on public.users(username);
create unique index if not exists users_email_idx    on public.users(email);
create index        if not exists users_role_idx     on public.users(role);
create index        if not exists users_status_idx   on public.users(status);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.tg_set_updated_at();

-- ---- App settings (single-row branding: site name + logo) -------------------
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  site_name text not null default 'BB Score',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton_chk check (singleton = true)
);
create unique index if not exists app_settings_singleton_idx on public.app_settings(singleton);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 5. Auth → public.users bridge
-- =============================================================================
-- raw_user_meta_data is user-controllable on signup. Only role values that
-- pass the allowlist are accepted. There is no public sign-up — the only
-- path that sets this metadata is the admin server action gated by
-- requireAdmin().
create or replace function public.tg_handle_new_auth_user()
returns trigger as $$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_email     text  := lower(new.email);
  v_username  text;
  v_full_name text;
  v_role      text;
begin
  if v_email is null then return new; end if;

  v_username := nullif(public.sanitize_username(v_meta->>'username'), '');
  if v_username is null then
    v_username := nullif(public.sanitize_username(split_part(v_email, '@', 1)), '');
  end if;
  v_username := public.pick_unique_username(coalesce(v_username, 'user'));

  v_full_name := nullif(trim(v_meta->>'full_name'), '');

  v_role := lower(coalesce(v_meta->>'role', ''));
  if v_role not in ('admin', 'scorer') then v_role := 'scorer'; end if;

  insert into public.users (id, username, email, full_name, role, status)
  values (new.id, v_username, v_email, v_full_name, v_role, 'active')
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists handle_new_auth_user on auth.users;
create trigger handle_new_auth_user
  after insert on auth.users
  for each row execute function public.tg_handle_new_auth_user();

-- One-time bootstrap: copy any pre-existing auth.users into public.users.
insert into public.users (id, username, email)
select u.id,
       public.pick_unique_username(coalesce(
         nullif(public.sanitize_username(u.raw_user_meta_data->>'username'), ''),
         nullif(public.sanitize_username(split_part(lower(u.email), '@', 1)), ''),
         'user'
       )),
       lower(u.email)
  from auth.users u
  left join public.users p on p.id = u.id
 where p.id is null and u.email is not null;

-- One-time bootstrap: if no admin exists, promote the oldest user.
do $$
begin
  if not exists (select 1 from public.users where role = 'admin') then
    update public.users
       set role = 'admin'
     where id = (select id from public.users order by created_at asc limit 1);
  end if;
end $$;

-- =============================================================================
-- 6. Helper: is the current user an active admin?
-- SECURITY DEFINER so it bypasses RLS on public.users (used in RLS policies).
-- =============================================================================
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
     where id = auth.uid()
       and role = 'admin'
       and status = 'active'
  );
$$ language sql stable security definer set search_path = public;

-- =============================================================================
-- 7. RPCs — atomic score / foul / sub mutations (clamped at zero)
-- All require an authenticated caller.
-- =============================================================================

create or replace function public.add_player_points(
  p_match_id uuid, p_team_id uuid, p_player_id uuid, p_delta int
) returns void as $$
declare v_home uuid; v_away uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_delta = 0 then return; end if;

  select home_team_id, away_team_id into v_home, v_away
  from public.matches where id = p_match_id;

  if p_team_id = v_home then
    update public.matches set home_score = greatest(home_score + p_delta, 0)
     where id = p_match_id;
  elsif p_team_id = v_away then
    update public.matches set away_score = greatest(away_score + p_delta, 0)
     where id = p_match_id;
  else
    raise exception 'team_id does not belong to this match';
  end if;

  insert into public.match_player_stats (match_id, team_id, player_id, points)
    values (p_match_id, p_team_id, p_player_id, greatest(p_delta, 0))
  on conflict (match_id, player_id) do update set
    points     = greatest(public.match_player_stats.points + p_delta, 0),
    updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.add_team_points(
  p_match_id uuid, p_team_id uuid, p_delta int
) returns void as $$
declare v_home uuid; v_away uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_delta = 0 then return; end if;

  select home_team_id, away_team_id into v_home, v_away
  from public.matches where id = p_match_id;

  if p_team_id = v_home then
    update public.matches set home_score = greatest(home_score + p_delta, 0)
     where id = p_match_id;
  elsif p_team_id = v_away then
    update public.matches set away_score = greatest(away_score + p_delta, 0)
     where id = p_match_id;
  else
    raise exception 'team_id does not belong to this match';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.add_player_foul(
  p_match_id uuid, p_team_id uuid, p_player_id uuid, p_delta int
) returns void as $$
declare v_home uuid; v_away uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_delta = 0 then return; end if;

  select home_team_id, away_team_id into v_home, v_away
  from public.matches where id = p_match_id;

  if p_team_id = v_home then
    update public.matches set home_team_fouls = greatest(home_team_fouls + p_delta, 0)
     where id = p_match_id;
  elsif p_team_id = v_away then
    update public.matches set away_team_fouls = greatest(away_team_fouls + p_delta, 0)
     where id = p_match_id;
  else
    raise exception 'team_id does not belong to this match';
  end if;

  insert into public.match_player_stats (match_id, team_id, player_id, fouls)
    values (p_match_id, p_team_id, p_player_id, greatest(p_delta, 0))
  on conflict (match_id, player_id) do update set
    fouls      = greatest(public.match_player_stats.fouls + p_delta, 0),
    updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.add_team_foul(
  p_match_id uuid, p_team_id uuid, p_delta int
) returns void as $$
declare v_home uuid; v_away uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_delta = 0 then return; end if;

  select home_team_id, away_team_id into v_home, v_away
  from public.matches where id = p_match_id;

  if p_team_id = v_home then
    update public.matches set home_team_fouls = greatest(home_team_fouls + p_delta, 0)
     where id = p_match_id;
  elsif p_team_id = v_away then
    update public.matches set away_team_fouls = greatest(away_team_fouls + p_delta, 0)
     where id = p_match_id;
  else
    raise exception 'team_id does not belong to this match';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.substitute_player(
  p_match_id uuid, p_team_id uuid, p_out_player_id uuid, p_in_player_id uuid
) returns void as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  update public.match_player_stats set is_active = false, updated_at = now()
   where match_id = p_match_id and team_id = p_team_id and player_id = p_out_player_id;

  update public.match_player_stats set is_active = true, updated_at = now()
   where match_id = p_match_id and team_id = p_team_id and player_id = p_in_player_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Idempotently inserts match_player_stats rows for every active roster
-- member of both teams in this match's season.
create or replace function public.seed_match_roster(p_match_id uuid)
returns void as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  insert into public.match_player_stats (match_id, team_id, player_id)
  select m.id, tp.team_id, tp.player_id
    from public.matches m
    join public.team_players tp
      on tp.season_id = m.season_id
     and tp.team_id in (m.home_team_id, m.away_team_id)
     and tp.active = true
   where m.id = p_match_id
  on conflict (match_id, player_id) do nothing;
end;
$$ language plpgsql security definer set search_path = public;

-- Login: resolve username → email. Anon-callable. Returns null if the user
-- doesn't exist or is inactive; the caller should always show a generic
-- "invalid username or password" so account state isn't leaked.
create or replace function public.get_login_email_by_username(input_username text)
returns text as $$
  select email
    from public.users
   where username = lower(coalesce(input_username, ''))
     and status = 'active'
   limit 1;
$$ language sql stable security definer set search_path = public;

revoke all on function public.get_login_email_by_username(text) from public;
grant execute on function public.get_login_email_by_username(text) to anon, authenticated;

-- =============================================================================
-- 8. Realtime publication
-- =============================================================================
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'matches','match_player_stats','teams','players','team_players','seasons'
    ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when others then null;
    end;
  end loop;
end $$;

-- =============================================================================
-- 9. Row-Level Security
-- =============================================================================
alter table public.seasons             enable row level security;
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.team_players        enable row level security;
alter table public.matches             enable row level security;
alter table public.match_player_stats  enable row level security;
alter table public.score_corrections   enable row level security;
alter table public.users               enable row level security;
alter table public.app_settings        enable row level security;

-- Game data: public read, authenticated write (insert/update/delete).
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'seasons','teams','players','team_players','matches','match_player_stats'
    ])
  loop
    execute format($f$
      drop policy if exists "%1$s_public_read" on public.%1$I;
      create policy "%1$s_public_read" on public.%1$I
        for select using (true);

      drop policy if exists "%1$s_auth_insert" on public.%1$I;
      create policy "%1$s_auth_insert" on public.%1$I
        for insert to authenticated with check (true);

      drop policy if exists "%1$s_auth_update" on public.%1$I;
      create policy "%1$s_auth_update" on public.%1$I
        for update to authenticated using (true) with check (true);

      drop policy if exists "%1$s_auth_delete" on public.%1$I;
      create policy "%1$s_auth_delete" on public.%1$I
        for delete to authenticated using (true);
    $f$, t);
  end loop;
end $$;

-- score_corrections: public read, authenticated insert.
drop policy if exists score_corrections_public_read on public.score_corrections;
create policy score_corrections_public_read on public.score_corrections
  for select using (true);

drop policy if exists score_corrections_auth_insert on public.score_corrections;
create policy score_corrections_auth_insert on public.score_corrections
  for insert to authenticated with check (true);

-- users: self-read; admins read/write all.
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select to authenticated using (id = auth.uid());

drop policy if exists users_admin_read on public.users;
create policy users_admin_read on public.users
  for select to authenticated using (public.is_admin());

drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users
  for insert to authenticated with check (public.is_admin());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users
  for delete to authenticated using (public.is_admin());

-- app_settings: public read (branding shows on /, /login, /live), admin writes.
drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings
  for select using (true);

drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert on public.app_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_settings_admin_delete on public.app_settings;
create policy app_settings_admin_delete on public.app_settings
  for delete to authenticated using (public.is_admin());

-- =============================================================================
-- 10. Storage: `app-assets` bucket (public read, admin write)
-- Used for the navbar logo, team logos, and player profile images.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets', 'app-assets', true,
  2097152, -- 2 MB
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists app_assets_public_read on storage.objects;
create policy app_assets_public_read on storage.objects
  for select using (bucket_id = 'app-assets');

drop policy if exists app_assets_admin_insert on storage.objects;
create policy app_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists app_assets_admin_update on storage.objects;
create policy app_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'app-assets' and public.is_admin())
  with check (bucket_id = 'app-assets' and public.is_admin());

drop policy if exists app_assets_admin_delete on storage.objects;
create policy app_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'app-assets' and public.is_admin());

-- =============================================================================
-- 11. Seed
-- =============================================================================

-- App settings singleton row.
insert into public.app_settings (singleton)
values (true)
on conflict (singleton) do nothing;

-- Admin user (admin@bbscore.local / Admin@123456).
-- Tries to seed auth.users + auth.identities directly; falls back silently
-- if the auth schema is locked down. Either way, the upsert at the end
-- forces public.users for this account to username='admin', role='admin'.
do $$
declare
  v_id       uuid;
  v_email    text := 'admin@bbscore.local';
  v_password text := 'Admin@123456';
begin
  select id into v_id from auth.users where email = v_email limit 1;

  if v_id is null then
    v_id := gen_random_uuid();
    begin
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_id, 'authenticated', 'authenticated', v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username','admin','full_name','Demo Admin','role','admin'),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
        'email', v_id::text,
        now(), now(), now()
      );
    exception when others then
      raise notice
        'Could not seed auth.users for %: %. Add the user via the Supabase dashboard and re-run.',
        v_email, sqlerrm;
      v_id := null;
    end;
  end if;

  if v_id is not null then
    -- Free up `username = 'admin'` if another user is squatting on it.
    update public.users
       set username = public.pick_unique_username(
             coalesce(nullif(split_part(email, '@', 1), ''), 'user') || '_legacy'
           )
     where username = 'admin' and id <> v_id;

    insert into public.users (id, username, email, full_name, role, status)
    values (v_id, 'admin', v_email, 'Demo Admin', 'admin', 'active')
    on conflict (id) do update set
      username  = excluded.username,
      email     = excluded.email,
      full_name = excluded.full_name,
      role      = excluded.role,
      status    = excluded.status;
  end if;
end $$;

-- Demo data: 2025 Season, two teams, 5 players each, one scheduled match.
do $$
declare
  v_season_id   uuid;
  v_warriors_id uuid;
  v_titans_id   uuid;
  v_match_id    uuid;
  v_player_id   uuid;
  v_warrior_names   text[] := array['John Carter','Alex Brown','Mike Wilson','Chris Lee','Daniel King'];
  v_warrior_jerseys text[] := array['7','9','12','15','21'];
  v_titan_names     text[] := array['Ryan Smith','Kevin Adams','Noah Clark','Ethan Scott','Liam Turner'];
  v_titan_jerseys   text[] := array['4','8','11','14','23'];
  i int;
begin
  insert into public.seasons (name, start_date, end_date, is_active)
  select '2025 Season', '2025-01-01'::date, '2025-12-31'::date, true
  where not exists (select 1 from public.seasons where name = '2025 Season');

  select id into v_season_id from public.seasons where name = '2025 Season' limit 1;

  insert into public.teams (name, short_name) values
    ('BB Warriors', 'BBW'),
    ('BB Titans',   'BBT')
  on conflict (name) do nothing;

  select id into v_warriors_id from public.teams where name = 'BB Warriors' limit 1;
  select id into v_titans_id   from public.teams where name = 'BB Titans'   limit 1;

  for i in 1..array_length(v_warrior_names, 1) loop
    insert into public.players (full_name)
    select v_warrior_names[i]
    where not exists (select 1 from public.players where full_name = v_warrior_names[i]);

    select id into v_player_id from public.players
     where full_name = v_warrior_names[i] limit 1;

    insert into public.team_players (season_id, team_id, player_id, jersey_number, active)
    select v_season_id, v_warriors_id, v_player_id, v_warrior_jerseys[i], true
    where not exists (
      select 1 from public.team_players
       where season_id = v_season_id
         and player_id = v_player_id
         and active = true
    );
  end loop;

  for i in 1..array_length(v_titan_names, 1) loop
    insert into public.players (full_name)
    select v_titan_names[i]
    where not exists (select 1 from public.players where full_name = v_titan_names[i]);

    select id into v_player_id from public.players
     where full_name = v_titan_names[i] limit 1;

    insert into public.team_players (season_id, team_id, player_id, jersey_number, active)
    select v_season_id, v_titans_id, v_player_id, v_titan_jerseys[i], true
    where not exists (
      select 1 from public.team_players
       where season_id = v_season_id
         and player_id = v_player_id
         and active = true
    );
  end loop;

  insert into public.matches (
    season_id, home_team_id, away_team_id, match_type, match_status,
    match_date, venue,
    period_duration_seconds, time_remaining_seconds, shot_clock_seconds,
    home_score, away_score, home_team_fouls, away_team_fouls
  )
  select v_season_id, v_warriors_id, v_titans_id, 'league', 'scheduled',
         (now() + interval '1 day'), 'Demo Arena',
         600, 600, 24,
         0, 0, 0, 0
  where not exists (
    select 1 from public.matches
     where season_id = v_season_id
       and home_team_id = v_warriors_id
       and away_team_id = v_titans_id
  );

  select id into v_match_id from public.matches
   where season_id = v_season_id
     and home_team_id = v_warriors_id
     and away_team_id = v_titans_id
   limit 1;

  insert into public.match_player_stats
    (match_id, team_id, player_id, points, fouls, is_active)
  select v_match_id, tp.team_id, tp.player_id, 0, 0, true
    from public.team_players tp
   where tp.season_id = v_season_id
     and tp.team_id in (v_warriors_id, v_titans_id)
     and tp.active = true
  on conflict (match_id, player_id) do nothing;
end $$;
