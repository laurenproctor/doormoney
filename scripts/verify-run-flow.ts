/*
  Walks a musician through the run page against a running dev server and a real database, and
  checks what came out. The unit tests cover the rules; this covers the wiring: ownership, the
  server actions, the draft preview, and what a stranger gets.

    npx tsx --env-file=.env.local scripts/verify-run-flow.ts [base-url]

  It drives the pages' own forms over HTTP, the way a browser with JavaScript switched off does:
  read the page, take the form's hidden $ACTION_* inputs, post them back. That runs the real
  action through the real route without a browser, and it catches the no-JavaScript path, which
  is where a validation message is most easily lost.

  It creates two throwaway musicians, an act and a draft run, and deletes all of it at the end,
  including on failure. Point it at a database you are happy to write to. Needs the service role
  key, which is how the fixtures are made and read back.
*/
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "a-long-enough-password";

if (!SUPA || !SRK) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${label}${detail ? `  <- ${detail}` : ""}`);
};
const section = (s: string) => console.log(`\n== ${s} ==`);

// ---------------------------------------------------------------
// Talking to the database directly, for fixtures and for reading back what the app wrote.
// ---------------------------------------------------------------
const headers = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { ...headers, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const body = await res.text();
  return (body ? JSON.parse(body) : null) as T;
}
const auth = (path: string, init: RequestInit = {}) => fetch(`${SUPA}/auth/v1/${path}`, { ...init, headers });

// ---------------------------------------------------------------
// A cookie jar and the form driver.
// ---------------------------------------------------------------
type Jar = { header: () => string; take: (res: Response) => Response };
function jar(): Jar {
  const cookies = new Map<string, string>();
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    take(res) {
      for (const line of res.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value === "" || /expires=thu, 01 jan 1970/i.test(line)) cookies.delete(name);
        else cookies.set(name, value);
      }
      return res;
    },
  };
}

type Reply = { status: number; location: string | null; body: string };
async function get(j: Jar, path: string): Promise<Reply> {
  const res = j.take(await fetch(BASE + path, { headers: { cookie: j.header() }, redirect: "manual" }));
  return { status: res.status, location: res.headers.get("location"), body: res.status >= 300 && res.status < 400 ? "" : await res.text() };
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

type Form = { action: string | null; hidden: Record<string, string[]>; names: string[] };

/** The form that owns a given field. Never the first form on the page: Sign out is first. */
function formWith(html: string, field: string): Form | null {
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const inner = m[2];
    const names = [...inner.matchAll(/<(?:input|textarea|select)\b[^>]*name="([^"]*)"/gi)].map((x) => x[1]);
    if (!names.includes(field)) continue;
    const hidden: Record<string, string[]> = {};
    for (const h of inner.matchAll(/<input\b[^>]*type="hidden"[^>]*>/gi)) {
      const name = /name="([^"]*)"/i.exec(h[0])?.[1];
      if (name) (hidden[name] ??= []).push(decode(/value="([^"]*)"/i.exec(h[0])?.[1] ?? ""));
    }
    return { action: /action="([^"]*)"/i.exec(m[1])?.[1] ?? null, hidden, names };
  }
  return null;
}

/** Posts a form back, carrying its $ACTION_* inputs so the server action runs. */
async function post(j: Jar, path: string, form: Form, fields: Record<string, string | string[]>): Promise<Reply> {
  const fd = new FormData();
  for (const [k, values] of Object.entries(form.hidden)) {
    if (k in fields) continue;
    for (const v of values) fd.append(k, v);
  }
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  const res = j.take(await fetch(BASE + (form.action || path), { method: "POST", headers: { cookie: j.header() }, body: fd, redirect: "manual" }));
  return { status: res.status, location: res.headers.get("location"), body: res.status >= 300 && res.status < 400 ? "" : await res.text() };
}

async function signIn(email: string) {
  const j = jar();
  const page = await get(j, "/login");
  const form = formWith(page.body, "handle");
  if (!form) throw new Error("no sign-in form on /login");
  return { jar: j, res: await post(j, "/login", form, { handle: email, password: PASSWORD }) };
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------
const stamp = Date.now().toString(36).slice(-6);
const made: { users: string[]; acts: string[] } = { users: [], acts: [] };

async function makeMusician(tag: string) {
  const email = `dm-flow-${tag}-${stamp}@example.test`;
  const created = await (await auth("admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: `Flow ${tag}`, roles: ["musician"] } }),
  })).json();
  made.users.push(created.id);
  const slug = `flow-${tag}-${stamp}`;
  const act = await rest<{ id: string }[]>("acts", {
    method: "POST",
    body: JSON.stringify({ owner_id: created.id, slug, name: `Flow ${tag.toUpperCase()}`, type: "touring_band", city: "New York", bio: "A rehearsal act, deleted at the end of this script." }),
  });
  made.acts.push(act[0].id);
  await rest("profiles?id=eq." + created.id, { method: "PATCH", body: JSON.stringify({ username: slug }) });
  return { email, actId: act[0].id, slug };
}

async function cleanUp() {
  for (const id of made.acts) await rest(`acts?id=eq.${id}`, { method: "DELETE" });
  for (const id of made.users) await auth(`admin/users/${id}`, { method: "DELETE" });
}

async function main() {
  const a = await makeMusician("a");
  const b = await makeMusician("b");
  const run = (await rest<{ id: string }[]>("runs", {
    method: "POST",
    body: JSON.stringify({ act_id: a.actId, kind: "tour", title: "Flow run", starts_on: "2027-04-01", ends_on: "2027-04-28", show_count: 8, status: "draft" }),
  }))[0];
  const page = `/dashboard/runs/${run.id}`;
  const runRow = async () => (await rest<{ status: string; verification_methods: string[]; verification_other: string | null }[]>(`runs?id=eq.${run.id}&select=status,verification_methods,verification_other`))[0];

  section("a stranger");
  {
    const j = jar();
    const p = await get(j, `${page}/preview`);
    ok(p.status === 307 && (p.location ?? "").startsWith("/login"), "the draft preview sends them to sign in", `${p.status} ${p.location ?? ""}`);
    const r = await get(j, page);
    ok(r.status === 307 && (r.location ?? "").startsWith("/login"), "so does the run page", `${r.status} ${r.location ?? ""}`);
  }

  section("the musician who owns the run");
  const A = await signIn(a.email);
  ok(A.res.status === 303 || A.res.status === 302, "signs in", `status ${A.res.status}`);
  let html = (await get(A.jar, page)).body;
  ok(html.length > 0, "opens the run page");

  section("a predefined method saves");
  const form = formWith(html, "methods")!;
  ok(Boolean(form), "the verification form is there");
  await post(A.jar, page, form, { methods: ["end_of_run_record"] });
  ok(JSON.stringify((await runRow()).verification_methods) === JSON.stringify(["end_of_run_record"]), "it reaches the database");

  section("a write-in with too little in it is refused");
  html = (await get(A.jar, page)).body;
  const short = await post(A.jar, page, formWith(html, "methods")!, { methods: ["other"], other: "photos" });
  ok(/at least 10 characters/.test(strip(short.body)), "the page says how much is needed, with JavaScript off");
  ok(short.body.includes(">photos<"), "and gives the answer back rather than losing it");
  ok(JSON.stringify((await runRow()).verification_methods) === JSON.stringify(["end_of_run_record"]), "nothing was written");

  section("a real write-in saves, trimmed");
  const answer = "The band photographs the marked kick head at selected shows, with the room and the date beside each image.";
  html = (await get(A.jar, page)).body;
  await post(A.jar, page, formWith(html, "methods")!, { methods: ["venue_date_record", "other"], other: `   ${answer}   ` });
  let row = await runRow();
  ok(JSON.stringify(row.verification_methods) === JSON.stringify(["venue_date_record", "other"]), "stored in catalog order", JSON.stringify(row.verification_methods));
  ok(row.verification_other === answer, "and trimmed");

  section("deselecting the write-in clears it");
  html = (await get(A.jar, page)).body;
  await post(A.jar, page, formWith(html, "methods")!, { methods: ["selected_show_photos"], other: answer });
  row = await runRow();
  ok(JSON.stringify(row.verification_methods) === JSON.stringify(["selected_show_photos"]), "only the method that stayed ticked is stored");
  ok(row.verification_other === null, "the answer is gone even though the form still carried it");

  section("the spots");
  html = (await get(A.jar, page)).body;
  await post(A.jar, page, formWith(html, "on_kick_head")!, { on_kick_head: "1", count_kick_head: "1", price_kick_head: "1200", mode_kick_head: "fixed" });
  const lots = await rest<{ surface_key: string; price_cents: number }[]>(`lots?run_id=eq.${run.id}&select=surface_key,price_cents`);
  ok(lots.length === 1 && lots[0].price_cents === 120000, "one kick head at $1,200 is on the run", JSON.stringify(lots));

  section("the draft preview");
  const prev = await get(A.jar, `${page}/preview`);
  ok(prev.status === 200, "the owner can open it", `status ${prev.status}`);
  const seen = strip(prev.body);
  ok(/Draft preview, private to this account/.test(seen), "it says what it is");
  ok(/Back to editing/.test(seen), "it offers the way back");
  ok(/Flow A/.test(seen) && /Back the run/.test(seen), "it is the real board, not a copy of one");
  ok(/Dated photos from selected shows/.test(seen), "carrying the verification the musician chose");
  const board = await get(A.jar, `/board/${a.slug}`);
  ok(board.status === 404, "and the public address is still empty", `status ${board.status}`);

  section("another musician");
  const B = await signIn(b.email);
  ok(B.res.status === 303 || B.res.status === 302, "signs in");
  ok((await get(B.jar, page)).status === 404, "cannot open the run page");
  ok((await get(B.jar, `${page}/preview`)).status === 404, "cannot open the draft preview");
  const forged = formWith(html, "methods")!;
  await post(B.jar, page, { ...forged, hidden: { ...forged.hidden, run_id: [run.id] } }, { methods: ["short_video"] });
  ok(JSON.stringify((await runRow()).verification_methods) === JSON.stringify(["selected_show_photos"]), "and posting the run id changes nothing");
}

main()
  .catch((e) => {
    console.error("\nthrew:", e instanceof Error ? e.message : e);
    fail++;
  })
  .finally(async () => {
    await cleanUp();
    console.log(`\n${pass} passed, ${fail} failed. Rehearsal data deleted.`);
    process.exit(fail ? 1 : 0);
  });
