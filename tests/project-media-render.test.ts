import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectMedia } from "@/components/ProjectMedia";
import type { UpdateMedia } from "@/lib/project-updates";
const media = (values: Partial<UpdateMedia>): UpdateMedia => ({ id: "media", kind: "image", url: null,
  provider: null, videoId: null, alt: null, caption: null, ...values });
const render = (items: UpdateMedia[]) => renderToStaticMarkup(createElement(ProjectMedia, { media: items }));
test("external players render a consent button without an iframe or third-party resource", () => {
  for (const provider of ["youtube", "vimeo"]) {
    const html = render([media({ kind: "embed", provider, videoId: "12345678901" })]);
    assert.match(html, /<button/);
    assert.match(html, /loads an external player/);
    assert.doesNotMatch(html, /<iframe|src=|<link/);
  }
});
test("pending image and video render no media resource", () => {
  const html = render([media({ kind: "image" }), media({ kind: "video" })]);
  assert.doesNotMatch(html, /<img|<video|src=/);
});
test("ready media preserves image descriptions and video playback controls", () => {
  const html = render([media({ url: "https://example.invalid/image", alt: "Project poster" }),
    media({ kind: "video", url: "https://example.invalid/video", caption: "Project rehearsal" })]);
  assert.match(html, /alt="Project poster"/);
  assert.match(html, /<video[^>]*controls=""[^>]*preload="metadata"/);
  assert.match(html, /aria-label="Project rehearsal"/);
});
