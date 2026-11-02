-- =====================================================================
-- Casa compartilhada, membros, convites e auditoria
-- Os dados deixam de ser "de cada usuário" e passam a ser "da casa":
-- todos os membros da mesma casa veem e alteram as mesmas compras,
-- itens, preços e despensa. user_id continua registrando quem fez.
-- =====================================================================

-- ---------- Casas e membros ----------
create table if not exists public.casas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null default 'Minha casa',
  criado_em timestamptz not null default now()
);

create table if not exists public.membros (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  casa_id   uuid not null references public.casas(id) on delete cascade,
  papel     text not null default 'membro' check (papel in ('admin','membro')),
  nome      text,
  criado_em timestamptz not null default now()
);
create index if not exists membros_casa_idx on public.membros (casa_id);

-- Convite feito pelo administrador: quando a conta com esse e-mail nasce, entra na casa dele
create table if not exists public.convites (
  id         uuid primary key default gen_random_uuid(),
  casa_id    uuid not null references public.casas(id) on delete cascade,
  email      text not null,
  nome       text,
  papel      text not null default 'membro' check (papel in ('admin','membro')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz,
  unique (casa_id, email)
);

create or replace function public.minha_casa() returns uuid
language sql stable security definer set search_path = public as $$
  select casa_id from membros where user_id = auth.uid()
$$;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where user_id = auth.uid() and papel = 'admin')
$$;

-- Quem já tem conta ganha a própria casa, como administrador
do $$
declare u record; c uuid;
begin
  for u in select id from auth.users where id not in (select user_id from public.membros) loop
    insert into public.casas default values returning id into c;
    insert into public.membros (user_id, casa_id, papel) values (u.id, c, 'admin');
  end loop;
end $$;

-- Conta nova: entra na casa do convite; sem convite, ganha uma casa só dela
create or replace function public._novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.convites; c uuid;
begin
  select * into v from public.convites
   where lower(email) = lower(new.email) and usado_em is null
   order by criado_em desc limit 1;
  if found then
    insert into public.membros (user_id, casa_id, papel, nome)
    values (new.id, v.casa_id, v.papel, coalesce(v.nome, new.raw_user_meta_data->>'nome'))
    on conflict (user_id) do nothing;
    update public.convites set usado_em = now() where id = v.id;
  else
    insert into public.casas default values returning id into c;
    insert into public.membros (user_id, casa_id, papel, nome)
    values (new.id, c, 'admin', new.raw_user_meta_data->>'nome')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public._novo_usuario();

-- ---------- casa_id em todas as tabelas de dados ----------
-- despensa: a chave passa a ser (casa, produto)
alter table public.despensa drop constraint if exists despensa_pkey;

do $$
declare t text;
begin
  foreach t in array array['mercados','produtos','compras','compra_itens','cotacoes','despensa'] loop
    execute format('alter table public.%I add column if not exists casa_id uuid references public.casas(id) on delete cascade', t);
    execute format('update public.%I x set casa_id = m.casa_id from public.membros m where m.user_id = x.user_id and x.casa_id is null', t);
    execute format('alter table public.%I alter column casa_id set default public.minha_casa()', t);
    execute format('alter table public.%I alter column casa_id set not null', t);
    -- excluir um usuário não apaga o que ele lançou na casa
    execute format('alter table public.%I alter column user_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete set null', t, t || '_user_id_fkey');
    -- acesso: quem é da casa
    execute format('drop policy if exists dono on public.%I', t);
    execute format('drop policy if exists casa on public.%I', t);
    execute format($p$create policy casa on public.%I for all to authenticated
                     using (casa_id = (select public.minha_casa()))
                     with check (casa_id = (select public.minha_casa()))$p$, t);
  end loop;
end $$;

alter table public.despensa add primary key (casa_id, produto_id);
alter table public.mercados drop constraint if exists mercados_user_id_nome_key;
alter table public.produtos drop constraint if exists produtos_user_id_nome_key;
alter table public.mercados drop constraint if exists mercados_casa_id_nome_key;
alter table public.produtos drop constraint if exists produtos_casa_id_nome_key;
alter table public.mercados add constraint mercados_casa_id_nome_key unique (casa_id, nome);
alter table public.produtos add constraint produtos_casa_id_nome_key unique (casa_id, nome);
create index if not exists compras_casa_data_idx on public.compras (casa_id, data desc);
create index if not exists compra_itens_casa_produto_idx on public.compra_itens (casa_id, produto_id);
create index if not exists cotacoes_casa_produto_idx on public.cotacoes (casa_id, produto_id);

create or replace function public._mercado_id(p_nome text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v uuid;
begin
  insert into mercados (nome) values (trim(p_nome))
    on conflict (casa_id, nome) do update set nome = excluded.nome
    returning id into v;
  return v;
end $$;

create or replace function public._produto_id(p_nome text, p_categoria text, p_tipo text, p_medida text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v uuid;
begin
  -- produto que já existe mantém a categoria que o usuário escolheu
  insert into produtos (nome, categoria, tipo, medida)
       values (trim(p_nome), coalesce(nullif(p_categoria,''),'Outros'),
               coalesce(nullif(p_tipo,''),'alimento'), coalesce(nullif(p_medida,''),'un'))
    on conflict (casa_id, nome) do update set nome = excluded.nome
    returning id into v;
  return v;
end $$;

-- ---------- Acesso a membros e convites ----------
alter table public.casas    enable row level security;
alter table public.membros  enable row level security;
alter table public.convites enable row level security;
drop policy if exists ver on public.casas;
drop policy if exists ver on public.membros;
drop policy if exists ver on public.convites;
create policy ver on public.casas    for select to authenticated using (id = (select public.minha_casa()));
create policy ver on public.membros  for select to authenticated using (casa_id = (select public.minha_casa()));
create policy ver on public.convites for select to authenticated using (casa_id = (select public.minha_casa()) and (select public.sou_admin()));
-- incluir, excluir e mudar membros só pela função admin-usuarios (chave de serviço)

-- ---------- Auditoria ----------
create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  casa_id   uuid references public.casas(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete set null,
  email     text,
  acao      text not null,
  descricao text,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_casa_idx on public.auditoria (casa_id, criado_em desc);
alter table public.auditoria enable row level security;
drop policy if exists ver on public.auditoria;
create policy ver on public.auditoria for select to authenticated
  using (casa_id = (select public.minha_casa()) and (select public.sou_admin()));

create or replace function public.registrar(p_acao text, p_descricao text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into auditoria (casa_id, user_id, email, acao, descricao)
  values (minha_casa(), auth.uid(), (select email from auth.users where id = auth.uid()), left(p_acao, 80), left(p_descricao, 500));
end $$;
grant execute on function public.registrar(text, text) to authenticated;

create or replace function public._auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  if auth.uid() is null then return null; end if;   -- mudanças do próprio sistema
  if tg_table_name = 'compras' and tg_op = 'DELETE' then
    perform registrar('apagou compra', (select nome from mercados where id = old.mercado_id) || ' · ' || to_char(old.data, 'DD/MM/YYYY')
      || ' · R$ ' || replace(to_char(old.total_pago, 'FM999990.00'), '.', ','));
  elsif tg_table_name = 'compra_itens' then
    if tg_op = 'DELETE' then
      -- item que some junto com a compra inteira já está no registro "apagou compra"
      if exists (select 1 from compras where id = old.compra_id) then
        perform registrar('excluiu item da compra', (select nome from produtos where id = old.produto_id)
          || ' · R$ ' || replace(to_char(old.valor_total, 'FM999990.00'), '.', ','));
      end if;
    elsif tg_op = 'UPDATE' then
      if new.fora_rancho is distinct from old.fora_rancho then
        perform registrar(case when new.fora_rancho then 'marcou fora do rancho' else 'voltou a contar item' end,
          (select nome from produtos where id = new.produto_id));
      end if;
    end if;
  elsif tg_table_name = 'cotacoes' then
    if tg_op = 'INSERT' then
      perform registrar('anotou preço', (select nome from produtos where id = new.produto_id) || ' · ' || (select nome from mercados where id = new.mercado_id)
        || ' · R$ ' || replace(to_char(new.preco, 'FM999990.00'), '.', ','));
    elsif tg_op = 'DELETE' then
      perform registrar('apagou preço anotado', (select nome from produtos where id = old.produto_id));
    end if;
  elsif tg_table_name = 'produtos' then
    if tg_op = 'UPDATE' then
      perform registrar('editou item', case when new.nome = old.nome then new.nome else old.nome || ' → ' || new.nome end);
    elsif tg_op = 'DELETE' then
      perform registrar('excluiu item do cadastro', old.nome);
    end if;
  elsif tg_table_name = 'despensa' then
    if tg_op = 'DELETE' then
      perform registrar('despensa: limpou situação', (select nome from produtos where id = old.produto_id));
    elsif tg_op = 'INSERT' then
      perform registrar('despensa: ' || new.situacao, (select nome from produtos where id = new.produto_id));
    elsif new.situacao is distinct from old.situacao then
      perform registrar('despensa: ' || new.situacao, (select nome from produtos where id = new.produto_id));
    end if;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['compras','compra_itens','cotacoes','produtos','despensa'] loop
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public._auditar()', t);
  end loop;
end $$;

-- salvar_compra registra "lançou compra" com o resumo
create or replace function public.salvar_compra(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_compra uuid;
  v_item   jsonb;
  v_qtd    numeric; v_vu numeric; v_desc numeric; v_total numeric;
  v_resumo text;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado.'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then
    raise exception 'A compra precisa de pelo menos um item.';
  end if;

  insert into compras (mercado_id, data, pagamento, origem, foto_paths, observacao)
  values (_mercado_id(p->>'mercado'), (p->>'data')::date, p->>'pagamento',
          coalesce(p->>'origem','manual'),
          coalesce(array(select jsonb_array_elements_text(p->'foto_paths')), '{}'),
          p->>'observacao')
  returning id into v_compra;

  for v_item in select * from jsonb_array_elements(p->'itens') loop
    v_qtd   := (v_item->>'quantidade')::numeric;
    v_vu    := (v_item->>'valor_unitario')::numeric;
    v_desc  := coalesce((v_item->>'desconto')::numeric, 0);
    v_total := coalesce((v_item->>'valor_total')::numeric, round(v_qtd * v_vu - v_desc, 2));
    insert into compra_itens (compra_id, produto_id, descricao_cupom, marca, embalagem,
                              tamanho, quantidade, valor_unitario, desconto, valor_total, fora_rancho)
    values (v_compra,
            _produto_id(v_item->>'nome', v_item->>'categoria', v_item->>'tipo', v_item->>'medida'),
            v_item->>'descricao_cupom', nullif(v_item->>'marca',''), v_item->>'embalagem',
            coalesce(nullif(v_item->>'tamanho','')::numeric, 1), v_qtd, v_vu, v_desc, v_total,
            coalesce((v_item->>'fora_rancho')::boolean, false));
  end loop;

  perform recalcular_compra(v_compra);

  select m.nome || ' · ' || to_char(c.data, 'DD/MM/YYYY') || ' · ' ||
         (select count(*) from compra_itens where compra_id = c.id and not fora_rancho) || ' itens · R$ ' ||
         replace(to_char(c.total_pago, 'FM999990.00'), '.', ',')
    into v_resumo
    from compras c join mercados m on m.id = c.mercado_id where c.id = v_compra;
  perform registrar('lançou compra', v_resumo);
  return v_compra;
end $$;

-- Usado só pela função admin-usuarios (chave de serviço): acha a conta pelo e-mail
create or replace function public._usuario_por_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public._usuario_por_email(text) from public, anon, authenticated;
grant execute on function public._usuario_por_email(text) to service_role;
