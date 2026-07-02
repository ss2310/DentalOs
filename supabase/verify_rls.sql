-- Paste into the Supabase SQL Editor to audit RLS across the public schema.
-- Every table should show rls_enabled = true. Tenant tables should have 4
-- policies; clinics/profiles 2; notifications 4; post_types 1.

select
  c.relname                        as table_name,
  c.relrowsecurity                 as rls_enabled,
  c.relforcerowsecurity            as rls_forced,
  count(p.polname)                 as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by rls_enabled, c.relname;

-- Any row with rls_enabled = false is a tenant-isolation hole. There should
-- be none.
