-- 002 FUNCTIONS, RLS, CLEANUP (run second)

-- ---------- bootstrap ----------
create or replace function public.seed_business(b uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into sales_channels(business_id,name,is_platform) values
   (b,'Counter Dine-in',false),(b,'Counter Takeaway',false),(b,'Zomato',true),(b,'Swiggy',true),(b,'Magicpin',true),(b,'ONDC platforms',true),(b,'Other online platforms',true),(b,'Other sales',false) on conflict do nothing;
  insert into purchase_items_master(business_id,name) select b,n from unnest(array['Chicken','Vegetables','Fruits','Milk','Eggs','Bread','Cheese','Butter','Cooking oil','Rice','Maida','Grocery','Spices','Beverages','Packaging','Cleaning materials','Other']) n on conflict do nothing;
  insert into suppliers(business_id,name) select b,n from unnest(array['Reliance','DMart','JioMart','Instamart','Blinkit','Flipkart','Amazon','Local vegetable supplier','Local chicken supplier','Local grocery supplier','Other']) n on conflict do nothing;
  insert into inventory_categories(business_id,name) select b,n from unnest(array['Chicken','Meat','Vegetables','Fruits','Dairy','Grocery','Spices','Beverages','Packaging','Frozen food','Cleaning materials','Other']) n on conflict do nothing;
  insert into restaurant_expense_categories(business_id,grp,name)
  select b,g,n from (values
   ('Staff','Monthly salary'),('Staff','Advance salary'),('Staff','Daily wages'),('Staff','Part-time wages'),('Staff','Overtime'),('Staff','Incentives'),('Staff','Reimbursements'),
   ('Lease & property','Shop lease'),('Lease & property','Monthly rent'),('Lease & property','Security deposit'),('Lease & property','Maintenance charges'),
   ('Parking & transport','Parking charges'),('Parking & transport','Fuel'),('Parking & transport','Delivery charges'),('Parking & transport','Loading and unloading'),
   ('Utilities','Electricity bill'),('Utilities','Water bill'),('Utilities','Gas bill'),('Utilities','Internet'),('Utilities','Telephone'),('Utilities','Generator'),
   ('Operations','Equipment repairs'),('Operations','Kitchen maintenance'),('Operations','Furniture repairs'),('Operations','Cleaning'),('Operations','Pest control'),('Operations','Packaging'),('Operations','Marketing'),('Operations','Software subscriptions'),('Operations','Licences and renewals'),
   ('Other','Miscellaneous'),('Other','Emergency payments')) v(g,n) on conflict do nothing;
end $$;

-- First signed-in user can create the business and become Owner. Works only once.
create or replace function public.bootstrap_owner(p_business text, p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare b uuid; o uuid; u uuid := auth.uid();
begin
  if u is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from user_roles where role='owner') then raise exception 'Setup already completed'; end if;
  insert into businesses(name) values (p_business) returning id into b;
  insert into outlets(business_id,name) values (b,'Main outlet') returning id into o;
  insert into profiles(id,business_id,outlet_id,full_name,email) values (u,b,o,p_name,(select email from auth.users where id=u));
  insert into user_roles values (u,'owner');
  insert into employee_details(user_id,employee_code) values (u,'EMP'||nextval('employee_seq'));
  perform seed_business(b);
  return b;
end $$;

create or replace function public.setup_needed() returns boolean language sql security definer set search_path=public as $$ select not exists(select 1 from user_roles where role='owner') $$;

-- ---------- stock movement (atomic, idempotent) ----------
create or replace function public.stock_move(p_item uuid, p_kind text, p_qty numeric, p_unit text, p_at timestamptz,
  p_reason text default null, p_notes text default null, p_key text default null, p_allow_negative boolean default false)
returns stock_transactions language plpgsql security definer set search_path=public as $$
declare it inventory_items; u measurement_units; delta numeric; prev numeric; nw numeric; nm text; r stock_transactions; biz uuid := my_business();
begin
  if biz is null then raise exception 'Account inactive or not set up'; end if;
  if p_kind not in ('IN','OUT','ADJUST') then raise exception 'Bad kind'; end if;
  if p_kind='IN' and not has_perm('stock.in') then raise exception 'Not allowed to add stock'; end if;
  if p_kind='OUT' and not has_perm('stock.out') then raise exception 'Not allowed to reduce stock'; end if;
  if p_kind='ADJUST' and not is_mgr() then raise exception 'Only Owner/Manager can adjust stock'; end if;
  if p_qty is null or p_qty<=0 and p_kind<>'ADJUST' then raise exception 'Quantity must be positive'; end if;
  if p_key is not null then select * into r from stock_transactions where client_key=p_key; if found then return r; end if; end if;
  select * into it from inventory_items where id=p_item and business_id=biz and deleted_at is null for update;
  if not found then raise exception 'Item not found'; end if;
  select * into u from measurement_units where code=upper(p_unit);
  if not found or u.dimension<>it.dimension then raise exception 'Unit % is not compatible with this item', p_unit; end if;
  delta := p_qty*u.to_base;
  prev := it.qty_base;
  if p_kind='IN' then nw := prev+delta;
  elsif p_kind='OUT' then nw := prev-delta;
  else nw := delta; end if;  -- ADJUST: p_qty is the new counted quantity
  if nw<0 and not (p_allow_negative and is_mgr()) then raise exception 'Insufficient stock: only % available', prev; end if;
  perform set_config('app.stock_move','on',true);
  update inventory_items set qty_base=nw where id=it.id;
  perform set_config('app.stock_move','off',true);
  select full_name into nm from profiles where id=auth.uid();
  insert into stock_transactions(business_id,outlet_id,item_id,txn_at,kind,qty_base,entered_qty,entered_unit,prev_base,new_base,reason,notes,employee_id,employee_name,client_key)
  values (biz,it.outlet_id,it.id,coalesce(p_at,now()),p_kind,case when p_kind='ADJUST' then nw-prev else delta end,p_qty,upper(p_unit),prev,nw,p_reason,p_notes,auth.uid(),nm,p_key) returning * into r;
  insert into inventory_activity_logs select r.*, it.name;
  return r;
end $$;

-- ---------- sales ----------
create or replace function public.add_sale(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; biz uuid := my_business(); ch sales_channels; at timestamptz := coalesce((p->>'txn_at')::timestamptz, now());
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  select * into ch from sales_channels where id=(p->>'channel_id')::uuid and business_id=biz;
  if not found then raise exception 'Channel not found'; end if;
  insert into sales_entries(business_id,outlet_id,channel_id,txn_at,gross,payment_method,reference_no,commission,refund,notes,created_by)
  values (biz,(select outlet_id from profiles where id=auth.uid()),ch.id,at,(p->>'gross')::numeric,coalesce(p->>'payment_method','Cash'),p->>'reference_no',coalesce((p->>'commission')::numeric,0),coalesce((p->>'refund')::numeric,0),p->>'notes',auth.uid()) returning sales_entries.id into id;
  -- platform sales are NOT cash received at sale time; they arrive via settlement.
  if not ch.is_platform and (p->>'gross')::numeric>0 then
    insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by)
    values (biz,at,'in',case when p->>'payment_method'='Card' then 'Card' when p->>'payment_method'='UPI' then 'UPI' when p->>'payment_method'='Other' then 'Other' else 'Cash' end,
            (p->>'gross')::numeric - coalesce((p->>'refund')::numeric,0),'sale',id,ch.name,auth.uid());
  end if;
  return id;
end $$;

create or replace function public.add_settlement(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; biz uuid := my_business(); ch sales_channels;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  select * into ch from sales_channels where id=(p->>'channel_id')::uuid and business_id=biz;
  if not found then raise exception 'Channel not found'; end if;
  insert into platform_settlements(business_id,channel_id,period_from,period_to,gross,commission,refunds,adjustments,received,settled_on,reference_no,notes,created_by)
  values (biz,ch.id,(p->>'period_from')::date,(p->>'period_to')::date,coalesce((p->>'gross')::numeric,0),coalesce((p->>'commission')::numeric,0),coalesce((p->>'refunds')::numeric,0),coalesce((p->>'adjustments')::numeric,0),(p->>'received')::numeric,(p->>'settled_on')::date,p->>'reference_no',p->>'notes',auth.uid()) returning platform_settlements.id into id;
  insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by)
  values (biz,(p->>'settled_on')::date::timestamptz,'in','Bank Transfer',(p->>'received')::numeric,'settlement',id,ch.name||' settlement',auth.uid());
  return id;
end $$;

-- ---------- purchases ----------
create or replace function public.add_purchase(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; biz uuid := my_business(); it jsonb; tot numeric := 0; pay numeric; pm text := p->>'payment_method'; paym text; at timestamptz := coalesce((p->>'txn_at')::timestamptz, now()); ex uuid;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p->>'client_key' is not null then select purchases.id into ex from purchases where client_key=p->>'client_key'; if found then return ex; end if; end if;
  if jsonb_array_length(coalesce(p->'items','[]'))=0 then raise exception 'Add at least one item'; end if;
  for it in select * from jsonb_array_elements(p->'items') loop tot := tot + round((it->>'qty')::numeric*(it->>'rate')::numeric,2); end loop;
  if pm='Credit / Udhaar' then pay := least(coalesce((p->>'paid_now')::numeric,0),tot); paym := coalesce(p->>'paid_method','Cash');
  else pay := tot; paym := pm; end if;
  insert into purchases(business_id,outlet_id,supplier_id,txn_at,invoice_no,payment_method,total,paid,due_date,receipt_url,notes,client_key,created_by)
  values (biz,(select outlet_id from profiles where id=auth.uid()),nullif(p->>'supplier_id','')::uuid,at,p->>'invoice_no',pm,tot,pay,nullif(p->>'due_date','')::date,p->>'receipt_url',p->>'notes',p->>'client_key',auth.uid()) returning purchases.id into id;
  for it in select * from jsonb_array_elements(p->'items') loop
    insert into purchase_items(purchase_id,item_name,category,qty,unit,rate) values (id,it->>'item_name',it->>'category',(it->>'qty')::numeric,it->>'unit',(it->>'rate')::numeric);
  end loop;
  if pay>0 then
    insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by) values (biz,at,'out',paym,pay,'purchase',id,'Purchase '||coalesce(p->>'invoice_no',''),auth.uid());
  end if;
  return id;
end $$;

-- Pays supplier; allocates oldest-first when no purchase given.
create or replace function public.pay_supplier(p_supplier uuid, p_amount numeric, p_method text, p_at timestamptz default now(), p_purchase uuid default null, p_ref text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare biz uuid := my_business(); sp uuid; rem numeric := p_amount; r record; take numeric; outstanding numeric;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  select coalesce(sum(total-paid),0) into outstanding from purchases where supplier_id=p_supplier and business_id=biz and deleted_at is null and (p_purchase is null or id=p_purchase);
  if p_amount<=0 or p_amount>outstanding then raise exception 'Amount must be between 0 and outstanding (%)', outstanding; end if;
  insert into supplier_payments(business_id,supplier_id,purchase_id,paid_at,amount,method,reference_no,notes,created_by) values (biz,p_supplier,p_purchase,coalesce(p_at,now()),p_amount,p_method,p_ref,p_notes,auth.uid()) returning id into sp;
  for r in select id,total-paid as due from purchases where supplier_id=p_supplier and business_id=biz and deleted_at is null and total>paid and (p_purchase is null or id=p_purchase) order by txn_at for update loop
    exit when rem<=0; take := least(rem,r.due); update purchases set paid=paid+take where id=r.id; rem := rem-take;
  end loop;
  insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by) values (biz,coalesce(p_at,now()),'out',p_method,p_amount,'supplier_payment',sp,'Supplier payment',auth.uid());
  return sp;
end $$;

-- ---------- restaurant & staff payments ----------
create or replace function public.add_restaurant_payment(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; biz uuid := my_business(); amt numeric := (p->>'amount')::numeric; paid numeric; st text := coalesce(p->>'status','Paid'); at timestamptz := coalesce((p->>'paid_at')::timestamptz, now()); ex uuid;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p->>'client_key' is not null then select restaurant_payments.id into ex from restaurant_payments where client_key=p->>'client_key'; if found then return ex; end if; end if;
  paid := case st when 'Paid' then amt when 'Partially Paid' then least(coalesce((p->>'paid_amount')::numeric,0),amt) else 0 end;
  insert into restaurant_payments(business_id,outlet_id,category_id,paid_at,description,paid_to,amount,paid_amount,method,reference_no,status,due_date,notes,receipt_url,client_key,created_by)
  values (biz,(select outlet_id from profiles where id=auth.uid()),nullif(p->>'category_id','')::uuid,at,p->>'description',p->>'paid_to',amt,paid,p->>'method',p->>'reference_no',st,nullif(p->>'due_date','')::date,p->>'notes',p->>'receipt_url',p->>'client_key',auth.uid()) returning restaurant_payments.id into id;
  if paid>0 then insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by) values (biz,at,'out',coalesce(p->>'method','Cash'),paid,'restaurant_payment',id,p->>'description',auth.uid()); end if;
  return id;
end $$;

create or replace function public.add_staff_payment(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; biz uuid := my_business(); at timestamptz := coalesce((p->>'paid_at')::timestamptz, now()); ex uuid;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p->>'client_key' is not null then select staff_payments.id into ex from staff_payments where client_key=p->>'client_key'; if found then return ex; end if; end if;
  insert into staff_payments(business_id,employee_id,employee_name,kind,paid_at,amount,method,notes,client_key,created_by)
  values (biz,nullif(p->>'employee_id','')::uuid,(select full_name from profiles where id=nullif(p->>'employee_id','')::uuid),p->>'kind',at,(p->>'amount')::numeric,coalesce(p->>'method','Cash'),p->>'notes',p->>'client_key',auth.uid()) returning staff_payments.id into id;
  insert into cash_transactions(business_id,txn_at,direction,method,amount,source_type,source_id,description,created_by) values (biz,at,'out',coalesce(p->>'method','Cash'),(p->>'amount')::numeric,'staff_payment',id,p->>'kind',auth.uid());
  return id;
end $$;

-- ---------- soft delete / reversal (history is kept) ----------
create or replace function public.void_record(p_table text, p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare src text;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p_table not in ('sales_entries','platform_settlements','purchases','restaurant_payments','staff_payments') then raise exception 'Unsupported table'; end if;
  execute format('update %I set deleted_at=now() where id=$1 and business_id=my_business() and deleted_at is null', p_table) using p_id;
  src := case p_table when 'sales_entries' then 'sale' when 'platform_settlements' then 'settlement' when 'purchases' then 'purchase' when 'restaurant_payments' then 'restaurant_payment' else 'staff_payment' end;
  update cash_transactions set reversed=true where source_id=p_id and source_type=src;
  if p_table='purchases' then update cash_transactions set reversed=true where source_type='supplier_payment' and source_id in (select id from supplier_payments where purchase_id=p_id); end if;
end $$;

-- ---------- report summary (authoritative, DB-side) ----------
create or replace function public.report_summary(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare biz uuid := my_business(); f timestamptz := (p_from::text||' 00:00 Asia/Kolkata')::timestamptz; t timestamptz := ((p_to+1)::text||' 00:00 Asia/Kolkata')::timestamptz; res jsonb;
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
   'gross_sales',(select coalesce(sum(gross-refund),0) from sales_entries where business_id=biz and deleted_at is null and txn_at>=f and txn_at<t),
   'sales_by_channel',(select coalesce(jsonb_agg(jsonb_build_object('channel',c.name,'gross',x.g,'commission',x.c,'refund',x.r)),'[]') from (select channel_id,sum(gross) g,sum(commission) c,sum(refund) r from sales_entries where business_id=biz and deleted_at is null and txn_at>=f and txn_at<t group by 1) x join sales_channels c on c.id=x.channel_id),
   'sales_by_method',(select coalesce(jsonb_object_agg(payment_method,s),'{}') from (select payment_method,sum(gross-refund) s from sales_entries where business_id=biz and deleted_at is null and txn_at>=f and txn_at<t group by 1) z),
   'settlements_received',(select coalesce(sum(received),0) from platform_settlements where business_id=biz and deleted_at is null and settled_on between p_from and p_to),
   'pending_settlement',(select coalesce(sum(s.gross-s.commission-s.refund),0)-coalesce((select sum(received) from platform_settlements where business_id=biz and deleted_at is null),0) from (select sum(gross) gross,sum(commission) commission,sum(refund) refund from sales_entries e join sales_channels c on c.id=e.channel_id where e.business_id=biz and e.deleted_at is null and c.is_platform) s),
   'cash_in',(select coalesce(sum(amount),0) from cash_transactions where business_id=biz and not reversed and direction='in' and method='Cash' and txn_at>=f and txn_at<t),
   'cash_out',(select coalesce(sum(amount),0) from cash_transactions where business_id=biz and not reversed and direction='out' and method='Cash' and txn_at>=f and txn_at<t),
   'out_by_source',(select coalesce(jsonb_object_agg(source_type,s),'{}') from (select source_type,sum(amount) s from cash_transactions where business_id=biz and not reversed and direction='out' and txn_at>=f and txn_at<t group by 1) q),
   'out_by_method',(select coalesce(jsonb_object_agg(method,s),'{}') from (select method,sum(amount) s from cash_transactions where business_id=biz and not reversed and direction='out' and txn_at>=f and txn_at<t group by 1) q),
   'in_by_method',(select coalesce(jsonb_object_agg(method,s),'{}') from (select method,sum(amount) s from cash_transactions where business_id=biz and not reversed and direction='in' and txn_at>=f and txn_at<t group by 1) q),
   'purchases_total',(select coalesce(sum(total),0) from purchases where business_id=biz and deleted_at is null and txn_at>=f and txn_at<t),
   'credit_outstanding',(select coalesce(sum(total-paid),0) from purchases where business_id=biz and deleted_at is null),
   'opening_cash',(select coalesce(sum(case direction when 'in' then amount else -amount end),0)+coalesce((select opening_cash from daily_cash_closings where business_id=biz and closing_date=p_from),0) from cash_transactions where business_id=biz and not reversed and method='Cash' and txn_at<f),
   'deposits',(select coalesce(sum(deposits),0) from daily_cash_closings where business_id=biz and closing_date between p_from and p_to),
   'withdrawals',(select coalesce(sum(withdrawals),0) from daily_cash_closings where business_id=biz and closing_date between p_from and p_to)
  ) into res;
  insert into report_generation_logs(business_id,user_id,report,period_from,period_to,format) values (biz,auth.uid(),'summary',p_from,p_to,'view');
  return res;
end $$;

-- ---------- cleanup: only the 7-day log. stock_transactions are permanent. ----------
create or replace function public.cleanup_activity_logs() returns void language sql security definer set search_path=public as $$
  delete from inventory_activity_logs where created_at < now() - interval '7 days' $$;
do $$ begin
  begin create extension if not exists pg_cron;
    perform cron.schedule('cleanup-activity-logs','30 20 * * *','select public.cleanup_activity_logs()');
  exception when others then raise notice 'pg_cron not enabled: enable it under Database > Extensions, then run: select cron.schedule(''cleanup-activity-logs'',''30 20 * * *'',''select public.cleanup_activity_logs()'');';
  end;
end $$;

-- ---------- permission admin (Owner/Manager) ----------
create or replace function public.set_employee_permissions(p_user uuid, p_perms text[]) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p_user=auth.uid() then raise exception 'You cannot change your own permissions'; end if;
  if (select role from user_roles where user_id=p_user)<>'employee' then raise exception 'Permissions are managed only for employees'; end if;
  if not exists(select 1 from profiles where id=p_user and business_id=my_business()) then raise exception 'Unknown user'; end if;
  delete from employee_permissions where user_id=p_user;
  insert into employee_permissions select p_user, x from unnest(p_perms) x;
end $$;

create or replace function public.set_user_active(p_user uuid, p_active boolean) returns void language plpgsql security definer set search_path=public as $$
declare tr text := (select role from user_roles where user_id=p_user);
begin
  if not is_mgr() then raise exception 'Not allowed'; end if;
  if p_user=auth.uid() then raise exception 'You cannot deactivate yourself'; end if;
  if tr='owner' then raise exception 'Owner cannot be deactivated'; end if;
  if tr='manager' and my_role()<>'owner' then raise exception 'Only Owner can change a Manager'; end if;
  update profiles set active=p_active where id=p_user and business_id=my_business();
end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['businesses','outlets','profiles','user_roles','employee_details','role_permissions','employee_permissions','sales_channels','sales_entries','platform_settlements','cash_transactions','daily_cash_closings','suppliers','purchase_items_master','purchases','purchase_items','supplier_payments','measurement_units','inventory_categories','inventory_items','stock_transactions','inventory_activity_logs','restaurant_expense_categories','restaurant_payments','staff_payments','lease_payments','parking_payments','audit_logs','report_generation_logs'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

-- identity tables: read own business; NO client writes to roles/permissions (RPC / edge function only)
create policy biz_read on businesses for select using (id=my_business());
create policy biz_upd on businesses for update using (id=my_business() and my_role()='owner');
create policy outlets_read on outlets for select using (business_id=my_business());
create policy outlets_write on outlets for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy profiles_read on profiles for select using (id=auth.uid() or (business_id=my_business() and is_mgr()));
create policy roles_read on user_roles for select using (user_id=auth.uid() or (is_mgr() and exists(select 1 from profiles p where p.id=user_id and p.business_id=my_business())));
create policy details_read on employee_details for select using (user_id=auth.uid() or (is_mgr() and exists(select 1 from profiles p where p.id=user_id and p.business_id=my_business())));
create policy details_write on employee_details for update using (is_mgr() and exists(select 1 from profiles p where p.id=user_id and p.business_id=my_business()));
create policy rp_read on role_permissions for select using (auth.uid() is not null);
create policy ep_read on employee_permissions for select using (user_id=auth.uid() or (is_mgr() and exists(select 1 from profiles p where p.id=user_id and p.business_id=my_business())));
create policy units_read on measurement_units for select using (auth.uid() is not null);

-- financial tables: Owner/Manager only (read + write)
do $$ declare t text; begin
  foreach t in array array['sales_entries','platform_settlements','cash_transactions','daily_cash_closings','purchases','supplier_payments','restaurant_payments','staff_payments','lease_payments','parking_payments'] loop
    execute format('create policy fin_sel on %I for select using (business_id=my_business() and is_mgr())', t);
  end loop; end $$;
-- writes to ledgers go through RPCs; direct writes allowed only for non-ledger edits by managers
create policy closings_write on daily_cash_closings for insert with check (business_id=my_business() and is_mgr());
create policy closings_upd on daily_cash_closings for update using (business_id=my_business() and is_mgr());
create policy sales_upd on sales_entries for update using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy purchase_items_sel on purchase_items for select using (exists(select 1 from purchases p where p.id=purchase_id and p.business_id=my_business()) and is_mgr());

-- masters
create policy channels_sel on sales_channels for select using (business_id=my_business() and is_mgr());
create policy channels_w on sales_channels for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy suppliers_sel on suppliers for select using (business_id=my_business() and (is_mgr() or has_perm('inventory.view')));
create policy suppliers_w on suppliers for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy pim_sel on purchase_items_master for select using (business_id=my_business() and is_mgr());
create policy pim_w on purchase_items_master for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy rec_sel on restaurant_expense_categories for select using (business_id=my_business() and is_mgr());
create policy rec_w on restaurant_expense_categories for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());

-- inventory: employees read with permission; manager writes item details (qty changes only via stock_move)
create policy icat_sel on inventory_categories for select using (business_id=my_business() and has_perm('inventory.view'));
create policy icat_w on inventory_categories for all using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy items_sel on inventory_items for select using (business_id=my_business() and has_perm('inventory.view'));
create policy items_ins on inventory_items for insert with check (business_id=my_business() and is_mgr() and qty_base=0);
create policy items_upd on inventory_items for update using (business_id=my_business() and is_mgr()) with check (business_id=my_business() and is_mgr());
create policy st_sel on stock_transactions for select using (business_id=my_business() and (is_mgr() or (has_perm('inventory.activity') and employee_id=auth.uid()) or has_perm('inventory.activity_all')));
create policy log_sel on inventory_activity_logs for select using (business_id=my_business() and (is_mgr() or (has_perm('inventory.activity') and employee_id=auth.uid()) or has_perm('inventory.activity_all')));
-- prevent direct qty edits by anyone, including managers, outside stock_move
create or replace function public.guard_qty() returns trigger language plpgsql as $$
begin
  if new.qty_base is distinct from old.qty_base and current_setting('app.stock_move', true) is distinct from 'on' then raise exception 'Stock quantity can only change through stock movements'; end if;
  return new; end $$;
create trigger guard_qty before update on inventory_items for each row execute function guard_qty();
-- let stock_move set the flag
create or replace function public.stock_move_flag() returns void language sql as $$ select set_config('app.stock_move','on',true) $$;

create policy audit_sel on audit_logs for select using (business_id=my_business() and is_mgr());
create policy rgl_sel on report_generation_logs for select using (business_id=my_business() and is_mgr());

grant execute on function public.setup_needed() to anon, authenticated;

-- helper for the Edge Function (service role only)
create or replace function public.nextval_employee_code() returns text language sql security definer set search_path=public as $$ select 'EMP'||nextval('employee_seq') $$;
revoke execute on function public.nextval_employee_code() from public, anon, authenticated;
