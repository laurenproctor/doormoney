import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { LoginForm } from "@/components/LoginForm";
import { Lines } from "@/components/Brand";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const linkError = sp.error === "link";

  return (
    <Page
      theme="blue"
      current="/login"
      eyebrow="For acts already listed"
      title="Sign"
      accent="in"
      intro={
        <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">Acts sign in with an email link. No passwords to remember.</p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[40px] px-7 pb-[90px] md:grid-cols-[1fr_1fr]">
        <div className="edge bg-panel p-7 ">
          <LoginForm next={next} linkError={linkError} />
        </div>
        <div>
          <h2 className="caps mb-3 text-[15px] text-accent-ink">How it goes</h2>
          <Lines
            lines={[
              "Enter the email the act listed with.",
              "Door Money sends a link. One tap signs the act in.",
              "New here? The same link opens a fresh account.",
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
