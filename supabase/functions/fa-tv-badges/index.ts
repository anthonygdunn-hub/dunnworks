// fa-tv-badges: fill in team badges for The Falkners Arms TV listings.
// Called every 10 minutes by pg_cron (see supabase/falkners-tv.sql). Takes no
// input and only looks up teams already in fa_tv that have no cached badge, at
// most 25 per run, so calling it from outside does nothing the schedule
// wouldn't do anyway. Deployed with verify_jwt off for that reason.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPORT: Record<string, string> = { Football: 'Soccer', Rugby: 'Rugby', Cricket: 'Cricket' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Names that TheSportsDB files differently from how UK listings write them.
const ALIAS: Record<string, string> = {
  'Paris Saint-Germain': 'Paris SG', 'PSG': 'Paris SG', 'PSG Women': 'Paris SG Women',
  'Inter Milan': 'Inter', 'AC Milan': 'Milan', 'Roma': 'AS Roma', 'Bodo/Glimt': 'Bodo Glimt',
  'Wolves': 'Wolverhampton Wanderers', 'Spurs': 'Tottenham Hotspur', 'QPR': 'Queens Park Rangers',
};

function variants(name: string): string[] {
  const out = [name];
  if (ALIAS[name]) out.unshift(ALIAS[name]);
  const strip = name.replace(/\s+(WFC|Women|Ladies|W)$/i, '').trim();
  if (strip !== name) out.push(strip + ' Women', strip);
  const fc = name.replace(/\s+(FC|AFC)$/i, '').trim();
  if (fc !== name) out.push(fc);
  return [...new Set(out)];
}

async function lookup(team: string, sport: string): Promise<string | null> {
  const want = SPORT[sport];
  for (const v of variants(team)) {
    const r = await fetch('https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=' + encodeURIComponent(v));
    if (r.status === 429) throw new Error('rate limited');
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const teams = (j && j.teams) || [];
    const hit = teams.find((t: any) => (!want || t.strSport === want) && t.strBadge && t.strTeam.toLowerCase() === v.toLowerCase())
      || teams.find((t: any) => (!want || t.strSport === want) && t.strBadge);
    if (hit) return hit.strBadge;
    await new Promise((res) => setTimeout(res, 400));
  }
  return null;
}

Deno.serve(async () => {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: rows, error } = await db.from('fa_tv').select('home,away,sport').gte('starts_at', since).in('sport', Object.keys(SPORT));
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const { data: cached } = await db.from('fa_tv_badges').select('team,badge,looked_up_at');
  const have = new Map((cached || []).map((c: any) => [c.team, c]));
  const weekAgo = Date.now() - 2 * 864e5;
  const todo: [string, string][] = [];
  for (const r of rows || []) for (const t of [r.home, r.away]) {
    if (!t || todo.some((x) => x[0] === t)) continue;
    const c: any = have.get(t);
    if (!c || (!c.badge && new Date(c.looked_up_at).getTime() < weekAgo)) todo.push([t, r.sport]);
  }
  let found = 0, missed = 0;
  for (const [team, sport] of todo.slice(0, 25)) {
    let badge: string | null = null;
    try { badge = await lookup(team, sport); } catch (_) { break; }
    await db.from('fa_tv_badges').upsert({ team, sport, badge, looked_up_at: new Date().toISOString() });
    badge ? found++ : missed++;
    await new Promise((res) => setTimeout(res, 2100));
  }
  await db.rpc('fa_tv_apply_badges');
  return new Response(JSON.stringify({ checked: Math.min(todo.length, 25), found, missed, waiting: Math.max(0, todo.length - 25) }), { headers: { 'Content-Type': 'application/json' } });
});
