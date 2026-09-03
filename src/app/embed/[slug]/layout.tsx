import type { ReactNode } from "react";

// The embed has no site chrome and a transparent background so it sits naturally on the host page.
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <div className="bg-transparent p-2">{children}</div>;
}
