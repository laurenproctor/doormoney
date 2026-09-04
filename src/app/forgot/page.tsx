import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { ForgotForm } from "@/components/PasswordForms";
import { Lines } from "@/components/Brand";

export const metadata: Metadata = { title: "Forgotten password" };

export default function ForgotPage() {
  return (
    <Page
      theme="blue"
      current="/login"
      eyebrow="For acts already listed"
      title="Reset the"
      accent="password"
      headline="md"
      intro={
        <p className="text-[clamp(18px,2.2vw,22px)] leading-[1.5]">
          Door Money sends a link to the email on the account. It sets a new password and signs the act back in.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1120px] gap-[40px] px-7 pb-[90px] md:grid-cols-[1fr_1fr]">
        <div className="edge bg-panel p-7">
          <ForgotForm />
        </div>
        <div>
          <h2 className="caps mb-3 text-[15px] text-accent-ink">How it goes</h2>
          <Lines
            lines={[
              "Enter the username, or the email the act listed with.",
              "A link arrives. It works once and expires in an hour.",
              "The link opens a page to set the new password.",
              "Nothing else changes: the board, the runs and the payouts stay as they are.",
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
