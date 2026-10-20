-- Aₖ v2: number accounts + private 1:1 image/video delivery.
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
-- Also required: Authentication → Sign In / Providers → "Allow anonymous sign-ins" = ON.
--
-- Model
--   Every browser/app install signs in anonymously (Supabase Auth). A person's account is a
--   number (4–8 digits, chosen by them) + password (bcrypt, pgcrypto). Logging in with the
--   number and password links the current anonymous session ("device") to that account.
--   Messages are only reachable through the RPC functions below; tables have RLS on and no
--   policies, so the REST API cannot read them directly.
--   Files live in the private bucket "ak" under <sender account id>/<random>.ak|.akv and can be
--   downloaded only by the sender and the recipient of a message that references them.

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ tables
create table if not exists public.ak_accounts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^[0-9]{4,8}$'),
  pw_hash text not null,
  fail_count int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ak_devices (
  uid uuid primary key,                       -- auth.users.id of an anonymous session
  account_id uuid not null references public.ak_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ak_devices_account on public.ak_devices(account_id);

create table if not exists public.ak_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.ak_accounts(id) on delete cascade,
  recipient uuid not null references public.ak_accounts(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  path text not null unique,
  bytes int not null check (bytes > 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ak_messages_recipient on public.ak_messages(recipient, created_at desc);
create index if not exists ak_messages_sender on public.ak_messages(sender, created_at desc);

create table if not exists public.ak_blocks (
  owner uuid not null references public.ak_accounts(id) on delete cascade,
  blocked uuid not null references public.ak_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, blocked)
);

alter table public.ak_accounts enable row level security;
alter table public.ak_devices enable row level security;
alter table public.ak_messages enable row level security;
alter table public.ak_blocks enable row level security;
revoke all on public.ak_accounts, public.ak_devices, public.ak_messages, public.ak_blocks from anon, authenticated;

-- ------------------------------------------------------------------ helpers
create or replace function public.ak_me() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.account_id from public.ak_devices d where d.uid = auth.uid()
$$;

create or replace function public.ak_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ak_messages m
    where m.path = p_name and public.ak_me() in (m.sender, m.recipient))
$$;

create or replace function public.ak_link_device(p_account uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.ak_devices (uid, account_id) values (auth.uid(), p_account)
  on conflict (uid) do update set account_id = excluded.account_id, created_at = now()
$$;

-- ------------------------------------------------------------------ account
create or replace function public.ak_signup(p_number text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_number is null or p_number !~ '^[0-9]{4,8}$' then raise exception 'bad_number'; end if;
  if p_password is null or length(p_password) < 6 or octet_length(p_password) > 72 then
    raise exception 'bad_password';
  end if;
  begin
    insert into public.ak_accounts (number, pw_hash)
    values (p_number, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'number_taken';
  end;
  perform public.ak_link_device(v_id);
  return p_number;
end $$;

-- returns 'ok' | 'bad_credentials' | 'locked' (no exception, so the failure counter is kept)
create or replace function public.ak_login(p_number text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.ak_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into a from public.ak_accounts where number = p_number for update;
  if not found then return 'bad_credentials'; end if;
  if a.locked_until is not null and a.locked_until > now() then return 'locked'; end if;
  if a.pw_hash = extensions.crypt(coalesce(p_password, ''), a.pw_hash) then
    update public.ak_accounts set fail_count = 0, locked_until = null where id = a.id;
    perform public.ak_link_device(a.id);
    return 'ok';
  end if;
  if a.fail_count + 1 >= 5 then
    update public.ak_accounts set fail_count = 0, locked_until = now() + interval '15 minutes' where id = a.id;
  else
    update public.ak_accounts set fail_count = a.fail_count + 1 where id = a.id;
  end if;
  return 'bad_credentials';
end $$;

create or replace function public.ak_logout() returns void
language sql security definer set search_path = '' as $$
  delete from public.ak_devices where uid = auth.uid()
$$;

create or replace function public.ak_whoami() returns text
language sql stable security definer set search_path = '' as $$
  select a.number from public.ak_accounts a where a.id = public.ak_me()
$$;

-- changing the password signs out every other device
create or replace function public.ak_change_password(p_old text, p_new text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ak_me(); v_hash text;
begin
  if v_me is null then raise exception 'not_logged_in'; end if;
  if p_new is null or length(p_new) < 6 or octet_length(p_new) > 72 then raise exception 'bad_password'; end if;
  select pw_hash into v_hash from public.ak_accounts where id = v_me;
  if v_hash <> extensions.crypt(coalesce(p_old, ''), v_hash) then return 'bad_credentials'; end if;
  update public.ak_accounts set pw_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = v_me;
  delete from public.ak_devices where account_id = v_me and uid <> auth.uid();
  return 'ok';
end $$;

-- deletes the account and every message it sent or received. The client removes the
-- storage objects first (ak_list + storage remove), because SQL cannot delete stored files.
create or replace function public.ak_delete_account(p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ak_me(); v_hash text;
begin
  if v_me is null then raise exception 'not_logged_in'; end if;
  select pw_hash into v_hash from public.ak_accounts where id = v_me;
  if v_hash <> extensions.crypt(coalesce(p_password, ''), v_hash) then return 'bad_credentials'; end if;
  delete from public.ak_accounts where id = v_me;
  return 'ok';
end $$;

-- true when p_password is the current account's password (used before destructive actions)
create or replace function public.ak_verify(p_password text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.pw_hash = extensions.crypt(coalesce(p_password, ''), a.pw_hash)
                   from public.ak_accounts a where a.id = public.ak_me()), false)
$$;

create or replace function public.ak_exists(p_number text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ak_accounts where number = p_number)
$$;

-- ------------------------------------------------------------------ messages
create or replace function public.ak_send(p_to text, p_path text, p_kind text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ak_me(); v_to uuid; v_size int; v_id uuid;
begin
  if v_me is null then raise exception 'not_logged_in'; end if;
  select id into v_to from public.ak_accounts where number = p_to;
  if v_to is null then raise exception 'no_such_number'; end if;
  if exists (select 1 from public.ak_blocks where owner = v_to and blocked = v_me) then
    raise exception 'blocked';
  end if;
  if p_kind not in ('image', 'video') then raise exception 'bad_kind'; end if;
  if p_path !~ ('^' || v_me::text || '/[A-Za-z0-9_-]{8,40}\.(ak|akv)$') then raise exception 'bad_path'; end if;
  if pg_column_size(coalesce(p_meta, '{}'::jsonb)) > 2048 then raise exception 'bad_meta'; end if;
  select coalesce((o.metadata ->> 'size')::int, 0) into v_size
    from storage.objects o where o.bucket_id = 'ak' and o.name = p_path;
  if not found then raise exception 'file_missing'; end if;
  if (select count(*) from public.ak_messages where sender = v_me and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited';
  end if;
  insert into public.ak_messages (sender, recipient, kind, path, bytes, meta)
  values (v_me, v_to, p_kind, p_path, greatest(v_size, 1), coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ak_list(p_box text default 'all', p_before timestamptz default null, p_limit int default 60)
returns table (id uuid, box text, other text, kind text, path text, bytes int, meta jsonb, created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,
         case when m.recipient = me.id then 'in' else 'out' end,
         o.number, m.kind, m.path, m.bytes, m.meta, m.created_at, m.read_at
  from (select public.ak_me() as id) me
  join public.ak_messages m on me.id in (m.sender, m.recipient)
  join public.ak_accounts o on o.id = case when m.recipient = me.id then m.sender else m.recipient end
  where (p_box = 'all'
         or (p_box = 'in' and m.recipient = me.id)
         or (p_box = 'out' and m.sender = me.id))
    and (p_before is null or m.created_at < p_before)
    and not (m.recipient = me.id and m.sender <> me.id
             and exists (select 1 from public.ak_blocks b where b.owner = me.id and b.blocked = m.sender))
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

create or replace function public.ak_mark_read(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.ak_messages set read_at = now()
  where id = p_id and recipient = public.ak_me() and read_at is null
$$;

-- removes the message for both sides; the client deletes the file first
create or replace function public.ak_delete(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.ak_messages where id = p_id and public.ak_me() in (sender, recipient)
$$;

-- ------------------------------------------------------------------ blocking
create or replace function public.ak_block(p_number text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ak_me(); v_other uuid;
begin
  if v_me is null then raise exception 'not_logged_in'; end if;
  select id into v_other from public.ak_accounts where number = p_number;
  if v_other is null then raise exception 'no_such_number'; end if;
  if v_other = v_me then raise exception 'self'; end if;
  insert into public.ak_blocks (owner, blocked) values (v_me, v_other) on conflict do nothing;
end $$;

create or replace function public.ak_unblock(p_number text) returns void
language sql security definer set search_path = '' as $$
  delete from public.ak_blocks b using public.ak_accounts a
  where b.owner = public.ak_me() and b.blocked = a.id and a.number = p_number
$$;

create or replace function public.ak_blocks() returns setof text
language sql stable security definer set search_path = '' as $$
  select a.number from public.ak_blocks b join public.ak_accounts a on a.id = b.blocked
  where b.owner = public.ak_me() order by b.created_at desc
$$;

-- ------------------------------------------------------------------ grants
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ak\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke execute on function public.ak_link_device(uuid) from authenticated;

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ak', 'ak', false, 307200, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ak insert own folder" on storage.objects;
create policy "ak insert own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ak' and (storage.foldername(name))[1] = (select public.ak_me())::text);

drop policy if exists "ak read participants" on storage.objects;
create policy "ak read participants" on storage.objects
  for select to authenticated
  using (bucket_id = 'ak' and ((storage.foldername(name))[1] = (select public.ak_me())::text or public.ak_can_read(name)));

drop policy if exists "ak delete participants" on storage.objects;
create policy "ak delete participants" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ak' and ((storage.foldername(name))[1] = (select public.ak_me())::text or public.ak_can_read(name)));
