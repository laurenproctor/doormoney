import { ShareFundraiser } from "@/components/dashboard/ShareFundraiser";
import { ButtonLink } from "@/components/Button";
import { Launch } from "@/components/dashboard/icons";
import { Card } from "@/components/desk";

/**
 * The moment after publishing: the address, the way to share it, and where things happen next.
 * Drawn once, when the workspace is opened with `?published=1` straight from the review stage.
 */
export function PublishedNotice({ url }: { url: string }) {
  return (
    <Card title="The fundraiser is public." subtitle="Published" className="mb-5 border-accent-line">
      <p className="max-w-[62ch] text-[15px] leading-[1.6] text-muted">
        It is at <a href={url} className="break-all text-accent-ink underline decoration-1 underline-offset-4">{url}</a> and on the fundraisers page.
        Sponsors, their materials and delivery are managed here from now on.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={url} register="desk" variant="outline">
          View the page <Launch size={14} aria-hidden="true" />
        </ButtonLink>
        <ShareFundraiser url={url} />
      </div>
    </Card>
  );
}
