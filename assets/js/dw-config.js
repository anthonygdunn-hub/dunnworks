/* Dunnworks — where the admin and the previews page get their data.
 *
 * The anon key is meant to be public: it identifies the project, it does not
 * grant anything. What protects the data is row level security in Postgres.
 * With this key you can read published projects and nothing else. Passphrases
 * live in a separate table that no anon policy touches, so they are
 * unreachable without signing in.
 *
 * PASTE THE ANON KEY BELOW. Supabase dashboard, project acdpgarasgfhvupzsbxf,
 * Settings, API keys, the one labelled anon public.
 */
window.DW = {
  url: 'https://acdpgarasgfhvupzsbxf.supabase.co',
  anonKey: ''anonKey: '',        // <-- paste it here
  owner: 'info@dunnworks.io'
};
