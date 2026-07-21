-- Gomita Flow - nâng cấp tài liệu đơn hàng và tài khoản Sale
-- Chạy một lần trong Supabase Dashboard > SQL Editor.

alter table public.app_users
  add column if not exists email text;

alter table public.app_orders
  add column if not exists "saleOwnerId" text;

alter table public.app_orders
  add column if not exists documents jsonb default '{}'::jsonb;

update public.app_orders
set documents = '{}'::jsonb
where documents is null;

create unique index if not exists app_users_email_unique
  on public.app_users (lower(email))
  where email is not null and btrim(email) <> '';

create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'Allow all operations for app_settings'
  ) then
    create policy "Allow all operations for app_settings"
      on public.app_settings for all using (true) with check (true);
  end if;
end
$$;

-- Kiểm tra các tài khoản chưa có email để cập nhật trong giao diện:
select id, name, username, role
from public.app_users
where email is null or btrim(email) = ''
order by name;
