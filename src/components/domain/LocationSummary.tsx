import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { locationText, type LocationView } from "@/lib/domain";

/**
 * Where something is, from what was said and nothing else. Renders nothing at all when nothing was
 * said: no city is a fact about an organizer, not a gap to fill, and online is a place.
 */
export function LocationSummary({ locations, activityMode, className = "" }: { locations: (LocationView | null | undefined)[]; activityMode?: string | null; className?: string }) {
  const places = locations.map(locationText).filter((p): p is string => Boolean(p));
  const mode = activityMode ? (ACTIVITY_MODE_LABEL[activityMode] ?? null) : null;
  if (places.length === 0 && !mode) return null;
  return (
    <p className={`caps flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] leading-[2] ${className}`}>
      {mode && <span className="text-accent-ink">{mode}</span>}
      {places.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </p>
  );
}
