-- =============================================================================
-- BB Score — add `flash_notification` toggle to app_settings.
-- Controls whether the live page renders the animated score-event popup.
-- Idempotent.
-- =============================================================================

alter table public.app_settings
  add column if not exists flash_notification boolean not null default true;
