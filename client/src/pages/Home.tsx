import { Download, MapPin, ShieldCheck } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { BrandLogo } from "@/components/BrandLogo";

const DRIVER_SITE = "https://kkarydriver.aevonindustries.site/";

export default function Home() {
  const { canInstall, isInstalled, installApp } = usePwaInstall();

  return (
    <main className="min-h-screen bg-[#f6fbf8] text-[#183b3b]">
      <section className="bg-[#113a3b] px-5 py-16 text-white md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
          <div>
            <a href="/" className="inline-flex items-center gap-3" aria-label="Kkary Rider home">
              <BrandLogo className="h-11 w-11 rounded-2xl" />
              <span className="text-xl font-black">Kkary Rider</span>
            </a>
            <p className="mt-10 text-xs font-black uppercase tracking-[0.18em] text-[#9dd1c3]">Local rides made easy</p>
            <h1 className="mt-3 max-w-xl text-5xl font-black leading-tight tracking-tight sm:text-6xl">
              Get there with Kkary.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[#bad5d1]">
              Request local rides, follow your driver live, and keep your trip details close at hand.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {canInstall && !isInstalled && (
                <button
                  type="button"
                  onClick={() => void installApp()}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#f4b942] px-5 py-3 text-sm font-black text-[#153a3a]"
                >
                  <Download className="h-4 w-4" />
                  Install Kkary Rider
                </button>
              )}
              <a
                href="/?mode=signin"
                className="inline-flex min-h-12 items-center rounded-xl border border-white/25 px-5 py-3 text-sm font-bold text-white"
              >
                Open Rider App
              </a>
            </div>
            <a href={DRIVER_SITE} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#f4c24d] underline-offset-4 hover:underline">
              Become a Kkary Driver
            </a>
          </div>

          <div className="rounded-[32px] bg-[#e2efe9] p-5 text-[#183b3b] shadow-2xl">
            <div className="rounded-[24px] bg-white p-7 sm:p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f4ed] text-[#398b79]">
                <MapPin className="h-7 w-7" />
              </div>
              <h2 className="mt-8 text-3xl font-black tracking-tight">Your ride, your way.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#64807a]">
                See your pickup and destination, get matched with an eligible nearby driver, and follow the trip.
              </p>
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-[#f6fbf8] p-4">
                <ShieldCheck className="h-5 w-5 text-[#4ea88e]" />
                <span className="text-sm font-bold">Verified drivers and clear trip details</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-12 sm:grid-cols-2">
        <a href="/?mode=signin" className="rounded-3xl border border-[#dfebe7] bg-white p-6">
          <h2 className="text-lg font-black">Rider App</h2>
          <p className="mt-2 text-sm text-[#64807a]">Install or open Kkary Rider on this site.</p>
        </a>
        <a href={DRIVER_SITE} target="_blank" rel="noopener noreferrer" className="rounded-3xl border border-[#dfebe7] bg-white p-6">
          <h2 className="text-lg font-black">Kkary Driver</h2>
          <p className="mt-2 text-sm text-[#64807a]">Drivers have a separate app and installer.</p>
        </a>
      </section>
    </main>
  );
}
