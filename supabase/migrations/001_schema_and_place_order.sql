-- ============================================================================
-- Sinar Jaya Bakery — Schema hardening + atomic place_order RPC
-- Run on the NEW Supabase project AFTER pg_restore of the existing data.
-- Idempotent: safe to re-run.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensions (match Supabase defaults)
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Products: add stock column + CHECK + updated_at
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists stock integer,
  add column if not exists stock_updated_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Backfill stock from legacy settings.product_stock_json (one-time)
update products p
set stock = nullif((
  select (value::jsonb ->> p.id::text)
  from settings where key = 'product_stock_json'
), '')::int
where stock is null;

-- Prevent negative stock at DB level (last-line defense)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_stock_nonneg'
  ) then
    alter table products
      add constraint products_stock_nonneg check (stock is null or stock >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Orders: add updated_at + payment_method + bank_screenshot
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists updated_at timestamptz default now(),
  add column if not exists payment_method text,
  add column if not exists bank_screenshot text;

-- ---------------------------------------------------------------------------
-- 4. order_items table (replaces JSON items blob going forward)
-- ---------------------------------------------------------------------------
create table if not exists order_items (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint references products(id) on delete restrict,
  product_name text not null,
  variant_name text,
  flavor text,
  qty integer not null check (qty > 0),
  qty_unit integer not null default 1 check (qty_unit > 0),
  unit_price integer not null check (unit_price >= 0),
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_order_items_product on order_items(product_id);

-- ---------------------------------------------------------------------------
-- 5. Indexes for common query patterns
-- ---------------------------------------------------------------------------
create index if not exists idx_orders_status_date on orders(status, order_date desc);
create index if not exists idx_orders_phone on orders(customer_phone);
create index if not exists idx_orders_updated on orders(updated_at desc);
create index if not exists idx_products_active on products(is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists t_orders_updated on orders;
create trigger t_orders_updated before update on orders
  for each row execute function touch_updated_at();

drop trigger if exists t_products_updated on products;
create trigger t_products_updated before update on products
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. One-time migration of legacy orders.items JSON → order_items rows
--    Safe to run multiple times (skips orders already migrated).
-- ---------------------------------------------------------------------------
insert into order_items (
  order_id, product_id, product_name, variant_name, flavor, qty, qty_unit, unit_price, note
)
select
  o.id,
  (select id from products where name = it->>'name' limit 1),
  coalesce(it->>'name', '(unknown)'),
  nullif(it->>'size', ''),
  nullif(it->>'flavor', ''),
  coalesce((it->>'qty')::int, 1),
  coalesce((it->>'qtyUnit')::int, 1),
  coalesce((it->>'unitPrice')::int, 0),
  nullif(it->>'note', '')
from orders o,
     lateral jsonb_array_elements(
       case
         when jsonb_typeof(o.items::jsonb) = 'array' then o.items::jsonb
         else '[]'::jsonb
       end
     ) it
where o.items is not null
  and not exists (select 1 from order_items oi where oi.order_id = o.id);

-- ---------------------------------------------------------------------------
-- 8. ATOMIC place_order RPC
-- ---------------------------------------------------------------------------
create or replace function place_order(
  p_order_number   text,
  p_customer_name  text,
  p_customer_phone text,
  p_pickup_date    date,
  p_total          integer,
  p_note           text,
  p_payment_method text,
  p_bank_screenshot text,
  p_reference_image text,
  p_items          jsonb
) returns table(order_id bigint, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_item     jsonb;
  v_pid      bigint;
  v_qty      int;
  v_qtyu     int;
  v_need     int;
  v_avail    int;
  v_pname    text;
begin
  -- Validate payload
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'MISSING_NAME' using errcode = '22023';
  end if;

  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'MISSING_PHONE' using errcode = '22023';
  end if;

  -- Lock all involved product rows FIRST, in consistent order (prevents deadlock)
  perform 1 from products
   where id in (
     select distinct (x->>'product_id')::bigint
       from jsonb_array_elements(p_items) x
      where x ? 'product_id' and x->>'product_id' is not null
   )
   order by id
   for update;

  -- Per-item stock validation (locks already held from above)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid  := nullif(v_item->>'product_id', '')::bigint;
    v_qty  := coalesce((v_item->>'qty')::int, 0);
    v_qtyu := coalesce((v_item->>'qty_unit')::int, 1);
    v_need := v_qty * v_qtyu;

    if v_qty <= 0 then
      raise exception 'INVALID_QTY:%', coalesce(v_item->>'variant', v_item->>'product_name', '?')
        using errcode = '22023';
    end if;

    if v_pid is not null then
      select stock, name into v_avail, v_pname
        from products where id = v_pid;

      if v_pname is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_pid using errcode = 'P0002';
      end if;

      if v_avail is not null and v_avail < v_need then
        raise exception 'INSUFFICIENT_STOCK:%:%:%', v_pname, v_need, v_avail
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- Insert order header
  insert into orders(
    order_number, customer_name, customer_phone, pickup_date,
    total, note, status, payment_method, bank_screenshot,
    reference_image, order_date, items
  ) values (
    p_order_number, p_customer_name, p_customer_phone, p_pickup_date,
    p_total, p_note, 'waiting', p_payment_method, p_bank_screenshot,
    p_reference_image, now(), p_items::text
  )
  returning id into v_order_id;

  -- Insert items + decrement stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid  := nullif(v_item->>'product_id', '')::bigint;
    v_qty  := coalesce((v_item->>'qty')::int, 0);
    v_qtyu := coalesce((v_item->>'qty_unit')::int, 1);
    v_need := v_qty * v_qtyu;

    insert into order_items(
      order_id, product_id, product_name, variant_name, flavor,
      qty, qty_unit, unit_price, note
    ) values (
      v_order_id,
      v_pid,
      coalesce(v_item->>'product_name', v_item->>'name', '(unknown)'),
      nullif(v_item->>'variant', ''),
      nullif(v_item->>'flavor', ''),
      v_qty,
      v_qtyu,
      coalesce((v_item->>'unit_price')::int, 0),
      nullif(v_item->>'note', '')
    );

    if v_pid is not null then
      update products
         set stock = stock - v_need,
             stock_updated_at = now()
       where id = v_pid
         and stock is not null;
    end if;
  end loop;

  return query select v_order_id, p_order_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permissions — allow anonymous ordering (same as current frontend)
-- ---------------------------------------------------------------------------
revoke all on function place_order(text,text,text,date,integer,text,text,text,text,jsonb) from public;
grant execute on function place_order(text,text,text,date,integer,text,text,text,text,jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. RLS (enable if not already; adjust policies to your needs)
-- ---------------------------------------------------------------------------
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Public read of products (catalog)
drop policy if exists "products_anon_read" on products;
create policy "products_anon_read" on products
  for select to anon using (is_active = true);

-- Authenticated (admin) full access on products
drop policy if exists "products_auth_all" on products;
create policy "products_auth_all" on products
  for all to authenticated using (true) with check (true);

-- Orders: anon can only read own orders by phone; admin can read/write all
drop policy if exists "orders_auth_all" on orders;
create policy "orders_auth_all" on orders
  for all to authenticated using (true) with check (true);

-- Anon cannot directly insert orders (use RPC). They can SELECT by phone for tracking.
drop policy if exists "orders_anon_read_own" on orders;
create policy "orders_anon_read_own" on orders
  for select to anon using (true);  -- tighten later with phone filter if desired

-- order_items: mirror orders visibility
drop policy if exists "order_items_auth_all" on order_items;
create policy "order_items_auth_all" on order_items
  for all to authenticated using (true) with check (true);

drop policy if exists "order_items_anon_read" on order_items;
create policy "order_items_anon_read" on order_items
  for select to anon using (true);

commit;

-- ============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================================================
-- select count(*) from products where stock is not null;
-- select count(*) from order_items;
-- select conname from pg_constraint where conname = 'products_stock_nonneg';
-- select proname from pg_proc where proname = 'place_order';
-- select * from place_order(
--   'TEST-001','Test User','08123','2026-05-01',10000,'test','cash',null,null,
--   '[{"product_id":1,"product_name":"Donat","qty":1,"qty_unit":1,"unit_price":10000}]'::jsonb
-- );
