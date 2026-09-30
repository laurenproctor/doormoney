import Link from "next/link";
import type { LogItem } from "@/lib/project-updates";

export function ProjectUpdateLog({ items }: { items: LogItem[] }) {
  return <ol className="mt-8 divide-y divide-line border-y border-line">
    {items.map((item) => <li key={`${item.kind}-${item.id}`} className="py-7">
      <p className="caps text-[14px] text-muted">
        {item.project.title} · {item.kind === "cancellation" ? "Canceled" : "Project update"}
        {item.displayDate ? ` · ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.displayDate))}` : ""}
      </p>
      <h3 className="heading mt-3 text-[clamp(22px,3vw,30px)]"><Link className="underline underline-offset-4" href={item.href}>{item.title}</Link></h3>
      <p className="mt-3 max-w-[65ch] text-[16px] leading-[1.6] text-muted">{item.excerpt}</p>
    </li>)}
  </ol>;
}
