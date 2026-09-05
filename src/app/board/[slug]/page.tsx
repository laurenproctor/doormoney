import { permanentRedirect } from "next/navigation";
import { getBoard } from "@/lib/boards";
import { actPath, runPath } from "@/lib/urls";

/*
  The old address, kept forever.

  /board/<act> was the only board an act had. It is in sent emails, in widget snippets already
  pasted on musicians' own sites, on printed cards, and in Google. It now points at whichever run
  the act is raising for, and at the act's page when none is open.

  Nothing renders here. The redirect is permanent because the old address is never coming back.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LegacyBoardPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  // Stripe sends a patron back to the board with the session on the query string, so the query
  // has to survive the move or the "paid" notice is lost between the checkout and the board.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") query.set(k, v);
    else if (Array.isArray(v)) for (const one of v) query.append(k, one);
  }
  const tail = query.size ? `?${query}` : "";

  const board = await getBoard(slug);
  permanentRedirect(board?.run ? `${runPath(slug, board.run.slug)}${tail}` : `${actPath(slug)}${tail}`);
}
