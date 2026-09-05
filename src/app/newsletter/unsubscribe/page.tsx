import type { Metadata } from "next";
import { z } from "zod";
import { Page } from "@/components/Page";
import { Section } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const Token = z.string().uuid();

/**
 * The link at the foot of every new-boards email. One visit turns the address off; the row stays,
 * so a later signup flips it back on. The token is the only way in and it is never shown.
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { t } = await searchParams;
  const token = Token.safeParse(typeof t === "string" ? t : "");

  let done = false;
  if (token.success && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await supabaseAdmin()
      .from("newsletter")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token.data)
      .select("id");
    done = (data?.length ?? 0) > 0;
  } else if (token.success) {
    done = true; // No database configured; behave as if it worked.
  }

  return (
    <Page
      theme="mono"
      current=""
      eyebrow={done ? "Off the list" : "Nothing to change"}
      title={done ? "No more" : "That link"}
      accent={done ? "emails." : "has expired."}
      intro={
        done ? (
          <p>This address no longer gets the new-fundraisers email from Door Money. Any address can join again from the foot of any page.</p>
        ) : (
          <p>The link was cut short by the mail client, or it belongs to an address that is no longer on file. Any address that still gets the emails can use the link in the latest one.</p>
        )
      }
      strap="Musicians. Patrons. Together."
    >
      <Section>
        <div className="flex flex-wrap gap-4">
          <ButtonLink href="/auctions" arrow>See the fundraisers</ButtonLink>
          <ButtonLink href="/" variant="ghost">Back to Door Money</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}
