-- =============================================================================
-- BB Score — per-shot-type counters on match_player_stats.
-- Adds pts_1 / pts_2 / pts_3 directly after the existing `points` column,
-- plus an RPC that records a single made shot (bumps the bucket + total +
-- team score atomically). Idempotent — safe to re-run.
--
-- Postgres can't insert a column at a chosen position with ALTER TABLE, so
-- we rebuild the table to get the desired column order. The rebuild is
-- guarded: if the order is already correct, it no-ops.
-- =============================================================================

do $$
declare
  v_points_pos int;
  v_pts1_pos   int;
  v_pts2_pos   int;
  v_pts3_pos   int;
  v_has_pts1   boolean;
  v_has_pts2   boolean;
  v_has_pts3   boolean;
  v_correct    boolean;
  v_select_pts1 text;
  v_select_pts2 text;
  v_select_pts3 text;
begin
  -- ---- Inspect current shape ----------------------------------------------
  select ordinal_position into v_points_pos
    from information_schema.columns
   where table_schema='public' and table_name='match_player_stats'
     and column_name='points';

  select ordinal_position into v_pts1_pos
    from information_schema.columns
   where table_schema='public' and table_name='match_player_stats'
     and column_name='pts_1';
  select ordinal_position into v_pts2_pos
    from information_schema.columns
   where table_schema='public' and table_name='match_player_stats'
     and column_name='pts_2';
  select ordinal_position into v_pts3_pos
    from information_schema.columns
   where table_schema='public' and table_name='match_player_stats'
     and column_name='pts_3';

  v_has_pts1 := v_pts1_pos is not null;
  v_has_pts2 := v_pts2_pos is not null;
  v_has_pts3 := v_pts3_pos is not null;

  v_correct :=
        v_pts1_pos is not null and v_pts1_pos = v_points_pos + 1
    and v_pts2_pos is not null and v_pts2_pos = v_points_pos + 2
    and v_pts3_pos is not null and v_pts3_pos = v_points_pos + 3;

  if v_correct then
    raise notice 'match_player_stats column order is already correct — skipping rebuild.';
    return;
  end if;

  -- ---- Drop from realtime publication (re-added at end) -------------------
  begin
    execute 'alter publication supabase_realtime drop table public.match_player_stats';
  exception when others then null;
  end;

  -- ---- Build new table with the desired column order ---------------------
  create table public.match_player_stats_new (
    id uuid primary key default gen_random_uuid(),
    match_id uuid not null references public.matches(id) on delete cascade,
    team_id uuid not null references public.teams(id) on delete restrict,
    player_id uuid not null references public.players(id) on delete cascade,
    points int not null default 0,
    pts_1 int not null default 0,
    pts_2 int not null default 0,
    pts_3 int not null default 0,
    fouls int not null default 0,
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (match_id, player_id),
    constraint mps_points_chk check (points >= 0),
    constraint mps_pts_1_chk  check (pts_1  >= 0),
    constraint mps_pts_2_chk  check (pts_2  >= 0),
    constraint mps_pts_3_chk  check (pts_3  >= 0),
    constraint mps_fouls_chk  check (fouls  >= 0)
  );

  -- ---- Copy data, defaulting missing buckets to 0 -------------------------
  v_select_pts1 := case when v_has_pts1 then 'pts_1' else '0' end;
  v_select_pts2 := case when v_has_pts2 then 'pts_2' else '0' end;
  v_select_pts3 := case when v_has_pts3 then 'pts_3' else '0' end;

  execute format($q$
    insert into public.match_player_stats_new
      (id, match_id, team_id, player_id,
       points, pts_1, pts_2, pts_3,
       fouls, is_active, created_at, updated_at)
    select id, match_id, team_id, player_id,
           points, %s, %s, %s,
           fouls, is_active, created_at, updated_at
      from public.match_player_stats
  $q$, v_select_pts1, v_select_pts2, v_select_pts3);

  -- ---- Swap old → new -----------------------------------------------------
  drop table public.match_player_stats cascade;
  alter table public.match_player_stats_new rename to match_player_stats;

  -- ---- Indexes ------------------------------------------------------------
  create index if not exists mps_match_idx
    on public.match_player_stats(match_id);
  create index if not exists mps_match_team_idx
    on public.match_player_stats(match_id, team_id);

  -- ---- updated_at trigger -------------------------------------------------
  drop trigger if exists mps_set_updated_at on public.match_player_stats;
  create trigger mps_set_updated_at before update on public.match_player_stats
    for each row execute function public.tg_set_updated_at();

  -- ---- RLS (game data: public read, authenticated write) ------------------
  alter table public.match_player_stats enable row level security;

  drop policy if exists match_player_stats_public_read on public.match_player_stats;
  create policy match_player_stats_public_read on public.match_player_stats
    for select using (true);

  drop policy if exists match_player_stats_auth_insert on public.match_player_stats;
  create policy match_player_stats_auth_insert on public.match_player_stats
    for insert to authenticated with check (true);

  drop policy if exists match_player_stats_auth_update on public.match_player_stats;
  create policy match_player_stats_auth_update on public.match_player_stats
    for update to authenticated using (true) with check (true);

  drop policy if exists match_player_stats_auth_delete on public.match_player_stats;
  create policy match_player_stats_auth_delete on public.match_player_stats
    for delete to authenticated using (true);

  -- ---- Realtime publication ----------------------------------------------
  begin
    execute 'alter publication supabase_realtime add table public.match_player_stats';
  exception when duplicate_object then null;
           when others then null;
  end;
end $$;

-- =============================================================================
-- Record-a-made-shot RPC
-- Atomic: bumps the matching pts_N counter + total `points` on the row, and
-- the team score on the match.
-- =============================================================================
create or replace function public.record_player_made_shot(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_point_value int
) returns void as $$
declare
  v_home uuid;
  v_away uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_point_value not in (1, 2, 3) then
    raise exception 'p_point_value must be 1, 2, or 3 (got %)', p_point_value;
  end if;

  select home_team_id, away_team_id into v_home, v_away
    from public.matches where id = p_match_id;

  if p_team_id = v_home then
    update public.matches
       set home_score = greatest(home_score + p_point_value, 0)
     where id = p_match_id;
  elsif p_team_id = v_away then
    update public.matches
       set away_score = greatest(away_score + p_point_value, 0)
     where id = p_match_id;
  else
    raise exception 'team_id does not belong to this match';
  end if;

  insert into public.match_player_stats (
    match_id, team_id, player_id, points, pts_1, pts_2, pts_3
  ) values (
    p_match_id, p_team_id, p_player_id, p_point_value,
    case when p_point_value = 1 then 1 else 0 end,
    case when p_point_value = 2 then 1 else 0 end,
    case when p_point_value = 3 then 1 else 0 end
  )
  on conflict (match_id, player_id) do update set
    points = greatest(public.match_player_stats.points + p_point_value, 0),
    pts_1  = case when p_point_value = 1
                  then public.match_player_stats.pts_1 + 1
                  else public.match_player_stats.pts_1 end,
    pts_2  = case when p_point_value = 2
                  then public.match_player_stats.pts_2 + 1
                  else public.match_player_stats.pts_2 end,
    pts_3  = case when p_point_value = 3
                  then public.match_player_stats.pts_3 + 1
                  else public.match_player_stats.pts_3 end,
    updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;
