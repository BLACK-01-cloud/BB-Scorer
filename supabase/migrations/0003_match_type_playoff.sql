-- =============================================================================
-- BB Score — add 'playoff' to allowed match_type values.
-- Idempotent.
-- =============================================================================

alter table public.matches
  drop constraint if exists matches_type_chk;

alter table public.matches
  add constraint matches_type_chk
  check (match_type in ('league','playoff','quarter_final','semi_final','final'));
