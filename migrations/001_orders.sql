create table if not exists orders (
  id bigint generated always as identity primary key,
  attempt_id uuid not null unique,
  received_at timestamptz not null default now(),
  content_hash text not null,
  idempotency_key text,
  schema_version smallint not null,
  payload text not null,
  sent_at timestamptz,
  telegram_message_id bigint,
  send_failure text,
  dedupe_of bigint
);

create index if not exists orders_dedupe_idx
  on orders (content_hash, received_at desc);
