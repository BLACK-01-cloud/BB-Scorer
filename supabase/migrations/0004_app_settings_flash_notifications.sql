-- =============================================================================
-- BB Score — add `flash_notification` toggle to app_settings + publish the
-- table on the supabase_realtime channel so client pages can react to setting
-- changes without a page refresh. Idempotent.
-- =============================================================================

alter table public.app_settings
  add column if not exists flash_notification boolean not null default true;

-- Add app_settings to the supabase realtime publication so postgres_changes
-- subscriptions in the browser receive admin updates immediately.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.app_settings';
  exception
    when duplicate_object then null;
    when others then null;
  end;
end $$;
