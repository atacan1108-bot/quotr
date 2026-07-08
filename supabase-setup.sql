-- ============================================================
-- Quotr — Supabase database setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Profiles (one per user, auto-created on signup)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  company_name text,
  email text,
  phone text,
  address text,
  kvk_number text,
  iban text,
  created_at timestamptz default now()
);

-- Clients
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  created_at timestamptz default now()
);

-- Quotes
create table if not exists quotes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  quote_number text not null,
  title text,
  status text default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  valid_until date,
  notes text,
  subtotal numeric(10,2) default 0,
  vat_amount numeric(10,2) default 0,
  total numeric(10,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Quote line items
create table if not exists quote_items (
  id uuid default gen_random_uuid() primary key,
  quote_id uuid references quotes(id) on delete cascade not null,
  description text not null,
  category text,
  quantity numeric(10,2) default 1,
  unit text default 'st',
  unit_price numeric(10,2) not null default 0,
  total_price numeric(10,2) generated always as (quantity * unit_price) stored,
  sort_order integer default 0
);

-- ============================================================
-- Row Level Security (keeps each user's data private)
-- ============================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;

-- Profiles
create policy "own profile" on profiles for all using (auth.uid() = id);

-- Clients
create policy "own clients" on clients for all using (auth.uid() = user_id);

-- Quotes
create policy "own quotes" on quotes for all using (auth.uid() = user_id);

-- Quote items (access allowed if the parent quote belongs to the user)
create policy "own quote items" on quote_items for all
  using (
    exists (
      select 1 from quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

-- ============================================================
-- Auto-create profile when a new user signs up
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, company_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'company_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- Auto-update updated_at on quotes
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quotes_updated_at on quotes;
create trigger quotes_updated_at
  before update on quotes
  for each row execute procedure update_updated_at();
