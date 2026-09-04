import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { NewPasswordForm } from "@/components/PasswordForms";
import { Lines } from "@/components/Brand";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/** Where the reset link lands, once the callback has turned it into a session. */
export default async function ResetPage() {
  const user = await currentUser();

  return (
    <Page
      theme="blue"
      current="/login"
      eyebrow="For acts already listed"
      title="Set a new"
      accent="password"
      headline="md"
      intro={
        <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">
          {user
            ? "This is the last step. The new password replaces the old one everywhere."
            : "That link has expired or was already used. A fresh one takes a minute."}
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[40px] px-7 pb-[90px] md:grid-cols-[1fr_1fr]">
        <div className="edge bg-panel p-7">
          {user ? (
            <NewPasswordForm />
          ) : (
            <p className="text-[15px]">
              <Link href="/forgot" className="text-accent-ink underline underline-offset-4">Ask for a fresh reset link</Link>.
            </p>
          )}
        </div>
        <div>
          <h2 className="caps mb-3 text-[15px] text-accent-ink">Worth knowing</h2>
          <Lines
            lines={[
              "At least 10 characters. Longer beats clever.",
              "The username stays as it is. Only the password changes.",
              "The email link still works as a way in, password or no password.",
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
