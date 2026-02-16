/**
 * MIGRATION: LICENSING SYSTEM
 * Run this in your Supabase SQL Editor to create the licenses table.
 */

-- 1. Create Enum for license status
create type public.license_status as enum ('active', 'used', 'revoked');

-- 2. Create Licenses table
create table if not exists public.licenses (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,                    -- The license code (e.g. VOZ-1234)
  status license_status default 'active',       -- Status: active, used, revoked
  customer_email text,                          -- Buyer's email
  customer_name text,                           -- Buyer's name (optional)
  metadata jsonb default '{}'::jsonb,           -- Extra sale data (e.g. Stripe ID)
  
  -- Installation details (filled upon redemption)
  installed_at timestamptz,                     -- When it was used
  installed_url text,                           -- The Vercel project URL
  installed_version text,                       -- Template version
  
  created_at timestamptz default now()
);

-- 3. Create Index for faster lookups
create index if not exists licenses_code_idx on public.licenses(code);

-- 4. Enable Row Level Security (RLS)
alter table public.licenses enable row level security;

-- 5. Create RLS Policies
-- CRITICAL: Only the backend (service_role) should be able to access this table.
-- Public users (anon) or authenticated users (authenticated) should NOT have direct access.
-- We achieve this by creating a policy that is always false for public access, 
-- but service_role bypasses RLS automatically.

create policy "No public access" on public.licenses
  for all using (false);

-- 6. Insert a test license (Optional - remove in production)
-- Code: TEST-LICENSE-123
insert into public.licenses (code, customer_email, customer_name)
values ('TEST-LICENSE-123', 'test@vozzyup.com', 'Test User')
on conflict do nothing;
