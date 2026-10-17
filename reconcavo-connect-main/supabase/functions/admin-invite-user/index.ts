// Gestão de usuários (só admin). Ações:
//   invite  -> convida por e-mail (define senha pelo link) + grava papel e pontos
//   delete  -> remove o usuário (cascata apaga user_roles/user_locations)
//
// O chamador precisa estar logado (JWT) E ser admin (checado via user_roles).
// Usa service_role p/ criar/remover usuários no Auth. Deploy COM verificação de
// JWT (sem --no-verify-jwt), e ainda assim revalida admin aqui dentro.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

const ROLES = ["admin", "gerente", "visualizador"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "não autenticado" }, 401);

    const svc = serviceClient();

    // Quem está chamando? Precisa ser admin.
    const { data: caller, error: cErr } = await svc.auth.getUser(jwt);
    if (cErr || !caller?.user) return jsonResponse({ error: "sessão inválida" }, 401);
    const { data: roleRow } = await svc
      .from("user_roles").select("role").eq("user_id", caller.user.id).maybeSingle();
    if (roleRow?.role !== "admin") return jsonResponse({ error: "apenas admin pode gerenciar usuários" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "invite");

    // ---- remover usuário --------------------------------------------------
    if (action === "delete") {
      const userId = String(body.user_id ?? "");
      if (!userId) return jsonResponse({ error: "user_id obrigatório" }, 400);
      if (userId === caller.user.id) return jsonResponse({ error: "você não pode remover a si mesmo" }, 400);
      const { error } = await svc.auth.admin.deleteUser(userId);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    // ---- convidar usuário -------------------------------------------------
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "visualizador");
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const locationIds: string[] = Array.isArray(body.location_ids) ? body.location_ids : [];
    const redirectTo = String(body.redirect_to ?? "");
    if (!email) return jsonResponse({ error: "e-mail obrigatório" }, 400);
    if (!ROLES.includes(role)) return jsonResponse({ error: "nível de acesso inválido" }, 400);

    // Nome/telefone vão no user_metadata do usuário (auth.users.raw_user_meta_data).
    const { data: inv, error: invErr } = await svc.auth.admin.inviteUserByEmail(
      email, { data: { name, phone }, ...(redirectTo ? { redirectTo } : {}) },
    );
    if (invErr || !inv?.user) {
      return jsonResponse({ error: invErr?.message ?? "falha ao enviar o convite" }, 400);
    }
    const newId = inv.user.id;

    await svc.from("user_roles").upsert({ user_id: newId, role });
    if (locationIds.length) {
      await svc.from("user_locations")
        .insert(locationIds.map((lid) => ({ user_id: newId, location_id: lid })));
    }
    return jsonResponse({ ok: true, user_id: newId });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
