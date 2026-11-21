-- Allow authenticated AfriFloW members to read only automatically generated
-- agroalimentaire bulletins. Do not grant access to arbitrary private announcements,
-- unpublished records, expired news or shareholder financial information.
-- The function serving Dropbox media independently checks the same requirements.
drop policy if exists "af_market_authenticated_agro_briefs_read" on public.afriflow_market_products;

create policy "af_market_authenticated_agro_briefs_read"
on public.afriflow_market_products
for select to authenticated
using (
  is_active = true
  and listing_type = 'announcement'
  and category = 'Veille agroalimentaire'
  and audience = 'shareholders'
  and promotion_label like 'Brief IA · %'
  and (expires_at is null or expires_at > now())
  and (
    (select af_is_admin()) or exists (
      select 1 from public.afriflow_market_profiles member
      where member.user_id = (select auth.uid())
    )
  )
);
