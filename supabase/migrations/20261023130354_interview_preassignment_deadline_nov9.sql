-- Inclusive minute: 2026-11-09 23:59 KST. Store the exclusive end boundary.
alter table public.ip_pa_settings alter column due_at set default '2026-11-10T00:00:00+09:00';
alter table public.ip_pa_settings alter column revision_due_at set default '2026-11-10T00:00:00+09:00';
update public.ip_pa_settings set due_at='2026-11-10T00:00:00+09:00',revision_due_at='2026-11-10T00:00:00+09:00',revision=revision+1 where id;
-- Preserve enabled and allow_late; do not erase answers or submission history.
