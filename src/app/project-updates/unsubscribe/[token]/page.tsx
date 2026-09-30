import { notFound } from "next/navigation";
import { unsubscribeProjectFollow } from "@/app/actions/project-follows";
import { UUID } from "@/lib/project-updates";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme } from "@/components/Theme";

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  return <Theme name="blue"><Nav /><main id="main" className="mx-auto w-full max-w-[700px] flex-1 px-7 py-16">
    <h1 className="heading text-[clamp(32px,5vw,50px)]">Stop project update emails</h1>
    <p className="mt-5 text-[16px]">This turns off email for this project’s updates. It does not change other email preferences.</p>
    <form action={unsubscribeProjectFollow} className="mt-7"><input type="hidden" name="token" value={token} /><button className="rounded border border-current px-5 py-3 text-[15px]">Unsubscribe</button></form>
  </main><Footer /></Theme>;
}
