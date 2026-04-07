-- Run this in your Supabase SQL Editor
-- Go to: supabase.com → your project → SQL Editor → New Query → paste & run

create table orders (
  id              bigint generated always as identity primary key,
  order_id        text not null unique,
  customer_name   text not null,
  customer_phone  text not null,
  customer_email  text,
  items           jsonb not null,
  subtotal        numeric not null,
  delivery        numeric not null,
  total           numeric not null,
  delivery_address text not null,
  notes           text,
  mpesa_code      text not null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

-- Index for faster lookups
create index orders_created_at_idx on orders (created_at desc);
create index orders_status_idx on orders (status);
