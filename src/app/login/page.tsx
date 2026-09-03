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
      current="/login"
      tape="For acts already listed"
      title="Sign"
      accent="in"
      intro={
        <p className="typewriter text-[clamp(18px,2.5vw,25px)]">Acts sign in with an email link. No passwords to remember.</p>
      }
    >
      <div className="mx-auto grid max-w-[1020px] gap-[40px] px-7 pb-[90px] md:grid-cols-[1fr_1fr]">
        <div className="hard-border bg-white p-7 shadow-[7px_7px_0_var(--black)]">
          <LoginForm next={next} linkError={linkError} />
        </div>
        <div>
          <h3 className="typewriter mb-3 text-[15px] text-red">How it goes</h3>
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
