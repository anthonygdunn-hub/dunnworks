// fa-gallery-import: retired. It was a one-off helper used on 29 Oct 2026 to
// copy hand-picked Facebook photos into the Falkners Arms gallery. It now does
// nothing; fa-facebook-sync takes over once the Page is connected.
Deno.serve(() => new Response('gone', { status: 410 }));
