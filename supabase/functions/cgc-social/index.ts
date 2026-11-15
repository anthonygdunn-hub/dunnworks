// cgc-social: Coastal Golf Co's social media results for the admin app (More > Social media).
// Reads sent posts and their results from Buffer's API with the personal key an editor pasted into the app
// (kept in cgc_private as 'buffer_key'), and caches the answer for 3 hours (Buffer refreshes post results about daily).
// POST { refresh?: true } with the signed-in editor's token.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGINS = [/^https:\/\/(www\.)?dunnworks\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const corsFor = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.some((r) => r.test(o)) ? o : "https://dunnworks.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});

async function buffer(key: string, query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors?.length) throw new Error(j.errors?.[0]?.message || `Buffer said ${r.status}`);
  return j.data;
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // signed-in editors only
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("authorization") || "" } }, auth: { persistSession: false } });
  const { data: u } = await user.auth.getUser();
  const email = (u?.user?.email || "").toLowerCase();
  if (!email) return json({ error: "Please sign in again." }, 401);
  const { data: ed } = await admin.from("cgc_editors").select("email").eq("email", email).maybeSingle();
  if (!ed) return json({ error: "not allowed" }, 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* empty body is fine */ }
  const { data: k } = await admin.from("cgc_private").select("v").eq("k", "buffer_key").maybeSingle();
  if (!k?.v) return json({ connected: false });

  if (!b.refresh) {
    const { data: c } = await admin.from("cgc_social_cache").select("data,fetched_at").eq("id", 1).maybeSingle();
    if (c?.data && Date.now() - new Date(c.fetched_at).getTime() < 3 * 3600e3) return json({ connected: true, cached: true, fetched_at: c.fetched_at, ...c.data });
  }

  try {
    const acc = await buffer(k.v, `query { account { organizations { id name } } }`);
    const orgs: { id: string; name: string }[] = acc?.account?.organizations || [];
    const channels: Record<string, unknown>[] = [];
    const posts: Record<string, unknown>[] = [];
    for (const o of orgs) {
      const ch = await buffer(k.v, `query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name displayName service avatar } }`, { o: o.id })
        .catch(() => buffer(k.v, `query($o: String!) { channels(input: { organizationId: $o }) { id name displayName service avatar } }`, { o: o.id }));
      const list = ch?.channels || [];
      channels.push(...list);
      if (!list.length) continue;
      let after: string | null = null;
      for (let page = 0; page < 3; page++) {
        const q = `query($o: OrganizationId!, $c: [ChannelId!], $a: String) { posts(first: 50, after: $a, input: { organizationId: $o, filter: { status: [sent], channelIds: $c } }) {
          edges { node { id text dueAt channelId metrics { type name value unit } metricsUpdatedAt } } pageInfo { endCursor hasNextPage } } }`;
        const vars = { o: o.id, c: list.map((c: { id: string }) => c.id), a: after };
        const d = await buffer(k.v, q, vars).catch(() => buffer(k.v, q.replace("$o: OrganizationId!", "$o: String!").replace("[ChannelId!]", "[String!]"), vars));
        for (const e of d?.posts?.edges || []) posts.push(e.node);
        if (!d?.posts?.pageInfo?.hasNextPage) break;
        after = d.posts.pageInfo.endCursor;
      }
    }
    const data = { channels, posts };
    const at = new Date().toISOString();
    await admin.from("cgc_social_cache").upsert({ id: 1, data, fetched_at: at });
    return json({ connected: true, cached: false, fetched_at: at, ...data });
  } catch (e) {
    console.error("buffer failed", e);
    return json({ connected: true, error: "Buffer: " + String((e as Error).message || e).slice(0, 200) }, 200);
  }
});
