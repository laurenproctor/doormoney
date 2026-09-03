import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Stamp, Tape } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";

export default function NotFound() {
  return (
    <>
      <Nav />
      <div className="relative mx-auto w-full max-w-[1020px] flex-1 px-7 pb-[90px] pt-[88px]">
        <Tape className="mb-[30px]">Nothing at this address</Tape>
        <h1 className="poster text-[clamp(52px,9vw,110px)] leading-[0.9]">
          No board <span className="text-red">here</span>
        </h1>
        <p className="mt-6 max-w-[48ch] text-[17px]">
          The page moved, the act changed its address, or the link had a typo. The live boards are one click away.
        </p>
        <div className="mt-[34px] flex flex-wrap gap-[22px]">
          <ButtonLink href="/auctions">Live auctions</ButtonLink>
          <ButtonLink href="/" variant="ghost">Home</ButtonLink>
        </div>
        <Stamp className="absolute right-7 top-[88px] max-[860px]:hidden">NOT<br />FOUND</Stamp>
      </div>
      <Footer />
    </>
  );
}
