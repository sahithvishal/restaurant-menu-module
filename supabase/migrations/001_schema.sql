-- 001 SCHEMA (run first)
create extension if not exists pgcrypto;

create table businesses(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table outlets(id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses on delete cascade, name text not null, active boolean default true, created_at timestamptz default now());

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  business_id uuid references businesses, outlet_id uuid references outlets,
  full_name text, email text, active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table user_roles(user_id uuid primary key references auth.users on delete cascade, role text not null check (role in ('owner','manager','employee')));
create table employee_details(
  user_id uuid primary key references auth.users on delete cascade,
  employee_code text unique, mobile text, designation text,
  department text check (department in ('Kitchen','Cashier','Inventory','Store','Delivery','Administration','Other')),
  joining_date date, avatar_url text, created_at timestamptz default now());
create sequence employee_seq start 1001;
create table role_permissions(role text, permission text, primary key(role,permission));
create table employee_permissions(user_id uuid references auth.users on delete cascade, permission text, primary key(user_id,permission));

-- helpers
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$ select role from user_roles where user_id=auth.uid() $$;
create or replace function public.my_business() returns uuid language sql stable security definer set search_path=public as $$ select business_id from profiles where id=auth.uid() and active $$;
create or replace function public.is_mgr() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(my_role() in ('owner','manager') and exists(select 1 from profiles where id=auth.uid() and active),false) $$;
create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path=public as $$
  select is_mgr() or exists(select 1 from employee_permissions ep join profiles pr on pr.id=ep.user_id where ep.user_id=auth.uid() and ep.permission=p and pr.active) $$;

-- cash book / sales
create table sales_channels(id uuid primary key default gen_random_uuid(), business_id uuid not null, name text not null, is_platform boolean default false, active boolean default true, unique(business_id,name));
create table sales_entries(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid,
  channel_id uuid not null references sales_channels, txn_at timestamptz not null default now(),
  gross numeric(14,2) not null check (gross>=0), payment_method text not null check (payment_method in ('Cash','UPI','Card','Other')),
  reference_no text, commission numeric(14,2) default 0, refund numeric(14,2) default 0, notes text,
  deleted_at timestamptz, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table platform_settlements(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, channel_id uuid not null references sales_channels,
  period_from date, period_to date, gross numeric(14,2) default 0, commission numeric(14,2) default 0, refunds numeric(14,2) default 0, adjustments numeric(14,2) default 0,
  received numeric(14,2) not null, settled_on date not null, reference_no text, notes text, deleted_at timestamptz, created_by uuid, created_at timestamptz default now());
create table cash_transactions(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid,
  txn_at timestamptz not null, direction text not null check (direction in ('in','out')),
  method text not null check (method in ('Cash','UPI','Card','Credit Card','Debit Card','Bank Transfer','Other')),
  amount numeric(14,2) not null check (amount>0), source_type text not null, source_id uuid, description text,
  reversed boolean default false, created_by uuid, created_at timestamptz default now());
create index on cash_transactions(business_id,txn_at);
create table daily_cash_closings(id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid, closing_date date not null, opening_cash numeric(14,2) default 0, deposits numeric(14,2) default 0, withdrawals numeric(14,2) default 0, counted_cash numeric(14,2), notes text, created_by uuid, created_at timestamptz default now(), unique(business_id,closing_date));

-- suppliers / purchases
create table suppliers(id uuid primary key default gen_random_uuid(), business_id uuid not null, name text not null, contact_person text, mobile text, email text, address text, gst_no text, category text, notes text, active boolean default true, deleted_at timestamptz, created_at timestamptz default now(), unique(business_id,name));
create table purchase_items_master(id uuid primary key default gen_random_uuid(), business_id uuid not null, name text not null, category text, active boolean default true, unique(business_id,name));
create table purchases(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid, supplier_id uuid references suppliers,
  txn_at timestamptz not null default now(), invoice_no text, payment_method text not null, total numeric(14,2) not null check (total>=0),
  paid numeric(14,2) not null default 0 check (paid>=0), due_date date, receipt_url text, notes text, client_key text unique,
  deleted_at timestamptz, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table purchase_items(id uuid primary key default gen_random_uuid(), purchase_id uuid not null references purchases on delete cascade, item_name text not null, category text, qty numeric(14,3) not null check(qty>0), unit text not null, rate numeric(14,2) not null check(rate>=0), amount numeric(14,2) generated always as (round(qty*rate,2)) stored);
create table supplier_payments(id uuid primary key default gen_random_uuid(), business_id uuid not null, supplier_id uuid not null references suppliers, purchase_id uuid references purchases, paid_at timestamptz not null default now(), amount numeric(14,2) not null check(amount>0), method text not null, reference_no text, notes text, created_by uuid, created_at timestamptz default now());

-- inventory
create table measurement_units(code text primary key, label text not null, dimension text not null check (dimension in ('weight','volume','count')), to_base numeric(14,6) not null, base_code text not null);
create table inventory_categories(id uuid primary key default gen_random_uuid(), business_id uuid not null, name text not null, unique(business_id,name));
create table inventory_items(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid, name text not null, code text, category text,
  dimension text not null, base_unit text not null, display_unit text not null,
  qty_base numeric(18,4) not null default 0, min_base numeric(18,4) default 0, max_base numeric(18,4),
  purchase_price numeric(14,2) default 0, supplier_id uuid references suppliers, expiry_date date, location text, active boolean default true,
  deleted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), unique(business_id,name));
create table stock_transactions(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid, item_id uuid not null references inventory_items,
  txn_at timestamptz not null, kind text not null check (kind in ('IN','OUT','ADJUST')), qty_base numeric(18,4) not null,
  entered_qty numeric(18,4) not null, entered_unit text not null, prev_base numeric(18,4) not null, new_base numeric(18,4) not null,
  reason text, notes text, employee_id uuid not null, employee_name text, client_key text unique, created_at timestamptz default now());
create index on stock_transactions(item_id,txn_at);
create table inventory_activity_logs(like stock_transactions including defaults, item_name text);
alter table inventory_activity_logs add primary key(id);
create index on inventory_activity_logs(created_at);

-- expenses
create table restaurant_expense_categories(id uuid primary key default gen_random_uuid(), business_id uuid not null, grp text not null, name text not null, active boolean default true, unique(business_id,name));
create table restaurant_payments(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, outlet_id uuid, category_id uuid references restaurant_expense_categories,
  paid_at timestamptz not null default now(), description text, paid_to text, amount numeric(14,2) not null check(amount>0), paid_amount numeric(14,2) not null default 0,
  method text, reference_no text, status text not null default 'Paid' check (status in ('Paid','Partially Paid','Pending','Overdue')), due_date date, notes text, receipt_url text,
  client_key text unique, deleted_at timestamptz, created_by uuid, created_at timestamptz default now());
create table staff_payments(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, employee_id uuid references auth.users, employee_name text,
  kind text not null check (kind in ('Salary','Advance','Daily wages','Part-time wages','Overtime','Incentive','Reimbursement','Other')),
  paid_at timestamptz not null default now(), amount numeric(14,2) not null check(amount>0), method text, status text default 'Paid', notes text, client_key text unique, deleted_at timestamptz, created_by uuid, created_at timestamptz default now());
create table lease_payments(id uuid primary key default gen_random_uuid(), payment_id uuid references restaurant_payments, business_id uuid not null, landlord text, period text);
create table parking_payments(id uuid primary key default gen_random_uuid(), payment_id uuid references restaurant_payments, business_id uuid not null, vehicle text, location text);

create table audit_logs(id bigint generated always as identity primary key, business_id uuid, user_id uuid, table_name text, row_id text, action text, old_data jsonb, new_data jsonb, at timestamptz default now());
create table report_generation_logs(id uuid primary key default gen_random_uuid(), business_id uuid, user_id uuid, report text, period_from date, period_to date, format text, at timestamptz default now());

-- audit trigger on sensitive tables
create or replace function public.audit_fn() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into audit_logs(business_id,user_id,table_name,row_id,action,old_data,new_data)
  values ((to_jsonb(coalesce(new,old))->>'business_id')::uuid, auth.uid(), tg_table_name, to_jsonb(coalesce(new,old))->>'id', tg_op,
          case when tg_op<>'INSERT' then to_jsonb(old) end, case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
do $$ declare t text; begin
  foreach t in array array['sales_entries','platform_settlements','cash_transactions','suppliers','purchases','supplier_payments','inventory_items','restaurant_payments','staff_payments','user_roles','profiles','daily_cash_closings'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit_fn()', t);
  end loop; end $$;

create or replace function public.touch() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','sales_entries','purchases','inventory_items'] loop execute format('create trigger touch_%1$s before update on %1$s for each row execute function touch()', t); end loop; end $$;

-- permanent ledgers cannot be deleted
create or replace function public.no_delete() returns trigger language plpgsql as $$ begin raise exception 'Deleting from % is not allowed; use reversal or soft delete', tg_table_name; end $$;
create trigger nd_stock before delete on stock_transactions for each row execute function no_delete();
create trigger nd_cash before delete on cash_transactions for each row execute function no_delete();

-- seed units + default employee permissions
insert into measurement_units values
('KG','Kilogram','weight',1000,'GM'),('GM','Gram','weight',1,'GM'),('MG','Milligram','weight',0.001,'GM'),
('L','Litre','volume',1000,'ML'),('ML','Millilitre','volume',1,'ML'),
('PCS','Pieces','count',1,'PCS'),('PKT','Packets','count',1,'PKT'),('BOX','Boxes','count',1,'BOX'),('BTL','Bottles','count',1,'BTL'),('CAN','Cans','count',1,'CAN'),
('DOZ','Dozens','count',1,'DOZ'),('BDL','Bundles','count',1,'BDL'),('BAG','Bags','count',1,'BAG'),('TRY','Trays','count',1,'TRY'),('CTN','Cartons','count',1,'CTN'),('SET','Sets','count',1,'SET');
insert into role_permissions(role,permission) select 'employee',p from unnest(array['dashboard.view','inventory.view','stock.in','stock.out','inventory.activity','inventory.reports']) p;
