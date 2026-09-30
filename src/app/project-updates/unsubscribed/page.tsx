import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme } from "@/components/Theme";

export default function Unsubscribed() {
  return <Theme name="blue"><Nav /><main id="main" className="mx-auto w-full max-w-[700px] flex-1 px-7 py-16">
    <h1 className="heading text-[clamp(32px,5vw,50px)]">Update emails stopped</h1>
    <p className="mt-5 text-[16px]">You can follow a project again from its journal.</p>
    <Link href="/fundraisers" className="mt-6 inline-block underline underline-offset-4">Explore fundraisers</Link>
  </main><Footer /></Theme>;
}
