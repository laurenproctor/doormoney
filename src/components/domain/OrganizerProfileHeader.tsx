import { Eyebrow } from "@/components/Brand";
import { categoryWords } from "@/lib/category-words";
import type { Category, OrganizerView } from "@/lib/domain";
import { LocationSummary } from "./LocationSummary";

/**
 * Who is raising the money. An organizer has no category of their own, so the eyebrow is what they
 * said they are, and only borrows a category's noun when every fundraiser on the page agrees on one.
 */
export function OrganizerProfileHeader({ organizer, categories = [] }: { organizer: OrganizerView; categories?: Category[] }) {
  const keys = [...new Set(categories.map((c) => c.key))];
  const eyebrow = organizer.kindLabel ?? (keys.length === 1 ? categoryWords(keys[0]).organizerTitle : "Organizer");
  return (
    <header>
      <Eyebrow className="mb-7">{eyebrow}</Eyebrow>
      <h1 className={`display max-w-[14ch] leading-[0.98] ${organizer.name.length > 14 ? "text-[clamp(40px,7vw,92px)]" : "text-[clamp(48px,8.4vw,108px)]"}`}>{organizer.name}</h1>
      <LocationSummary locations={[organizer.location]} className="mt-6" />
      {organizer.bio && <p className="mt-6 max-w-[58ch] border-l border-accent/60 pl-5 text-[clamp(16px,1.9vw,18px)] leading-[1.55]">{organizer.bio}</p>}
      {organizer.links.length > 0 && (
        <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14.5px]">
          {organizer.links.map((l) => (
            <a key={l.url} href={l.url} rel="noopener noreferrer nofollow ugc" target="_blank" aria-label={`${l.label}, opens in a new tab`} className="break-all text-accent-ink underline decoration-1 underline-offset-4">
              {l.label}
            </a>
          ))}
        </p>
      )}
    </header>
  );
}
