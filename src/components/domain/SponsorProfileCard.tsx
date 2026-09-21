import type { SponsorView } from "@/lib/domain";
import { CategoryBadge } from "./CategoryBadge";

const initials = (name: string) => {
  const parts = name.split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
};

/**
 * A patron or sponsor, as they chose to appear: a person or an organization, supporting any
 * category. Never an amount, an email address or a payment identity: the view carries none.
 */
export function SponsorProfileCard({ sponsor }: { sponsor: SponsorView }) {
  const s = sponsor;
  const name = s.href ? <a href={s.href} className="underline decoration-1 underline-offset-4 hover:text-accent-ink">{s.displayName}</a> : s.displayName;
  return (
    <article className="edge grid grid-cols-[64px_1fr] items-start gap-5 bg-panel p-5">
      {s.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photoUrl} alt={s.displayName} width={64} height={64} className="h-[64px] w-[64px] rounded-full object-cover" />
      ) : (
        <div aria-hidden="true" className="heading flex h-[64px] w-[64px] items-center justify-center rounded-full border border-accent/70 text-[22px] leading-none text-accent-ink">
          {initials(s.displayName)}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="heading break-words text-[20px] leading-[1.15]">{name}</h3>
        <p className="caps mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
          {s.username && <span className="break-all text-accent-ink">@{s.username}</span>}
          {s.kindLabel && <span>{s.kindLabel}</span>}
          {s.location && <span>{s.location}</span>}
        </p>
        {s.bio && <p className="mt-3 max-w-[54ch] text-[15px] leading-[1.6]">{s.bio}</p>}
        {s.categories.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-2">
            {s.categories.map((c) => (
              <CategoryBadge key={c.key} category={c} />
            ))}
          </p>
        )}
        {s.links.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[14.5px]">
            {s.links.map((l) => (
              <a key={l.url} href={l.url} rel="nofollow noopener noreferrer ugc" target="_blank" className="break-all text-accent-ink underline decoration-1 underline-offset-4">
                {l.label}
              </a>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
