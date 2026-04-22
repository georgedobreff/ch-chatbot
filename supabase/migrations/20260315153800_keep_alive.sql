-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Create maintenance schema and keep_alive table
create schema if not exists maintenance;

create table if not exists maintenance.keep_alive (
  id bigint primary key generated always as identity,
  created_at timestamp with time zone default now()
);

-- Revoke all on table from public and authenticated, only allow service_role and internal processes
alter table maintenance.keep_alive enable row level security;

-- Unschedule existing jobs if they exist (to allow for migration re-runs)
select cron.unschedule('keep-alive-insert') where exists (select 1 from cron.job where jobname = 'keep-alive-insert');
select cron.unschedule('keep-alive-cleanup') where exists (select 1 from cron.job where jobname = 'keep-alive-cleanup');

-- Schedule insert every 2 days (at midnight)
-- '0 0 */2 * *' runs on day 1, 3, 5, etc.
select cron.schedule(
  'keep-alive-insert',
  '0 0 */2 * *',
  $$insert into maintenance.keep_alive default values;$$
);

-- Schedule weekly cleanup (every Sunday at midnight)
select cron.schedule(
  'keep-alive-cleanup',
  '0 0 * * 0',
  $$delete from maintenance.keep_alive;$$
);
