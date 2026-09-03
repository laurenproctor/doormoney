# Door Money

Sponsorship marketplace for working musicians in New York. Start with `CLAUDE.md`, then `docs/ROADMAP.md`.

## Run it

```bash
npm install
npm run dev
```

Opens on http://localhost:3000 with sample data and pretend forms. No accounts needed.

## Connect it

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
   (Or `supabase link` and `supabase db reset` if the CLI is installed.)
2. Create a Stripe account, enable Connect with Express accounts, stay in test mode.
3. `cp .env.example .env.local` and fill it in.
4. `npm run dev` again. The boards now read from Supabase and the waitlist saves.

## Layout

```
CLAUDE.md                 product rules, voice rules, engineering rules
docs/ROADMAP.md           phases 0 to 7
docs/DECISIONS.md         open product questions and the defaults in code
docs/mockups/             the seven HTML mockups. The design spec.
supabase/migrations/      schema
supabase/seed.sql         Gutter Hymns, Rosie, the standard card
src/lib/catalog.ts        the standard card (surfaces, default prices)
src/lib/money.ts          cents, fees, weekly slices
src/lib/boards.ts         board reads, with in-memory fallback
src/lib/stripe.ts         hold and transfer shapes for Phase 3
src/components/           Nav, Footer, Brand, Button, Page, WaitlistForm
src/app/                  routes
src/app/embed/[slug]/     the widget
src/app/embed.js/         the one-line loader
```

## Working with Claude Code

Open the folder and start with something like:

> Port docs/mockups/placements.html into src/app/placements/page.tsx, following CLAUDE.md. Reuse the shared components and the catalog. Keep the schematic SVGs.

Each page in `src/app/` that still shows a yellow "Not yet ported" note in dev is waiting for exactly that.
