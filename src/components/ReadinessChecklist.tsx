import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { readiness, type ReadinessInput } from "@/lib/readiness";

/**
 * Where a draft stands, in six lines. The same rules publishRun uses, so a full checklist and a
 * refused publish cannot disagree. Payout setup is on the list and never in the way: a board can
 * open before Stripe is finished, and Door Money holds the money until it is.
 */
export function ReadinessChecklist({ input, previewHref }: { input: ReadinessInput; previewHref: string }) {
  const rows = readiness(input);
  const left = rows.filter((r) => !r.done && !r.optional && r.key !== "publish").length;
  const draft = input.run.status === "draft";

  return (
    <>
      <p className="mb-6 max-w-[60ch] text-[15px] text-muted">
        {!draft
          ? "The board is public. Everything below can still change while spots are open."
          : left === 0
            ? "Everything is in place. Look the board over, then publish it at the end of the spots."
            : `${left} ${left === 1 ? "thing is" : "things are"} still missing. The board stays private until they are done.`}
      </p>

      <ul className="mb-7 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[26px_1fr] items-start gap-4 py-4 sm:grid-cols-[26px_190px_1fr] sm:items-center">
            <span
              aria-hidden="true"
              className={`flex h-[26px] w-[26px] flex-none items-center justify-center border text-[16px] leading-none ${
                row.done ? "border-accent bg-accent text-on-accent" : row.optional ? "border-line text-muted" : "border-dashed border-line text-muted"
              }`}
            >
              {row.done ? "✓" : "–"}
            </span>
            <span className="min-w-0">
              <b className="block text-[15px] font-medium">{row.label}</b>
              <span className="caps block text-[14px] text-muted sm:hidden">{row.done ? "Done" : row.optional ? "Optional" : "Still to do"}</span>
            </span>
            <span className="col-start-2 min-w-0 text-[14.5px] leading-[1.5] text-muted sm:col-start-3">
              {row.note}
              {row.href && !row.done && (
                <>
                  {" "}
                  <Link href={row.href} className="text-accent-ink underline decoration-1 underline-offset-4">
                    Fix it
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <ButtonLink href={previewHref} variant={draft ? "solid" : "ghost"}>
          Preview the board
        </ButtonLink>
        <span className="max-w-[46ch] text-[14.5px] text-muted">
          {draft ? "The preview is the real board, private to this account until it is published." : "The same page the public sees."}
        </span>
      </div>
    </>
  );
}
