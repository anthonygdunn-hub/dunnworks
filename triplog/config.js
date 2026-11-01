/* Trip Log — Supabase connection.
 * The publishable key is meant to be public. Row level security on tl_* tables
 * means each signed-in, approved user can only ever reach their own rows.
 */
window.TL = {
  url: 'https://acdpgarasgfhvupzsbxf.supabase.co',
  key: 'sb_publishable_OWTVpDyadL1lITnCp4gfAQ_EZxVHldY',
  owner: 'info@dunnworks.io',
  notifyFn: 'tl-notify'
};
