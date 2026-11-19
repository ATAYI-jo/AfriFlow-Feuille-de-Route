-- Calls the secured brief function at 07:30 UTC each day.
-- The scheduling credential is read only from Supabase Vault.
select cron.unschedule('afriflow-daily-agro-brief')
where exists (select 1 from cron.job where jobname = 'afriflow-daily-agro-brief');

select cron.schedule(
  'afriflow-daily-agro-brief',
  '30 7 * * *',
  $job$
    select net.http_post(
      url := 'https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-agro-brief',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-afriflow-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'afriflow_agro_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $job$
);
