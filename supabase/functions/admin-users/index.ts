// Creates/invites users and resets access. Runs server-side; service role key is injected by Supabase (never in the frontend).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: me } = await admin.from("user_roles").select("role").eq("user_id", user.id).single();
    const { data: myp } = await admin.from("profiles").select("business_id,outlet_id,active").eq("id", user.id).single();
    if (!me || !myp?.active || !["owner", "manager"].includes(me.role)) return json({ error: "Not allowed" }, 403);

    const body = await req.json();
    if (body.action === "create") {
      const role = body.role ?? "employee";
      if (!["manager", "employee"].includes(role)) return json({ error: "Invalid role" }, 400);
      if (role === "manager" && me.role !== "owner") return json({ error: "Only Owner can create Managers" }, 403);
      if (!body.email || !body.full_name) return json({ error: "Name and email are required" }, 400);
      const { data: created, error } = await admin.auth.admin.inviteUserByEmail(body.email, { data: { full_name: body.full_name } });
      if (error) return json({ error: error.message }, 400);
      const id = created.user.id;
      await admin.from("profiles").insert({ id, business_id: myp.business_id, outlet_id: body.outlet_id ?? myp.outlet_id, full_name: body.full_name, email: body.email });
      await admin.from("user_roles").insert({ user_id: id, role });
      const { data: seq } = await admin.rpc("nextval_employee_code");
      await admin.from("employee_details").insert({ user_id: id, employee_code: seq, mobile: body.mobile, designation: body.designation, department: body.department, joining_date: body.joining_date || null });
      if (role === "employee") {
        const perms = body.permissions ?? ["dashboard.view", "inventory.view", "stock.in", "stock.out", "inventory.activity", "inventory.reports"];
        await admin.from("employee_permissions").insert(perms.map((permission: string) => ({ user_id: id, permission })));
      }
      return json({ ok: true, id });
    }
    if (body.action === "reset") {
      const { data: target } = await admin.from("profiles").select("email,business_id").eq("id", body.user_id).single();
      const { data: tr } = await admin.from("user_roles").select("role").eq("user_id", body.user_id).single();
      if (!target || target.business_id !== myp.business_id) return json({ error: "Unknown user" }, 404);
      if (tr?.role === "owner" || (tr?.role === "manager" && me.role !== "owner")) return json({ error: "Not allowed" }, 403);
      const { error } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo: body.redirectTo });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String(e) }, 500); }
});
