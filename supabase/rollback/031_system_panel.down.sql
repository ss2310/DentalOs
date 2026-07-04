-- Rollback 031_system_panel.sql

-- Re-point the lifecycle cron back to the bare function, then drop the wrapper.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'subscription-lifecycle') then
      perform cron.unschedule('subscription-lifecycle');
    end if;
    perform cron.schedule('subscription-lifecycle', '45 1 * * *',
      $cron$select run_subscription_lifecycle();$cron$);
  end if;
end;
$$;

drop function if exists run_subscription_lifecycle_hb();
drop function if exists record_heartbeat(text, text, text);

drop table if exists system_heartbeats;
drop table if exists applied_migrations;
drop table if exists feature_flag_defaults;
