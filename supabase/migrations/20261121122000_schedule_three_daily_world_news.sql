-- Three automatic world-news editions daily (UTC). Existing cron secret is read from Vault.
select cron.unschedule('afriflow-daily-agro-brief')
where exists(select 1 from cron.job where jobname='afriflow-daily-agro-brief');

select cron.unschedule(jobname)
from cron.job where jobname like 'afriflow-world-news-%';

select cron.schedule('afriflow-world-news-morning','30 7 * * *',
$job$ select net.http_post(
 url := 'https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-agro-brief',
 headers := jsonb_build_object('Content-Type','application/json','x-afriflow-cron-secret',
  (select decrypted_secret from vault.decrypted_secrets where name='afriflow_agro_cron_secret')),
 body := '{"slot":"morning"}'::jsonb, timeout_milliseconds := 90000);
$job$);
select cron.schedule('afriflow-world-news-afternoon','30 13 * * *',
$job$ select net.http_post(
 url := 'https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-agro-brief',
 headers := jsonb_build_object('Content-Type','application/json','x-afriflow-cron-secret',
  (select decrypted_secret from vault.decrypted_secrets where name='afriflow_agro_cron_secret')),
 body := '{"slot":"afternoon"}'::jsonb, timeout_milliseconds := 90000);
$job$);
select cron.schedule('afriflow-world-news-evening','30 19 * * *',
$job$ select net.http_post(
 url := 'https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-agro-brief',
 headers := jsonb_build_object('Content-Type','application/json','x-afriflow-cron-secret',
  (select decrypted_secret from vault.decrypted_secrets where name='afriflow_agro_cron_secret')),
 body := '{"slot":"evening"}'::jsonb, timeout_milliseconds := 90000);
$job$);
