# Installing the widget

The widget is one line on the musician's site:

```html
<script src="https://<door money domain>/embed.js" data-act="<slug>"></script>
```

The loader injects an iframe pointing at `/embed/<slug>` right after the script tag and listens for one message from it, the widget's height, so the frame never scrolls inside itself. Payment happens inside the frame, on Door Money's origin. The host page cannot read into it, and the card field is a further frame served by Stripe.

Both snippets, the link button and the badges appear on the act's dashboard once the board is live.

## What the loader needs from a platform

1. A place to paste raw HTML that is served as-is (not escaped, not stripped of `<script>`).
2. The script must run on the page, or inside a same-origin wrapper frame the platform provides.
3. The frame needs the `allow="payment"` attribute the loader sets, for Apple Pay and Google Pay. Card payments work without it.

The widget itself is 380px wide at most, so it fits a sidebar, a column, or a footer.

## Verified

- **A hand-built site on another origin.** Tested 2026-09-03 with a static page on `127.0.0.1:8787` framing a local Door Money. The frame loaded, resized as the widget changed (560 to 730px on load, 615px with the placement option, 780px with the card form), the backing recorded the host page's origin, and the host page could not read into the frame. The embed document is transparent and resets `color-scheme` to normal, so the card sits directly on a light page without a dark rectangle around it.

## Expected behavior per platform

Not yet tested on a real account. Each note is what the platform documents about custom code; confirm on a throwaway site and move the entry up.

- **Squarespace.** A Code block (Business plan or higher; Personal plans strip scripts). Set the block to HTML, paste the snippet. The script runs on the page, so the resize works. Squarespace's editor preview may not run the script; check the published page.
- **WordPress.** A Custom HTML block in the block editor. Sites on WordPress.com below the Business plan strip `<script>` tags; self-hosted sites and Business plans keep them. Some security plugins strip scripts from posts for non-admin authors; paste as an administrator or use a widget area.
- **Webflow.** An Embed element (paid site plan required to publish custom code). Runs on the page; resize works. Webflow's designer canvas does not execute scripts, so the widget appears only on the published site.
- **Wix.** Embed HTML (the "Embed a widget" element). Wix wraps custom code in its own sandboxed iframe with a fixed size set in the editor, so the widget's resize message reaches the sandbox, not the page. Set the element's height to about 800px so the card form fits, or use the link button instead.
- **Carrd.** An Embed element with code, which needs Carrd Pro (Standard or above). Runs on the page; resize works. Free sites cannot embed and should use the link button.
- **Shopify.** A Custom Liquid or Custom HTML section, or a page in the theme editor. Runs on the page.
- **Link-only platforms** (Linktree, Bandcamp, Substack footers, Instagram bios). Use the link button or the plain board address. The same payment happens on the board.

## Quirks to keep in mind

- The widget's height message is sent to the immediate parent window only. Any platform that sandboxes custom code in its own frame needs a fixed height.
- Apple Pay inside the frame needs the Door Money domain registered with Stripe (Payment method domains), and only shows over HTTPS.
- Link is turned off in the widget on purpose: its save-my-info prompt asks for a phone number, which is more than a $25 backing should ask for.
