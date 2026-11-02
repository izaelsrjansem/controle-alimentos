-- Item "fora do rancho": continua na compra (memória do que estava no cupom),
-- mas não conta no total da compra, nos relatórios nem no histórico de preços.

alter table public.compra_itens add column if not exists fora_rancho boolean not null default false;

-- A visão de preços só enxerga o que conta; a tela da compra lê compra_itens direto
create or replace view public.precos with (security_invoker = true) as
  select 'compra'::text      as origem,
         ci.id, ci.user_id, ci.produto_id, c.mercado_id, m.nome as mercado, c.data,
         ci.marca, ci.embalagem, ci.tamanho, ci.quantidade, ci.valor_unitario,
         ci.desconto, ci.valor_total, ci.preco_referencia, c.id as compra_id
    from public.compra_itens ci
    join public.compras  c on c.id = ci.compra_id
    join public.mercados m on m.id = c.mercado_id
   where not ci.fora_rancho
  union all
  select 'cotacao'::text,
         q.id, q.user_id, q.produto_id, q.mercado_id, m.nome, q.data,
         q.marca, q.embalagem, q.tamanho, null, q.preco,
         0, null, q.preco_referencia, null
    from public.cotacoes q
    join public.mercados m on m.id = q.mercado_id;

-- Recalcula os totais da compra só com os itens que contam
create or replace function public.recalcular_compra(p_compra uuid)
returns void language sql security invoker set search_path = public as $$
  update compras c set
    total_bruto = s.bruto, desconto = s.descontos, total_pago = s.bruto - s.descontos
  from (select coalesce(sum(valor_total + desconto),0) bruto, coalesce(sum(desconto),0) descontos
          from compra_itens where compra_id = p_compra and not fora_rancho) s
  where c.id = p_compra;
$$;

-- salvar_compra passa a aceitar "fora_rancho": true em cada item
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
                              tamanho, quantidade, valor_unitario, desconto, valor_total, fora_rancho)
    values (v_compra,
            _produto_id(v_item->>'nome', v_item->>'categoria', v_item->>'tipo', v_item->>'medida'),
            v_item->>'descricao_cupom', nullif(v_item->>'marca',''), v_item->>'embalagem',
            coalesce(nullif(v_item->>'tamanho','')::numeric, 1), v_qtd, v_vu, v_desc, v_total,
            coalesce((v_item->>'fora_rancho')::boolean, false));
  end loop;

  perform recalcular_compra(v_compra);
  return v_compra;
end $$;

grant execute on function public.recalcular_compra(uuid) to authenticated;
