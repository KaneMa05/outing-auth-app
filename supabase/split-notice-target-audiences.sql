-- Split new notice targeting into the three student app categories while
-- preserving legacy 'academy' notices for both offline and online-managed students.
alter table public.notices
drop constraint if exists notices_target_audience_check;

alter table public.notices
add constraint notices_target_audience_check
check (target_audience in (
  'academy',
  'offline',
  'online_managed',
  'lecture',
  'offline,online_managed',
  'offline,lecture',
  'online_managed,lecture',
  'offline,online_managed,lecture'
));
