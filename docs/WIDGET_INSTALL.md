# Installing the widget

The widget is one line on the organizer's site, and it is for one exact fundraiser:

```html
<script src="https://<door money domain>/embed.js" data-act="<slug>" data-fundraiser="<fundraiser id>"></script>
```

The loader injects an iframe pointing at `/embed/<slug>?fundraiser=<fundraiser id>` right after the script tag and listens for one message from it, the widget's height, so the frame never scrolls inside itself. Payment happens inside the frame, on Door Money's origin. The host page cannot read into it, and the card field is a further frame served by Stripe.

The dashboard ("On your site") shows one line per open music fundraiser, each with its own id filled in, along with the link button and the badges.

## One widget, one fundraiser

An organizer can have more than one fundraiser open. A fan who reads "Fall run" in the widget and pays must find their money on the fall run, so the fundraiser is settled once, when the widget is drawn, and its id travels with everything after that:

| Step | What carries the fundraiser |
| --- | --- |
| The snippet | `data-fundraiser` |
| The frame | `/embed/<slug>?fundraiser=<id>` |
| Starting the payment | `runId` in the request to `/api/checkout`, checked against the organizer and against the fundraiser being open |
| The payment | `run_id` in the PaymentIntent's metadata, and on the backing row |
| A redirect-based method coming back | the same `?fundraiser=<id>` on the return address, and the notice shows only if the payment's `run_id` is that id |
| The webhook | the backing row decides where money goes, and is refused if the payment's `run_id` names a different fundraiser |
| The receipt and the record | built from the backing row, so they name the fundraiser that was paid |

A widget that names a fundraiser never shows another one. When that fundraiser closes, the widget says it has closed and takes no more backings. It does not move on to whatever the organizer opens next. An id that is malformed, that belongs to another organizer, or that belongs to a draft answers 404.

The widget sells music's backing tiers (a name on the tour thank-you, a name on the merch table card), so it draws only for a music fundraiser and the checkout refuses a backing on any other category. Sponsorship options are never drawn in the widget: it links to the fundraiser's own page for those.

## Snippets pasted before this (the compatibility path)

Snippets handed out before exact widgets look like this, and are on real sites:

```html
<script src="https://<door money domain>/embed.js" data-act="<slug>"></script>
```

They keep working, deliberately, and nobody has to re-paste anything:

1. With no `data-fundraiser`, the loader frames `/embed/<slug>`, which draws the organizer's **current** fundraiser: the open one with the latest start date. That is what these snippets always did.
2. The page still settles on one fundraiser when it draws, and sends that fundraiser's id with the payment and keeps it on the return address. So even an old snippet pays the fundraiser it showed, and cannot drift to another one between the page loading and the fan paying.
3. With no fundraiser open, `/embed/<slug>` answers 404, as before.

The one behavior that differs from an exact snippet: when the current fundraiser closes and another opens, an old snippet follows the organizer to the new one. An organizer who wants a widget pinned to one fundraiser replaces the line with the one from the dashboard.

A widget page that was already open in somebody's browser when this shipped sends no `runId`. `/api/checkout` accepts that only when the organizer has exactly one fundraiser open, so there is nothing to confuse it with. With two or more open it answers 409 and asks for a reload, which loads a page that names its fundraiser.

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
- **Link-only platforms** (Linktree, Bandcamp, Substack footers, Instagram bios). Use the link button or the plain fundraiser address. The same payment happens on the fundraiser's page, whose own widget is framed for that exact fundraiser.

## Quirks to keep in mind

- The widget's height message is sent to the immediate parent window only. Any platform that sandboxes custom code in its own frame needs a fixed height.
- Apple Pay inside the frame needs the Door Money domain registered with Stripe (Payment method domains), and only shows over HTTPS.
- Link is turned off in the widget on purpose: its save-my-info prompt asks for a phone number, which is more than a $25 backing should ask for.
