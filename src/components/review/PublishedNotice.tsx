import Link from "next/link";
import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { Launch } from "@/components/dashboard/icons";
import { Card } from "@/components/DashboardShell";

/**
 * The moment after publishing: the address, the way to share it, and where things happen next.
 * Drawn once, when the workspace is opened with `?published=1` straight from the review stage.
 */
export function PublishedNotice({ url }: { url: string }) {
  return (
    <Card className="mb-8 border-accent-line">
      <p className="text-[14px] text-muted">Published</p>
      <h2 className="heading text-[18px] text-ink">The fundraiser is public.</h2>
      <p className="max-w-[62ch] text-[15px] text-muted">
        It is at <a href={url} className="break-all text-accent-ink underline decoration-1 underline-offset-4">{url}</a> and on the fundraisers page.
        Sponsors, their materials and delivery are managed here from now on.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={url} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-field-line px-3.5 text-[14px] font-medium text-ink no-underline transition-colors hover:border-ink">
          View the page <Launch size={14} aria-hidden="true" />
        </Link>
        <ShareFundraiser url={url} />
      </div>
    </Card>
  );
}
