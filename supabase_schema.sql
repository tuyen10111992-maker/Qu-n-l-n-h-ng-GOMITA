-- Gomita Flow - Supabase Hybrid Schema
-- Dán nội dung này vào mục SQL Editor trên Supabase Dashboard và nhấn Run.

-- 1. Bảng quản lý người dùng (Đồng bộ tài khoản)
create table if not exists app_users (
  id text primary key,
  name text not null,
  username text not null unique,
  password text not null,
  role text not null,
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);

-- 2. Bảng quản lý nhân sự (Đồng bộ từ Google Sheet)
create table if not exists app_staff (
  id text primary key,
  email text,
  name text not null,
  code text,
  dept text,
  position text,
  "salaryType" text,
  "hourlySalary" numeric default 0,
  "dailySalary" numeric default 0,
  "monthlySalary" numeric default 0,
  "configAllowance" numeric default 0,
  "actualAllowance" numeric default 0,
  "actualDays" numeric default 0,
  month text,
  rate numeric default 0,
  status text,
  created_at timestamptz default now()
);

-- 3. Bảng quản lý đơn hàng (Mô hình lai JSONB để tối ưu băng thông)
create table if not exists app_orders (
  id text primary key,
  code text not null,
  customer text not null,
  address text not null,
  phone text not null,
  content text,
  stage text not null,
  owner text,
  priority text,
  due text,
  next text,
  note text,
  zalo text,
  "estimateProduction" numeric default 0,
  "quoteProduction" numeric default 0,
  "quoteAccessory" numeric default 0,
  estimate numeric default 0,
  quote numeric default 0,
  locked boolean default false,
  "accessoriesList" text,
  "deletedAt" text,
  source text,
  extras jsonb default '[]'::jsonb,
  payments jsonb default '[]'::jsonb,
  costs jsonb default '[]'::jsonb,
  labor jsonb default '[]'::jsonb,
  logs jsonb default '[]'::jsonb,
  "updatedAt" timestamptz default now()
);

-- Kích hoạt chính sách Row Level Security (RLS) để cho phép Anon Key truy cập
alter table app_users enable row level security;
alter table app_staff enable row level security;
alter table app_orders enable row level security;

-- Tạo các chính sách cho phép đọc/ghi từ ứng dụng client thông qua anon key
create policy "Allow all operations for app_users" on app_users for all using (true) with check (true);
create policy "Allow all operations for app_staff" on app_staff for all using (true) with check (true);
create policy "Allow all operations for app_orders" on app_orders for all using (true) with check (true);
