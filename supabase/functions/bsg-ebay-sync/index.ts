// bsg-ebay-sync: keeps the Backswing Golf shop and its eBay shop in step.
//
// Off until these secrets are set (Supabase > Edge Functions > Secrets):
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET   eBay developer app, production keyset
//   EBAY_RUNAME                          the app's redirect URL name; its "accept URL" is
//                                        <this function's URL>?action=callback
//   BSG_CRON_SECRET                      any long random string, sent by the 15-minute cron job
//   optional, only for listing site-added items on eBay:
//   EBAY_PAYMENT_POLICY, EBAY_RETURN_POLICY, EBAY_SHIPPING_POLICY, EBAY_POSTCODE
//
// Actions (POST JSON {action}, editors only unless noted):
//   status   connected?, can_connect?, seller, last_pull
//   connect  returns the eBay consent URL (Backswing signs in to eBay and approves)
//   callback GET from eBay after approval: swaps the code for tokens, back to the admin
//   pull     eBay -> site: new listings added, changes copied, sold/ended ones marked   (also cron)
//   push     site -> eBay: price, title, quantity edits; items hidden/sold here end on eBay (also cron)
//   list     {id} lists a site-added item on eBay (needs the policy secrets)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { XMLParser } from 'npm:fast-xml-parser@4.4.1';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CID = Deno.env.get('EBAY_CLIENT_ID') || '';
const CSECRET = Deno.env.get('EBAY_CLIENT_SECRET') || '';
const RUNAME = Deno.env.get('EBAY_RUNAME') || '';
const CRON = Deno.env.get('BSG_CRON_SECRET') || '';
const ADMIN_URL = Deno.env.get('BSG_ADMIN_URL') || 'https://dunnworks.io/preview/backswing-golf/#/admin';
const SCOPES = ['https://api.ebay.com/oauth/api_scope', 'https://api.ebay.com/oauth/api_scope/sell.inventory', 'https://api.ebay.com/oauth/api_scope/sell.account'].join(' ');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, isArray: n => ['Item', 'PictureURL', 'NameValueList', 'Value', 'Errors', 'OrderTransaction'].includes(n) });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const log = (direction: string, action: string, detail: string, ebay_item_id: string | null = null) => db.from('bsg_sync_log').insert({ direction, action, detail, ebay_item_id });
const xesc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

async function isEditor(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const u = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await u.rpc('bsg_is_editor');
  return data === true;
}

// ------------------------------------------------------------------ OAuth
async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${CID}:${CSECRET}`) },
    body: new URLSearchParams(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'eBay token request failed');
  return j;
}
async function accessToken() {
  const { data: a } = await db.from('bsg_ebay_auth').select('*').eq('id', 1).maybeSingle();
  if (!a?.refresh_token) throw new Error('eBay is not linked yet');
  if (a.access_token && new Date(a.access_expires_at).getTime() > Date.now() + 120_000) return a.access_token as string;
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refresh_token, scope: SCOPES });
  await db.from('bsg_ebay_auth').update({ access_token: j.access_token, access_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', 1);
  return j.access_token as string;
}
// signed state so the callback only accepts approvals this function started
async function sign(v: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(CSECRET + SERVICE.slice(-16)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(s))).replace(/[+/=]/g, '');
}

// ------------------------------------------------------------------ Trading API
async function trading(call: string, inner: string) {
  const token = await accessToken();
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '3', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1311', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_GB</ErrorLanguage><WarningLevel>High</WarningLevel>${inner}</${call}Request>`,
  });
  const out = xml.parse(await r.text())[`${call}Response`] || {};
  if (out.Ack === 'Failure') throw new Error((out.Errors || []).map((e: any) => e.LongMessage || e.ShortMessage).join('; ') || `${call} failed`);
  return out;
}

const CAT_RULES: [RegExp, string][] = [
  [/head ?cover/i, 'Headcovers'], [/job ?lot/i, 'Job lots'], [/\bbag\b/i, 'Bags'], [/\bgrips?\b/i, 'Grips'],
  [/\bshaft\b(?!.*\bhead\b)/i, 'Shafts'], [/\bhead\b/i, 'Heads'], [/iron set|\d-?pw/i, 'Iron sets'], [/putter/i, 'Putters'],
  [/wedge/i, 'Wedges'], [/hybrid|rescue|utility/i, 'Hybrids'], [/fairway|\b[3579] ?wood/i, 'Fairway woods'], [/driver/i, 'Drivers'], [/\biron\b|#\d/i, 'Irons'],
];
const slugify = (t: string, id: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id.slice(-6);

async function fullItem(id: string) {
  const out = await trading('GetItem', `<ItemID>${xesc(id)}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`);
  const it = out.Item?.[0] || {};
  const specs: Record<string, string> = {};
  for (const nv of it.ItemSpecifics?.NameValueList || []) specs[nv.Name] = (nv.Value || []).join(', ');
  const title: string = it.Title || '';
  const hand = /left/i.test(specs['Handedness'] || title) ? 'Left' : /right/i.test(specs['Handedness'] || title) ? 'Right' : null;
  return {
    source: 'ebay', ebay_item_id: id, ebay_url: `https://www.ebay.co.uk/itm/${id}`, title, slug: slugify(title, id),
    price: Number(it.StartPrice?.['#text'] ?? it.SellingStatus?.CurrentPrice?.['#text'] ?? 0),
    qty: Math.max(0, Number(it.Quantity || 1) - Number(it.SellingStatus?.QuantitySold || 0)),
    category: CAT_RULES.find(([re]) => re.test(title))?.[1] || 'Other',
    brand: specs['Brand'] || null, model: specs['Model'] || null, club: specs['Club Number'] || null, hand,
    shaft: specs['Shaft Material'] || null, loft: specs['Loft'] || null,
    ebay_condition: it.ConditionDisplayName || null, seller_notes: it.ConditionDescription || null,
    grade: /ex ?demo|fitting/i.test((it.ConditionDescription || '') + title) ? 'Ex-demo' : /new/i.test(it.ConditionDisplayName || '') ? 'Excellent' : 'Very good',
    grade_confirmed: false, specs, images: (it.PictureDetails?.PictureURL || []).map((u: string) => u.replace(/s-l\d+\./, 's-l1600.')),
    status: 'live', sync_state: 'in_sync',
  };
}

// eBay -> site
async function pull() {
  const active = new Map<string, { title: string; price: number; qty: number }>();
  for (let page = 1; page < 30; page++) {
    const out = await trading('GetMyeBaySelling', `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><DetailLevel>ReturnAll</DetailLevel>`);
    const items = out.ActiveList?.ItemArray?.Item || [];
    for (const it of items) active.set(String(it.ItemID), { title: it.Title, price: Number(it.SellingStatus?.CurrentPrice?.['#text'] ?? it.BuyItNowPrice?.['#text'] ?? 0), qty: Number(it.QuantityAvailable ?? it.Quantity ?? 1) });
    if (page >= Number(out.ActiveList?.PaginationResult?.TotalNumberOfPages || 1)) break;
  }
  const { data: ours } = await db.from('bsg_products').select('id,ebay_item_id,title,price,qty,status,sync_state').not('ebay_item_id', 'is', null);
  const byId = new Map((ours || []).map(r => [r.ebay_item_id, r]));
  let added = 0, changed = 0, gone = 0;
  for (const [id, a] of active) {
    const r = byId.get(id);
    if (!r) { await db.from('bsg_products').insert(await fullItem(id)); added++; await log('eBay to site', 'added', a.title, id); continue; }
    if (r.sync_state === 'pending_push') continue; // our edit wins until it has been sent
    if (r.title !== a.title || Number(r.price) !== a.price || r.qty !== a.qty || r.status !== 'live') {
      await db.from('bsg_products').update({ title: a.title, price: a.price, qty: a.qty, status: r.status === 'hidden' ? 'hidden' : 'live', sync_state: 'in_sync' }).eq('id', r.id); changed++;
    }
  }
  // listed here as live but no longer active on eBay: sold, or ended
  const soldIds = new Set<string>();
  const sold = await trading('GetMyeBaySelling', `<SoldList><Include>true</Include><DurationInDays>60</DurationInDays><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></SoldList>`);
  for (const t of sold.SoldList?.OrderTransactionArray?.OrderTransaction || []) { const id = t.Transaction?.Item?.ItemID; if (id) soldIds.add(String(id)); }
  for (const r of ours || []) {
    if (r.status !== 'live' || active.has(r.ebay_item_id)) continue;
    const isSold = soldIds.has(r.ebay_item_id);
    await db.from('bsg_products').update({ status: isSold ? 'sold' : 'hidden', qty: 0, sync_state: 'in_sync' }).eq('id', r.id); gone++;
    await log('eBay to site', isSold ? 'sold' : 'ended', r.title, r.ebay_item_id);
  }
  await db.from('bsg_ebay_auth').update({ last_pull: new Date().toISOString() }).eq('id', 1);
  if (added || changed || gone) await log('eBay to site', 'check', `${added} new, ${changed} changed, ${gone} sold or ended`);
  return { message: `Checked eBay: ${added} new, ${changed} changed, ${gone} sold or ended`, added, changed, gone };
}

// site -> eBay
async function push() {
  const { data } = await db.from('bsg_products').select('*').eq('sync_state', 'pending_push').not('ebay_item_id', 'is', null).limit(100);
  let ok = 0; const errors: string[] = [];
  for (const r of data || []) {
    try {
      if (r.status !== 'live' || r.qty < 1) {
        await trading('EndFixedPriceItem', `<ItemID>${xesc(r.ebay_item_id)}</ItemID><EndingReason>NotAvailable</EndingReason>`);
        await log('site to eBay', 'ended', r.title, r.ebay_item_id);
      } else {
        await trading('ReviseFixedPriceItem', `<Item><ItemID>${xesc(r.ebay_item_id)}</ItemID><Title>${xesc(String(r.title).slice(0, 80))}</Title><StartPrice currencyID="GBP">${Number(r.price).toFixed(2)}</StartPrice><Quantity>${r.qty}</Quantity></Item>`);
        await log('site to eBay', 'updated', `${r.title} at £${Number(r.price).toFixed(2)}`, r.ebay_item_id);
      }
      await db.from('bsg_products').update({ sync_state: 'in_sync' }).eq('id', r.id); ok++;
    } catch (e) { errors.push(`${r.title}: ${(e as Error).message}`); await db.from('bsg_products').update({ sync_state: 'push_failed' }).eq('id', r.id); await log('site to eBay', 'failed', (e as Error).message, r.ebay_item_id); }
  }
  await db.from('bsg_ebay_auth').update({ last_push: new Date().toISOString() }).eq('id', 1);
  return { message: `Sent ${ok} change${ok === 1 ? '' : 's'} to eBay${errors.length ? `, ${errors.length} failed` : ''}`, errors };
}

// list a site-added item on eBay
const EBAY_CATS: Record<string, string> = { Drivers: '115280', 'Fairway woods': '115280', Hybrids: '115280', Irons: '115280', 'Iron sets': '115280', Wedges: '115280', Putters: '115280', Heads: '115280', Shafts: '47306', Headcovers: '159083', Bags: '47302', Grips: '47305', 'Job lots': '115280', Other: '1513' };
async function list(id: string) {
  const need = ['EBAY_PAYMENT_POLICY', 'EBAY_RETURN_POLICY', 'EBAY_SHIPPING_POLICY', 'EBAY_POSTCODE'].filter(k => !Deno.env.get(k));
  if (need.length) throw new Error('Listing on eBay needs the business policy settings first: ' + need.join(', '));
  const { data: r } = await db.from('bsg_products').select('*').eq('id', id).single();
  if (!r || r.ebay_item_id) throw new Error('That item is already on eBay');
  const specs = { Brand: r.brand, Model: r.model, Handedness: r.hand ? r.hand + '-Handed' : null, Flex: r.flex, 'Shaft Material': r.shaft, 'Club Number': r.club, Loft: r.loft, ...(r.specs || {}) };
  const nv = Object.entries(specs).filter(([, v]) => v).map(([k, v]) => `<NameValueList><Name>${xesc(k)}</Name><Value>${xesc(v)}</Value></NameValueList>`).join('');
  const out = await trading('AddFixedPriceItem', `<Item><Title>${xesc(String(r.title).slice(0, 80))}</Title>
    <Description>${xesc((r.description || r.title) + (r.seller_notes ? '\n\n' + r.seller_notes : ''))}</Description>
    <PrimaryCategory><CategoryID>${EBAY_CATS[r.category] || '1513'}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="GBP">${Number(r.price).toFixed(2)}</StartPrice><Quantity>${r.qty || 1}</Quantity>
    <ConditionID>${/^new/i.test(r.ebay_condition || '') ? '1500' : '3000'}</ConditionID>${r.seller_notes ? `<ConditionDescription>${xesc(r.seller_notes)}</ConditionDescription>` : ''}
    <Country>GB</Country><Currency>GBP</Currency><Site>UK</Site><PostalCode>${xesc(Deno.env.get('EBAY_POSTCODE'))}</PostalCode><DispatchTimeMax>2</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>
    <PictureDetails>${(r.images || []).slice(0, 12).map((u: string) => `<PictureURL>${xesc(u)}</PictureURL>`).join('')}</PictureDetails>
    <ItemSpecifics>${nv}</ItemSpecifics>
    <SellerProfiles><SellerPaymentProfile><PaymentProfileID>${Deno.env.get('EBAY_PAYMENT_POLICY')}</PaymentProfileID></SellerPaymentProfile><SellerReturnProfile><ReturnProfileID>${Deno.env.get('EBAY_RETURN_POLICY')}</ReturnProfileID></SellerReturnProfile><SellerShippingProfile><ShippingProfileID>${Deno.env.get('EBAY_SHIPPING_POLICY')}</ShippingProfileID></SellerShippingProfile></SellerProfiles>
  </Item>`);
  const itemId = String(out.ItemID);
  await db.from('bsg_products').update({ ebay_item_id: itemId, ebay_url: `https://www.ebay.co.uk/itm/${itemId}`, source: 'ebay', sync_state: 'in_sync' }).eq('id', id);
  await log('site to eBay', 'listed', r.title, itemId);
  return { message: 'Listed on eBay', ebay_item_id: itemId };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url);
  try {
    // eBay sends the seller back here after they approve
    if (req.method === 'GET' && u.searchParams.get('action') === 'callback') {
      const code = u.searchParams.get('code'), state = u.searchParams.get('state') || '';
      const [ts, sig] = state.split('.');
      if (!code || !ts || sig !== await sign(ts) || Date.now() - Number(ts) > 3600_000) return new Response('This approval link has expired. Start again from the shop admin.', { status: 400 });
      const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: RUNAME });
      await db.from('bsg_ebay_auth').upsert({ id: 1, refresh_token: j.refresh_token, refresh_expires_at: new Date(Date.now() + j.refresh_token_expires_in * 1000).toISOString(), access_token: j.access_token, access_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() });
      try { const me = await trading('GetUser', ''); await db.from('bsg_ebay_auth').update({ seller: me.User?.UserID || null }).eq('id', 1); } catch (_) { /* name is cosmetic */ }
      await log('setup', 'linked', 'eBay account linked');
      return Response.redirect(ADMIN_URL, 302);
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || u.searchParams.get('action') || 'status';
    const fromCron = CRON && req.headers.get('x-cron-secret') === CRON;
    if (!fromCron && !(await isEditor(req))) return json({ error: 'Sign in to the shop admin first' }, 401);

    if (action === 'status') {
      const { data: a } = await db.from('bsg_ebay_auth').select('seller,refresh_token,last_pull,last_push').eq('id', 1).maybeSingle();
      return json({ connected: !!a?.refresh_token, can_connect: !!(CID && CSECRET && RUNAME), seller: a?.seller || null, last_pull: a?.last_pull || null, last_push: a?.last_push || null });
    }
    if (action === 'connect') {
      if (!(CID && CSECRET && RUNAME)) return json({ error: 'The eBay developer keys are not set up yet' }, 400);
      const ts = String(Date.now());
      const url = `https://auth.ebay.com/oauth2/authorize?client_id=${encodeURIComponent(CID)}&response_type=code&redirect_uri=${encodeURIComponent(RUNAME)}&scope=${encodeURIComponent(SCOPES)}&state=${ts}.${await sign(ts)}`;
      return json({ url });
    }
    if (action === 'pull') return json(await pull());
    if (action === 'push') return json(await push());
    if (action === 'sync') { const a = await push(); const b = await pull(); return json({ message: a.message + '. ' + b.message }); }
    if (action === 'list') return json(await list(body.id));
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
