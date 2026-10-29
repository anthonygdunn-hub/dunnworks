// fa-tv-badges: fill in team badges for The Falkners Arms TV listings.
// Called every 5 minutes by pg_cron (see supabase/falkners-tv.sql). Takes no
// input and only fills in teams already in fa_tv that have no cached badge,
// so calling it from outside does nothing the schedule wouldn't do anyway.
// Deployed with verify_jwt off for that reason.
//
// Source: TheSportsDB's free team search. The free key is shared by everyone
// and rate limited, so each run makes a handful of calls and stops at the
// first 429. Badges are cached for good in fa_tv_badges, so after the first
// fill only new teams need looking up.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const TSDB_ALIAS: Record<string, string> = {
  'Paris Saint-Germain': 'Paris SG', 'PSG': 'Paris SG', 'Inter Milan': 'Inter', 'Roma': 'AS Roma',
};
const SPORT: Record<string, string> = { Football: 'Soccer', Rugby: 'Rugby', Cricket: 'Cricket' };

const baseName = (n: string) => n.replace(/\s+(WFC|Women|Ladies|W)$/i, '').trim();

let calls = 0;
const pause = (ms: number) => new Promise((res) => setTimeout(res, ms));
async function tsdb(team: string, sport: string): Promise<string | null> {
  const want = SPORT[sport];
  for (const v of [...new Set([TSDB_ALIAS[team] || team, baseName(team)])]) {
    if (calls >= 8) throw new Error('budget');
    calls++;
    await pause(2500);
    const r = await fetch('https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=' + encodeURIComponent(v));
    if (r.status === 429) throw new Error('rate limited');
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const teams = (j && j.teams) || [];
    const hit = teams.find((t: any) => (!want || t.strSport === want) && t.strBadge && t.strTeam.toLowerCase() === v.toLowerCase())
      || teams.find((t: any) => (!want || t.strSport === want) && t.strBadge);
    if (hit) return hit.strBadge;
  }
  return null;
}

Deno.serve(async () => {
  calls = 0; // the worker can stay warm between runs
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: rows, error } = await db.from('fa_tv').select('home,away,sport').gte('starts_at', since).in('sport', Object.keys(SPORT));
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const { data: cached } = await db.from('fa_tv_badges').select('team,badge,looked_up_at');
  const have = new Map((cached || []).map((c: any) => [c.team, c]));
  const retryAfter = Date.now() - 2 * 864e5;
  const todo: [string, string][] = [];
  for (const r of rows || []) for (const t of [r.home, r.away]) {
    if (!t || todo.some((x) => x[0] === t)) continue;
    const c: any = have.get(t);
    if (!c || (!c.badge && new Date(c.looked_up_at).getTime() < retryAfter)) todo.push([t, r.sport]);
  }
  if (!todo.length) { await db.rpc('fa_tv_apply_badges'); return Response.json({ todo: 0 }); }

  let found = 0, missed = 0, waiting = 0;
  for (const [team, sport] of todo) {
    let badge: string | null = null;
    try { badge = await tsdb(team, sport); } catch (_) { waiting++; continue; }
    badge ? found++ : missed++;
    await db.from('fa_tv_badges').upsert({ team, sport, badge, looked_up_at: new Date().toISOString() });
  }
  await db.rpc('fa_tv_apply_badges');
  return Response.json({ todo: todo.length, found, missed, waiting });
});
