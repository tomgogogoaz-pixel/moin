-- Moin production schema for Supabase Data API + private Storage.
create table if not exists public.users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  auth_provider text not null default 'local',
  terms_accepted_at text,
  terms_version text,
  created_at text not null
);

create unique index if not exists users_email_lower_unique on public.users (lower(email));

create table if not exists public.sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires_at text not null,
  created_at text not null
);

create table if not exists public.projects (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  title text not null,
  status text not null,
  current_image_path text,
  reference_image_path text,
  floor_material_image_path text,
  wall_material_image_path text,
  object_material_image_path text,
  object_mask_image_path text,
  result_after_path text,
  analysis_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table if not exists public.project_versions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  version_number integer not null check (version_number >= 0),
  kind text not null check (kind in ('baseline', 'generation', 'rollback')),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  parent_version_id text,
  before_image_path text,
  reference_image_path text,
  floor_material_image_path text,
  wall_material_image_path text,
  object_material_image_path text,
  object_mask_image_path text,
  result_after_path text,
  analysis_json text not null default '{}',
  created_at text not null,
  unique(project_id, version_number)
);

create table if not exists public.materials (
  id text primary key,
  slug text not null unique,
  category text not null,
  name text not null,
  description text not null,
  unit text not null,
  price integer not null,
  image_url text not null,
  stock integer not null default 0,
  created_at text not null
);

create table if not exists public.cart_items (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  material_id text not null references public.materials(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 99),
  selected integer not null default 1,
  created_at text not null,
  unique(user_id, material_id)
);

create table if not exists public.orders (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  total integer not null,
  status text not null,
  created_at text not null
);

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  material_id text not null references public.materials(id),
  name_snapshot text not null,
  price_snapshot integer not null,
  quantity integer not null check (quantity between 1 and 99)
);

create index if not exists idx_projects_user on public.projects(user_id, updated_at desc);
create index if not exists idx_project_versions_project on public.project_versions(project_id, version_number desc);
create index if not exists idx_materials_category on public.materials(category, price);
create index if not exists idx_cart_user on public.cart_items(user_id);

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.materials enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on table public.users, public.sessions, public.projects, public.project_versions,
  public.materials, public.cart_items, public.orders, public.order_items from anon, authenticated;
grant all on table public.users, public.sessions, public.projects, public.project_versions,
  public.materials, public.cart_items, public.orders, public.order_items to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moin-media', 'moin-media', false, 8388608, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A tightly permissioned bridge keeps the existing prepared-query data layer
-- compatible with Supabase's HTTP Data API. Only the server secret role can
-- execute it; browser roles have no table or function access.
create or replace function public.moin_sql(
  p_statement text,
  p_params jsonb default '[]'::jsonb,
  p_mode text default 'all'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rendered text := trim(coalesce(p_statement, ''));
  replacement text;
  marker integer;
  parameter_count integer := jsonb_array_length(coalesce(p_params, '[]'::jsonb));
  index integer;
  rows jsonb;
  affected bigint;
begin
  if length(rendered) = 0 or length(rendered) > 20000 then
    raise exception 'invalid statement length';
  end if;
  if rendered ~ ';|--|/\*|\*/' then
    raise exception 'multiple statements and comments are not allowed';
  end if;
  if rendered !~* '^\s*(select|insert|update|delete)\s+' then
    raise exception 'unsupported statement';
  end if;
  if rendered ~* '(pg_catalog|information_schema|auth\.|storage\.|vault\.|extensions\.)' then
    raise exception 'restricted relation';
  end if;

  if parameter_count > 0 then
    for index in 0..parameter_count - 1 loop
      marker := strpos(rendered, '?');
      if marker = 0 then raise exception 'too many parameters'; end if;
      replacement := quote_nullable(p_params ->> index);
      rendered := overlay(rendered placing replacement from marker for 1);
    end loop;
  end if;
  if strpos(rendered, '?') > 0 then raise exception 'missing parameters'; end if;

  if lower(p_mode) = 'all' then
    execute format('select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (%s) q', rendered) into rows;
    return coalesce(rows, '[]'::jsonb);
  end if;

  execute rendered;
  get diagnostics affected = row_count;
  return jsonb_build_object('changes', affected);
end;
$$;

revoke all on function public.moin_sql(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.moin_sql(text, jsonb, text) to service_role;
