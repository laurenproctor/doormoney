import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { SignUpForm } from "@/components/SignUpForm";
import { Lines } from "@/components/Brand";
import { safeNext } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Open an account" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);

  return (
    <Page
      theme="blue"
      current="/login"
      eyebrow="For musicians"
      title="Open an"
      accent="account"
      headline="md"
      intro={
        <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">
          One username, one password. The username is the board address too, so pick the one the act should be known by.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[40px] px-7 pb-[90px] md:grid-cols-[1fr_1fr]">
        <div className="edge bg-panel p-7">
          <SignUpForm next={next} siteUrl={SITE.url.replace(/^https?:\/\//, "")} />
        </div>
        <div>
          <h2 className="caps mb-3 text-[15px] text-accent-ink">What the username does</h2>
          <Lines
            lines={[
              "It signs the act in, with the password.",
              "It becomes the board address: one word, on posters, in a bio, in a post.",
              "It is taken for good once claimed, so pick the act's name over a nickname.",
              "Placements, prices and the run all come later, from the dashboard.",
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
