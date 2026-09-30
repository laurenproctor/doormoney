import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
let logo: string | null = "https://example.invalid/approved-logo.png";
mock.module("next/navigation", { namedExports: { usePathname: () => "/project-recognition/test", notFound: () => { throw new Error("not found"); } } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: "sponsor" }) } });
mock.module("@/lib/project-updates", { namedExports: { UUID: /^[a-f0-9-]{36}$/ } });
mock.module("@/app/actions/project-recognition", { namedExports: { decideProjectRecognition: async () => {} } });
mock.module("@/lib/supabase/server", { namedExports: { supabaseServer: async () => { throw new Error("Unexpected session query"); }, supabaseAdmin: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: {
    id: "11111111-1111-4111-8111-111111111111", display_name: "Acme sponsor", logo_url: logo,
    approved_at: null, withdrawn_at: null, project_updates: { context_version: 7, title: "An update", runs: { title: "A project" } },
  } }) }; return query;
} }) } });
const { default: Recognition } = await import("@/app/project-recognition/[id]/page");
const render = async (error?: string) => renderToStaticMarkup(await Recognition({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }), searchParams: Promise.resolve({ error }) }));
test("the sponsor can see the exact proposed logo before approving recognition", async () => {
  logo = "https://example.invalid/approved-logo.png";
  const html = await render();
  assert.match(html, /<img[^>]*src="https:\/\/example.invalid\/approved-logo.png"/);
  assert.match(html, /alt="Proposed recognition logo for Acme sponsor"/);
});
test("a name-only recognition proposal does not display a logo", async () => {
  logo = null;
  assert.doesNotMatch(await render(), /<img/);
});

test("approval submits the context version rendered with the proposal", async () => {
  assert.match(await render(), /name="version" value="7"/);
});
test("a stale approval explains rejection and renders the refreshed proposal", async () => {
  const html = await render("changed");
  assert.match(html, /role="alert"/);
  assert.match(html, /Your approval was not saved/);
  assert.match(html, /Review the current proposal below/);
  assert.match(html, /name="version" value="7"/);
});
