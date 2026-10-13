import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, Clock3, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

function getCountdown(launchAt: string | null) {
  const remaining = launchAt ? Math.max(0, new Date(launchAt).getTime() - Date.now()) : 0;
  const seconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

export default function LaunchComingSoon({ launchAt }: { launchAt: string | null }) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [countdown, setCountdown] = useState(() => getCountdown(launchAt));
  const joinWaitlist = trpc.operations.joinLaunchWaitlist.useMutation({
    onSuccess: () => {
      setJoined(true);
      setEmail("");
      toast.success("You’re on the Kkary launch list.");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const updateCountdown = () => setCountdown(getCountdown(launchAt));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [launchAt]);

  const units = [
    { label: "Days", value: countdown.days },
    { label: "Hours", value: countdown.hours },
    { label: "Minutes", value: countdown.minutes },
    { label: "Seconds", value: countdown.seconds },
  ];

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-[#113a3b] px-5 py-12 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_12%_18%,#5ca58f_1px,transparent_1px),radial-gradient(circle_at_80%_65%,#f4b942_1px,transparent_1px)] [background-size:36px_36px,52px_52px]" />
      <div className="relative mx-auto grid w-full max-w-[1080px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <section>
          <div className="mb-12 flex items-center gap-2.5">
            <BrandLogo className="h-11 w-11 rounded-2xl" />
            <div>
              <div className="text-[20px] font-black tracking-[-0.07em]">Kkary</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9fcfc2]">Move local</div>
            </div>
          </div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.17em] text-[#b8e0d4]">
            <Clock3 className="h-3.5 w-3.5 text-[#f4c24d]" /> Getting ready to launch
          </div>
          <h1 className="max-w-[640px] text-5xl font-black leading-[0.98] tracking-[-0.075em] sm:text-6xl lg:text-[72px]">
            A better way to move is <span className="text-[#f4c24d]">almost here.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-base leading-relaxed text-[#bad5d1] sm:text-lg">
            Kkary is getting ready to connect riders and trusted local drivers across Nigeria. Join the waitlist and we’ll let you know when we launch.
          </p>
          <div className="mt-9 grid max-w-[540px] grid-cols-4 gap-2.5 sm:gap-3">
            {units.map(unit => (
              <div key={unit.label} className="rounded-2xl border border-white/10 bg-white/[0.08] px-2 py-4 text-center sm:px-4 sm:py-5">
                <div className="text-3xl font-black tabular-nums tracking-tight text-white sm:text-4xl">{String(unit.value).padStart(2, "0")}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.13em] text-[#9fc9c0] sm:text-[10px]">{unit.label}</div>
              </div>
            ))}
          </div>
          {launchAt && (
            <p className="mt-4 text-xs text-[#9fc9c0]">
              Planned launch: {new Date(launchAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}
            </p>
          )}
        </section>

        <section className="rounded-[30px] border border-white/15 bg-white p-6 text-[#183b3b] shadow-[0_30px_90px_rgba(0,0,0,0.24)] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e6f4ed] text-[#348a75]">
            {joined ? <Check className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
          </div>
          {joined ? (
            <>
              <h2 className="mt-6 text-2xl font-black tracking-[-0.05em]">You’re on the list.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#69827d]">Thanks for your interest in Kkary. You’re on the launch list, and the Kkary team will share updates with waitlist members.</p>
              <Button onClick={() => setJoined(false)} variant="outline" className="mt-6 rounded-xl border-[#dcebe5]">Add another email</Button>
            </>
          ) : (
            <>
              <div className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-[#5e948b]">Be first to know</div>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]">Get launch updates.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#69827d]">Leave your email to join the launch list. The Kkary team will share launch updates with waitlist members.</p>
              <form onSubmit={event => { event.preventDefault(); joinWaitlist.mutate({ email }); }} className="mt-6 space-y-3">
                <label htmlFor="launch-email" className="sr-only">Email address</label>
                <Input
                  id="launch-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-12 rounded-xl border-[#dcebe5]"
                />
                <Button disabled={joinWaitlist.isPending} className="h-12 w-full rounded-xl bg-[#113a3b] text-white hover:bg-[#1e5555]">
                  {joinWaitlist.isPending ? "Joining…" : "Join the waitlist"} <ArrowRight className="ml-auto h-4 w-4" />
                </Button>
              </form>
              <p className="mt-4 text-[11px] leading-relaxed text-[#91a39f]">By joining, you agree to be contacted by email about the Kkary launch. You can ask to be removed from the list at any time.</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
