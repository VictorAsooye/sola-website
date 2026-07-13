-- Sola AI Consulting — demo_requests table
-- Run once in the Supabase SQL editor for the project you're connecting the site to.
-- The serverless function at /api/request-demo writes here using the service_role key.

create table if not exists demo_requests (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Section 01 — Company
  company_name      text not null,
  care_type         text,
  city_state        text,
  team_size         text,

  -- Section 02 — Contact
  contact_name      text not null,
  contact_role      text,
  email             text not null,
  phone             text,

  -- Section 03 — Pain points
  pain_points       text[] not null default '{}',
  pain_details      text,

  -- Section 04 — Example paperwork
  example_form      text,

  -- Section 05 — Look and feel
  brand_color       text,
  brand_color_name  text,
  tagline           text,

  -- Section 06 — Timeline
  timeline          text,

  -- Provenance
  source            text,
  user_agent        text
);

create index if not exists demo_requests_created_at_idx
  on demo_requests (created_at desc);

create index if not exists demo_requests_email_idx
  on demo_requests (email);

-- Row-Level Security: block ALL direct client access.
-- Only the service_role key (used by the serverless function) bypasses RLS.
alter table demo_requests enable row level security;

-- No policies are created intentionally. Without a policy, anon + authenticated
-- can neither read nor write. The service_role key skips RLS entirely, which is
-- what /api/request-demo uses server-side.

-- Quick sanity query (Vic, run this after a test submission):
-- select id, created_at, company_name, contact_name, email, care_type, pain_points
-- from demo_requests order by created_at desc limit 10;
