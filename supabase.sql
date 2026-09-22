create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null unique,
  name text,
  language text default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  active_product text,
  stage text not null default 'NEW',
  objection_type text,
  status text not null default 'open',
  last_customer_message_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check(direction in ('inbound','outbound')),
  body text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_provider_id_unique
on messages(provider_message_id) where provider_message_id is not null;

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  payload jsonb not null,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists outbox_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  recipient text not null,
  body text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  provider_message_id text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  scheduled_at timestamptz not null,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists conversations_customer_status_idx on conversations(customer_id,status);
create index if not exists messages_conversation_created_idx on messages(conversation_id,created_at);
create index if not exists followups_due_idx on follow_ups(status,scheduled_at);
create index if not exists outbox_due_idx on outbox_messages(status,scheduled_at);

alter table customers enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table webhook_events enable row level security;
alter table outbox_messages enable row level security;
alter table follow_ups enable row level security;

-- Server-side service-role access is used by the webhook. Add authenticated admin policies later for the dashboard.
