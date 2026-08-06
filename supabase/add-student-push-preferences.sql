alter table public.student_push_subscriptions
add column if not exists enabled boolean not null default true;

alter table public.student_push_subscriptions
add column if not exists notification_preferences jsonb not null
default '{"admin":true,"study":true,"study_cafe":true,"question_board":true}'::jsonb;

alter table public.student_push_subscriptions
drop constraint if exists student_push_subscriptions_notification_preferences_object;

alter table public.student_push_subscriptions
add constraint student_push_subscriptions_notification_preferences_object
check (jsonb_typeof(notification_preferences) = 'object');
