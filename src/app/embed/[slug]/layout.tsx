import type { ReactNode } from "react";

// The embed has no site chrome. `data-embed` makes the document itself transparent (see globals.css),
// so the widget card sits on the host page rather than in a dark rectangle of its own.
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div data-embed className="bg-transparent p-2">
      {children}
    </div>
  );
}
