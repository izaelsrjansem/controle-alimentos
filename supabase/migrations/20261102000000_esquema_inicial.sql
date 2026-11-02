-- =====================================================================
-- Controle de Alimentos — esquema inicial
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez: tudo usa IF NOT EXISTS / OR REPLACE.
--
-- Regra de acesso: cada usuário só enxerga e altera as próprias linhas
-- (Row Level Security em todas as tabelas, filtro por auth.uid()).
-- =====================================================================

-- ---------- Mercados ----------
create table if not exists public.mercados (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  criado_em   timestamptz not null default now(),
  unique (user_id, nome)
);
comment on table public.mercados is 'Supermercados onde o usuário compra ou anota preços.';

-- ---------- Produtos (o "item": arroz tipo 1, café, detergente...) ----------
create table if not exists public.produtos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  categoria   text not null default 'Outros',
  tipo        text not null default 'alimento'
              check (tipo in ('alimento','limpeza','higiene','utilidade')),
  medida      text not null default 'un' check (medida in ('kg','L','un')),
  criado_em   timestamptz not null default now(),
  unique (user_id, nome)
);
comment on table public.produtos is 'Item genérico. A marca fica na linha da compra, para comparar marcas diferentes do mesmo item.';
comment on column public.produtos.medida is 'Base do preço de referência: kg, L ou un. Ex.: arroz -> kg, óleo -> L, sabonete -> un.';

-- ---------- Compras (um cupom) ----------
create table if not exists public.compras (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mercado_id   uuid not null references public.mercados(id),
  data         date not null,
  total_bruto  numeric(12,2) not null default 0,
  desconto     numeric(12,2) not null default 0,
  total_pago   numeric(12,2) not null default 0,
  pagamento    text,
  origem       text not null default 'manual' check (origem in ('manual','foto','importacao')),
  foto_paths   text[] not null default '{}',
  observacao   text,
  criado_em    timestamptz not null default now()
);
create index if not exists compras_user_data_idx on public.compras (user_id, data desc);

-- ---------- Itens da compra ----------
create table if not exists public.compra_itens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  compra_id        uuid not null references public.compras(id) on delete cascade,
  produto_id       uuid not null references public.produtos(id),
  descricao_cupom  text,
  marca            text,
  embalagem        text,
  tamanho          numeric(12,4) not null default 1 check (tamanho > 0),
  quantidade       numeric(12,3) not null check (quantidade > 0),
  valor_unitario   numeric(12,2) not null check (valor_unitario >= 0),
  desconto         numeric(12,2) not null default 0 check (desconto >= 0),
  valor_total      numeric(12,2) not null check (valor_total >= 0),
  -- preço por kg / litro / unidade, já com o desconto: é a régua da comparação
  preco_referencia numeric(14,4) generated always as (valor_total / quantidade / tamanho) stored
);
comment on column public.compra_itens.tamanho is 'Tamanho da embalagem na medida do produto. Pacote 500 g = 0.5 (kg); a granel = 1 e a quantidade é o peso.';
create index if not exists compra_itens_compra_idx  on public.compra_itens (compra_id);
create index if not exists compra_itens_produto_idx on public.compra_itens (user_id, produto_id);

-- ---------- Cotações (preço visto, sem compra) ----------
create table if not exists public.cotacoes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  produto_id       uuid not null references public.produtos(id) on delete cascade,
  mercado_id       uuid not null references public.mercados(id),
  data             date not null default current_date,
  marca            text,
  embalagem        text,
  tamanho          numeric(12,4) not null default 1 check (tamanho > 0),
  preco            numeric(12,2) not null check (preco >= 0),
  preco_referencia numeric(14,4) generated always as (preco / tamanho) stored,
  criado_em        timestamptz not null default now()
);
create index if not exists cotacoes_produto_idx on public.cotacoes (user_id, produto_id);

-- ---------- Despensa (o que tenho em casa) ----------
create table if not exists public.despensa (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  produto_id    uuid not null references public.produtos(id) on delete cascade,
  situacao      text not null check (situacao in ('tenho','acabando','comprar')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, produto_id)
);

-- ---------- Segurança: cada um vê só o que é seu ----------
do $$
declare t text;
begin
  foreach t in array array['mercados','produtos','compras','compra_itens','cotacoes','despensa'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono on public.%I', t);
    execute format($p$create policy dono on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ---------- Visão única de preços (compras + cotações) ----------
create or replace view public.precos with (security_invoker = true) as
  select 'compra'::text      as origem,
         ci.id, ci.user_id, ci.produto_id, c.mercado_id, m.nome as mercado, c.data,
         ci.marca, ci.embalagem, ci.tamanho, ci.quantidade, ci.valor_unitario,
         ci.desconto, ci.valor_total, ci.preco_referencia, c.id as compra_id
    from public.compra_itens ci
    join public.compras  c on c.id = ci.compra_id
    join public.mercados m on m.id = c.mercado_id
  union all
  select 'cotacao'::text,
         q.id, q.user_id, q.produto_id, q.mercado_id, m.nome, q.data,
         q.marca, q.embalagem, q.tamanho, null, q.preco,
         0, null, q.preco_referencia, null
    from public.cotacoes q
    join public.mercados m on m.id = q.mercado_id;

-- ---------- Funções auxiliares ----------
create or replace function public._mercado_id(p_nome text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v uuid;
begin
  insert into mercados (nome) values (trim(p_nome))
    on conflict (user_id, nome) do update set nome = excluded.nome
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
    on conflict (user_id, nome) do update set nome = excluded.nome
    returning id into v;
  return v;
end $$;

-- Salva uma compra inteira numa só transação. Recebe:
-- { "mercado": "Atacadão", "data": "2026-10-31", "pagamento": "Cartão de crédito",
--   "origem": "foto", "foto_paths": ["<uid>/x.jpg"], "observacao": "...",
--   "itens": [ { "nome": "Arroz tipo 1", "categoria": "Mercearia", "tipo": "alimento",
--               "medida": "kg", "descricao_cupom": "ARROZ BIJU AG.T.1", "marca": "Biju",
--               "embalagem": "1 kg", "tamanho": 1, "quantidade": 4,
--               "valor_unitario": 5.49, "desconto": 0, "valor_total": 21.96 } ] }
create or replace function public.salvar_compra(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_compra uuid;
  v_item   jsonb;
  v_qtd    numeric; v_vu numeric; v_desc numeric; v_total numeric;
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
                              tamanho, quantidade, valor_unitario, desconto, valor_total)
    values (v_compra,
            _produto_id(v_item->>'nome', v_item->>'categoria', v_item->>'tipo', v_item->>'medida'),
            v_item->>'descricao_cupom', nullif(v_item->>'marca',''), v_item->>'embalagem',
            coalesce(nullif(v_item->>'tamanho','')::numeric, 1), v_qtd, v_vu, v_desc, v_total);
  end loop;

  update compras c set
    total_bruto = s.bruto, desconto = s.descontos, total_pago = s.bruto - s.descontos
  from (select coalesce(sum(valor_total + desconto),0) bruto, coalesce(sum(desconto),0) descontos
          from compra_itens where compra_id = v_compra) s
  where c.id = v_compra;

  return v_compra;
end $$;

-- Anota um preço visto no mercado, sem compra.
create or replace function public.anotar_preco(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v uuid;
begin
  insert into cotacoes (produto_id, mercado_id, data, marca, embalagem, tamanho, preco)
  values (_produto_id(p->>'nome', p->>'categoria', p->>'tipo', p->>'medida'),
          _mercado_id(p->>'mercado'), coalesce((p->>'data')::date, current_date),
          nullif(p->>'marca',''), p->>'embalagem',
          coalesce(nullif(p->>'tamanho','')::numeric, 1), (p->>'preco')::numeric)
  returning id into v;
  return v;
end $$;

revoke all on function public._mercado_id(text), public._produto_id(text,text,text,text) from public, anon;
grant execute on function public.salvar_compra(jsonb), public.anotar_preco(jsonb) to authenticated;

-- ---------- Fotos dos cupons (Storage, pasta por usuário) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cupons', 'cupons', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "cupons: dono le"     on storage.objects;
drop policy if exists "cupons: dono envia"  on storage.objects;
drop policy if exists "cupons: dono apaga"  on storage.objects;
create policy "cupons: dono le" on storage.objects for select to authenticated
  using (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cupons: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cupons: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
