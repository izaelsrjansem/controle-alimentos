// Edge Function "admin-usuarios": só o administrador da casa chama.
// Lista os membros, convida (por e-mail ou link), define senha, gera link de nova senha,
// muda o papel e exclui usuário. Usa a chave de serviço, que nunca sai do servidor.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ erro: "Use POST." }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return responder({ erro: "Faça login." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return responder({ erro: "Sessão expirada. Entre de novo." }, 401);

  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: eu } = await adm.from("membros").select("casa_id,papel").eq("user_id", user.id).maybeSingle();
  if (!eu || eu.papel !== "admin") return responder({ erro: "Só o administrador pode fazer isso." }, 403);

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }
  const site = (req.headers.get("origin") || "").replace(/\/$/, "") || undefined;
  const registrar = (acao: string, descricao: string) =>
    adm.from("auditoria").insert({ casa_id: eu.casa_id, user_id: user.id, email: user.email, acao, descricao });

  // o alvo precisa ser da mesma casa
  async function membro(id: unknown) {
    if (typeof id !== "string") return null;
    const { data } = await adm.from("membros").select("user_id,papel,nome").eq("user_id", id).eq("casa_id", eu!.casa_id).maybeSingle();
    if (!data) return null;
    const { data: u } = await adm.auth.admin.getUserById(id);
    return u?.user ? { ...data, email: u.user.email ?? "" } : null;
  }

  try {
    switch (corpo.acao) {
      case "listar": {
        const { data: ms } = await adm.from("membros").select("user_id,papel,nome,criado_em").eq("casa_id", eu.casa_id).order("criado_em");
        const { data: log } = await adm.from("auditoria").select("user_id,criado_em").eq("casa_id", eu.casa_id)
          .order("criado_em", { ascending: false }).limit(2000);
        const ultimo = new Map<string, string>();
        for (const l of log ?? []) if (l.user_id && !ultimo.has(l.user_id)) ultimo.set(l.user_id, l.criado_em);
        const usuarios = [];
        for (const m of ms ?? []) {
          const { data: u } = await adm.auth.admin.getUserById(m.user_id);
          usuarios.push({ ...m, email: u?.user?.email ?? "", ultimo_login: u?.user?.last_sign_in_at ?? null,
            ultima_atividade: ultimo.get(m.user_id) ?? null, criado: u?.user?.created_at ?? m.criado_em,
            eu: m.user_id === user.id });
        }
        return responder({ usuarios });
      }

      case "convidar": {
        const email = String(corpo.email ?? "").trim().toLowerCase();
        const nome = String(corpo.nome ?? "").trim() || null;
        const papel = corpo.papel === "admin" ? "admin" : "membro";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ erro: "E-mail inválido." }, 400);

        // conta que já existe: se é desta casa e ainda não criou senha, manda link de senha; senão, recusa
        const { data: existente } = await adm.rpc("_usuario_por_email", { p_email: email });
        if (existente) {
          const m = await membro(existente);
          if (!m) return responder({ erro: "Este e-mail já tem conta em outra casa." }, 409);
          const { data: l, error } = await adm.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: site } });
          if (error) throw error;
          return responder({ link: l.properties.action_link, aviso: "Este e-mail já está na casa. Gerei um link para ele criar ou trocar a senha." });
        }

        const { error: e1 } = await adm.from("convites").upsert(
          { casa_id: eu.casa_id, email, nome, papel, criado_por: user.id, usado_em: null }, { onConflict: "casa_id,email" });
        if (e1) throw e1;

        if (corpo.enviar) {
          const { error } = await adm.auth.admin.inviteUserByEmail(email, { redirectTo: site, data: { nome } });
          if (error) return responder({ erro: "O Supabase não conseguiu enviar o e-mail (" + error.message + "). Use \"Gerar link de convite\" e mande pelo WhatsApp." }, 502);
          await registrar("convidou usuário", `${nome ?? ""} <${email}> · por e-mail`);
          return responder({ ok: true, aviso: `Convite enviado para ${email}.` });
        }
        const { data: l, error } = await adm.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: site, data: { nome } } });
        if (error) throw error;
        await registrar("convidou usuário", `${nome ?? ""} <${email}> · por link`);
        return responder({ link: l.properties.action_link });
      }

      case "senha": {
        const m = await membro(corpo.user_id);
        if (!m) return responder({ erro: "Usuário não encontrado nesta casa." }, 404);
        const senha = String(corpo.senha ?? "");
        if (senha.length < 8) return responder({ erro: "A senha precisa de pelo menos 8 caracteres." }, 400);
        const { error } = await adm.auth.admin.updateUserById(m.user_id, { password: senha, email_confirm: true });
        if (error) throw error;
        await registrar("definiu senha de usuário", m.email);
        return responder({ ok: true, aviso: `Senha de ${m.email} alterada.` });
      }

      case "link_senha": {
        const m = await membro(corpo.user_id);
        if (!m) return responder({ erro: "Usuário não encontrado nesta casa." }, 404);
        if (corpo.enviar) {
          const { error } = await comoUsuario.auth.resetPasswordForEmail(m.email, { redirectTo: site });
          if (error) return responder({ erro: "O Supabase não conseguiu enviar o e-mail (" + error.message + "). Use \"Gerar link\" e mande pelo WhatsApp." }, 502);
          await registrar("enviou e-mail de nova senha", m.email);
          return responder({ ok: true, aviso: `E-mail para criar nova senha enviado para ${m.email}.` });
        }
        const { data: l, error } = await adm.auth.admin.generateLink({ type: "recovery", email: m.email, options: { redirectTo: site } });
        if (error) throw error;
        await registrar("gerou link de nova senha", m.email);
        return responder({ link: l.properties.action_link });
      }

      case "papel": {
        if (corpo.user_id === user.id) return responder({ erro: "Você não pode mudar o seu próprio papel." }, 400);
        const m = await membro(corpo.user_id);
        if (!m) return responder({ erro: "Usuário não encontrado nesta casa." }, 404);
        const papel = corpo.papel === "admin" ? "admin" : "membro";
        const { error } = await adm.from("membros").update({ papel }).eq("user_id", m.user_id);
        if (error) throw error;
        await registrar("mudou papel de usuário", `${m.email} → ${papel}`);
        return responder({ ok: true });
      }

      case "remover": {
        if (corpo.user_id === user.id) return responder({ erro: "Você não pode excluir a si mesmo." }, 400);
        const m = await membro(corpo.user_id);
        if (!m) return responder({ erro: "Usuário não encontrado nesta casa." }, 404);
        const { error } = await adm.auth.admin.deleteUser(m.user_id);
        if (error) throw error;
        await adm.from("convites").delete().eq("casa_id", eu.casa_id).eq("email", m.email.toLowerCase());
        await registrar("excluiu usuário", m.email);
        return responder({ ok: true, aviso: `${m.email} foi excluído. As compras que ele lançou continuam na casa.` });
      }

      default:
        return responder({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    console.error("admin-usuarios", e);
    return responder({ erro: "Falha: " + ((e as Error).message ?? "erro desconhecido") }, 500);
  }
});
