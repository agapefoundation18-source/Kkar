import {
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Globe2,
  Home,
  LocateFixed,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessageCircleMore,
  Navigation,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import RiderLandingPage from "@/pages/RiderLandingPage";
import { normalizeE164PhoneNumber } from "@/lib/phoneAuth";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import RiderAccount from "@/pages/RiderAccount";
import { RiderActivity, type RideHistoryItem } from "@/components/ride/RiderActivity";
import { RiderBooking } from "@/components/ride/RiderBooking";

type AuthMode = "signup" | "signin";
type ActivityTab = "home" | "activity" | "account";

const rideWhen = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const onboardingSlides = [
  {
    title: "Ride when you need it",
    description: "Book trusted rides in minutes with live driver tracking and transparent fares.",
    icon: MapPin,
  },
  {
    title: "Local prices, zero guesswork",
    description: "Know how much your trip costs before you confirm. Clear pricing and safe payments included.",
    icon: ShieldCheck,
  },
  {
    title: "Drivers that understand your city",
    description: "Choose from verified Kkary drivers familiar with the routes, neighborhoods, and traffic patterns around you.",
    icon: Bike,
  },
  {
    title: "Move faster and safer",
    description: "Share trip details, get real-time updates, and rely on a support system that keeps each ride smooth.",
    icon: Smartphone,
  },
];

const supportIssues = [
  "I was charged more than expected",
  "I was charged twice",
  "I lost an item",
  "My ride happened without me / the driver didn’t meet expectations",
  "I was wrongly charged a wait time fee",
  "I have a question about tips",
  "Something else",
];

const BOTPRESS_INJECT_URL = "https://cdn.botpress.cloud/webchat/v3.7/inject.js";
const BOTPRESS_CONFIG_URL = "https://files.bpcontent.cloud/2026/10/06/23/20261006231559-QJGKLDLM.js";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4b942] text-[#102a2c] shadow-[0_8px_24px_rgba(244,185,66,0.28)]">
        <Navigation className="h-5 w-5 fill-current" strokeWidth={2.5} />
      </div>
      <div>
        <div className="text-[18px] font-black tracking-[-0.07em] text-white">Kkary</div>
        <div className="-mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9fcfc2]">Move local</div>
      </div>
    </div>
  );
}

function AppCard({ kind }: { kind: "rider" | "driver" }) {
  const rider = kind === "rider";
  return (
    <div className={`relative overflow-hidden rounded-[28px] p-6 ${rider ? "bg-[#e8f5ef]" : "bg-[#fff3d5]"}`}>
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/40" />
      <div className="relative">
        <div className="mb-5 flex items-center justify-between">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${rider ? "bg-[#cdebdc] text-[#2e7e6f]" : "bg-[#ffe1a0] text-[#aa7413]"}`}>
            {rider ? <MapPin className="h-6 w-6" /> : <Bike className="h-6 w-6" />}
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${rider ? "bg-white/70 text-[#4a8f81]" : "bg-white/70 text-[#a27727]"}`}>
            {rider ? "For riders" : "For drivers"}
          </span>
        </div>
        <h3 className="text-2xl font-black tracking-[-0.05em] text-[#153b3b]">{rider ? "Your way, your time." : "Earn on your terms."}</h3>
        <p className="mt-2 max-w-[290px] text-sm leading-relaxed text-[#64807a]">
          {rider
            ? "Book trusted local rides, follow your driver live, and pay with a protected wallet."
            : "Choose your default L.G.A., complete verification once, and find trips that work for you."}
        </p>
        <div className="mt-6 grid gap-2 text-xs font-bold text-[#48746d]">
          {(rider
            ? ["Live driver tracking", "Clear fare before you ride", "Protected Kkary wallet"]
            : ["Onboarding with document review", "Online/offline control", "Transparent earnings & payouts"]
          ).map((item) => (
            <div key={item} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[#4ea88e]" /> {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OnboardingView({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(0);
  const current = onboardingSlides[active];
  const Icon = current.icon;
  const isLast = active === onboardingSlides.length - 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f2d30] px-4 py-8 text-white">
      <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#13393c]/85 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-5 flex justify-end">
          <button onClick={onDone} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#c4e3dc]">
            Skip
          </button>
        </div>

        <div className="flex h-52 items-center justify-center rounded-[24px] bg-[#e7f5ef] text-[#12393a]">
          <div className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-[#f4b942] shadow-[0_14px_40px_rgba(244,185,66,0.28)]">
            <Icon className="h-12 w-12" />
          </div>
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-3xl font-black tracking-[-0.06em]">{current.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#bdd8d3]">{current.description}</p>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {onboardingSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setActive(index)}
              className={`h-2.5 rounded-full transition-all ${index === active ? "w-10 bg-[#f4b942]" : "w-2.5 bg-white/25"}`}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={() => setActive((value) => Math.max(0, value - 1))}
            className={`rounded-xl px-4 py-3 text-sm font-bold ${active === 0 ? "pointer-events-none opacity-40" : "bg-white/8 text-white"}`}
          >
            Back
          </button>

          <button
            onClick={() => {
              if (!isLast) {
                setActive((value) => value + 1);
                return;
              }
              onDone();
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#f4b942] px-5 py-3 text-sm font-black text-[#173a3d]"
          >
            {isLast ? "Start using KKar" : "Next"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthExperience({
  onAuthenticated,
  onSignupVerificationPending,
  initialMode = "signup",
}: {
  onAuthenticated: () => void;
  onSignupVerificationPending: (pending: boolean) => void;
  initialMode?: AuthMode;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [locationState, setLocationState] = useState<"unknown" | "granted" | "denied">("unknown");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (authMode !== "signup" || locationState !== "unknown" || !navigator.permissions) return;
    void navigator.permissions.query({ name: "geolocation" })
      .then(permission => {
        if (permission.state === "granted") setLocationState("granted");
        else if (permission.state === "denied") setLocationState("denied");
      })
      .catch(() => {});
  }, [authMode, locationState]);

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "phone") {
      setIsPhoneVerified(false);
      setPhoneOtpSent(false);
      setPhoneOtp("");
    }
  };

  const requestLocationPermission = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device does not support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationState("granted");
        setMessage("Location permission enabled.");
      },
      () => {
        setLocationState("denied");
        setError("Location permission is required to use Kkary.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const resendPhoneCode = async () => {
    const phone = normalizeE164PhoneNumber(form.phone);
    if (!phone) {
      setError("Enter a valid phone number before requesting another code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: "sms", phone });
      if (resendError) throw resendError;
      setPhoneOtp("");
      setMessage(`A new verification code was sent to ${phone}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resend the verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPhoneCode = async (code: string) => {
    if (!/^\d{6}$/.test(code)) return;
    const phone = normalizeE164PhoneNumber(form.phone);
    if (!phone) {
      setError("Enter a valid phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    onSignupVerificationPending(true);
    let phoneVerified = false;
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
      if (verifyError) throw verifyError;
      phoneVerified = true;
      setIsPhoneVerified(true);
      const { error: profileError } = await supabase.auth.updateUser({
        email: form.email.trim(),
        data: { full_name: form.name.trim(), phone, user_type: "rider" },
      });
      if (profileError) throw profileError;
      onAuthenticated();
    } catch (cause) {
      if (!phoneVerified) onSignupVerificationPending(false);
      setError(cause instanceof Error ? cause.message : "Phone verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    const phone = form.phone.trim() ? normalizeE164PhoneNumber(form.phone) : null;
    if (authMode === "signup" && form.phone.trim() && !phone) {
      setError("Enter a valid phone number in international format, such as +2348000000000.");
      return;
    }
    if (authMode === "signup" && (!form.name.trim() || !form.email.trim() || !form.password || !form.confirmPassword)) {
      setError("Complete all sign-up fields before creating your account.");
      return;
    }
    if (authMode === "signup" && (form.password.length < 8 || form.password !== form.confirmPassword)) {
      setError("Use a password of at least 8 characters and make sure both password fields match.");
      return;
    }
    if (!hasSupabaseConfig) {
      setError("Kkary sign-in is not configured in this environment. Add the Supabase project URL and anon key to .env.local.");
      return;
    }
    if (authMode === "signup" && locationState !== "granted") {
      setError("Enable device location permission to continue.");
      return;
    }
    setSubmitting(true);
    try {
      if (authMode === "signup" && !phoneOtpSent && phone) {
        const { error: signUpError } = await supabase.auth.signUp({
          phone,
          password: form.password,
          options: {
            data: {
              full_name: form.name.trim(),
              email: form.email.trim(),
              phone,
              user_type: "rider",
            },
          },
        });
        if (signUpError) throw signUpError;
        setPhoneOtp("");
        setPhoneOtpSent(true);
        setMessage(`We sent a verification code to ${phone}.`);
        return;
      }
      if (authMode === "signup" && !phone) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: { full_name: form.name.trim(), phone: null, user_type: "rider" },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Account created. Email confirmation is enabled for this Supabase project; disable it to enter without verification.");
          return;
        }
        onAuthenticated();
        return;
      }
      if (authMode === "signup") {
        if (!isPhoneVerified) {
          setError("Enter the SMS verification code to continue.");
          return;
        }
        const { error: updateError } = await supabase.auth.updateUser({
          email: form.email.trim(),
          data: { full_name: form.name.trim(), phone, user_type: "rider" },
        });
        if (updateError) throw updateError;
        onAuthenticated();
        return;
      }
      const identifier = form.email.trim() || form.phone.trim();
      if (!identifier || !form.password.trim()) {
        setError("Enter your email or phone number and password to sign in.");
        return;
      }
      const isEmail = identifier.includes("@");
      const signInPhone = isEmail ? null : normalizeE164PhoneNumber(identifier);
      if (!isEmail && !signInPhone) {
        setError("Enter a valid phone number in international format.");
        return;
      }
      const credentials = isEmail
        ? { email: identifier, password: form.password }
        : { phone: signInPhone!, password: form.password };
      const { error: signInError } = await supabase.auth.signInWithPassword(credentials);
      if (signInError) throw signInError;
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authMode === "signup" && phoneOtpSent && !isPhoneVerified) {
    const phone = normalizeE164PhoneNumber(form.phone) ?? form.phone;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d2d30] px-4 py-8 text-white">
        <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#13393c] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
          <h1 className="text-2xl font-black">Verify your phone number</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#bdd8d3]">We sent a verification code to <strong className="text-white">{phone}</strong>.</p>
          <input
            autoFocus
            value={phoneOtp}
            onChange={event => {
              const code = event.target.value.replace(/\D/g, "").slice(0, 6);
              setPhoneOtp(code);
              if (code.length === 6 && !submitting) void verifyPhoneCode(code);
            }}
            className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center text-2xl tracking-[0.5em] text-white outline-none"
            placeholder="••••••"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit verification code"
          />
          {submitting && <p className="mt-3 text-center text-sm text-[#bdd8d3]">Verifying code…</p>}
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
          {message && <p className="mt-3 text-sm text-[#a9f0d5]">{message}</p>}
          <button onClick={() => void resendPhoneCode()} disabled={submitting} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
            Resend verification code
          </button>
          <button onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); setError(null); setMessage(null); }} className="mt-3 w-full text-sm text-[#bdd8d3]">
            Change phone number
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d2d30] px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-[30px] border border-white/10 bg-[#13393c] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4b942] text-[#102a2c]">
              <Navigation className="h-5 w-5 fill-current" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-xl font-black tracking-[-0.05em]">Kkary</div>
              <div className="text-[9px] uppercase tracking-[0.15em] text-[#9bc3b8]">Better local rides</div>
            </div>
          </div>
          <button
            onClick={async () => {
              if (isPhoneVerified) {
                const { error: signOutError } = await supabase.auth.signOut();
                if (signOutError) {
                  setError(signOutError.message);
                  return;
                }
                onSignupVerificationPending(false);
              }
              setAuthMode((current) => (current === "signup" ? "signin" : "signup"));
              setIsPhoneVerified(false);
              setPhoneOtpSent(false);
              setPhoneOtp("");
              setError(null);
              setMessage(null);
            }}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#d4f0ea]"
          >
            {authMode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </div>

        {authMode === "signup" && <div className="mb-5 rounded-2xl bg-[#1b4749] p-4">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#c5fbef]">
            <LocateFixed className="h-4 w-4" />
            Device permissions
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="text-sm text-[#d4efe8]">Location access</span>
            <button
              onClick={requestLocationPermission}
              className="rounded-full border border-[#f4b942]/50 bg-[#f4b942] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#11393b]"
            >
              {locationState === "granted" ? "Enabled" : "Enable"}
            </button>
          </div>
        </div>}

        <div className="space-y-3">
          {authMode === "signup" && (
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Name</label>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
                  <User className="h-4 w-4 text-[#7ab7a7]" />
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    disabled={phoneOtpSent}
                    className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                    placeholder="Your full name"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Email</label>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
                  <Mail className="h-4 w-4 text-[#7ab7a7]" />
                  <input
                    value={form.email}
                    onChange={(event) => updateForm("email", event.target.value)}
                    disabled={phoneOtpSent}
                    className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                    placeholder="name@email.com"
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Phone number (optional)</label>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
                  <Phone className="h-4 w-4 text-[#7ab7a7]" />
                  <input
                    value={form.phone}
                    onChange={(event) => updateForm("phone", event.target.value)}
                    disabled={phoneOtpSent}
                    className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                    placeholder="Optional — +234 800 000 0000"
                    type="tel"
                  />
                </div>
                {isPhoneVerified && <div className="mt-2 text-xs font-medium text-[#a9f0d5]">Verified</div>}
              </div>
            </div>
          )}

          {authMode === "signin" && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Email or phone</label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
                <Mail className="h-4 w-4 text-[#7ab7a7]" />
                <input
                  value={form.email || form.phone}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.includes("@") || value.includes(".")) {
                      updateForm("email", value);
                      updateForm("phone", "");
                    } else {
                      updateForm("phone", value);
                      updateForm("email", "");
                    }
                  }}
                  className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                  placeholder="name@email.com or +234..."
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Password</label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
              <Lock className="h-4 w-4 text-[#7ab7a7]" />
              <input
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
                disabled={phoneOtpSent}
                className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                placeholder="********"
                type="password"
              />
            </div>
          </div>

          {authMode === "signup" && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[#b8d6cf]">Confirm password</label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
                <Lock className="h-4 w-4 text-[#7ab7a7]" />
                <input
                  value={form.confirmPassword}
                  onChange={(event) => updateForm("confirmPassword", event.target.value)}
                  disabled={phoneOtpSent}
                  className="w-full bg-transparent py-3 text-sm text-white placeholder:text-[#8dbab2] outline-none"
                  placeholder="Repeat password"
                  type="password"
                />
              </div>
            </div>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>}
        {message && <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 w-full rounded-2xl bg-[#f4b942] px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#12393a] transition hover:bg-[#f6c967] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Please wait..." : authMode === "signup" ? isPhoneVerified ? "Finish account setup" : "Create account" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function RiderDashboard({ user, onSignedOut }: { user: SupabaseUser; onSignedOut: () => void }) {
  const [activeTab, setActiveTab] = useState<ActivityTab>("home");
  const [selectedRide, setSelectedRide] = useState<RideHistoryItem | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportIssue, setSupportIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!helpOpen) return;

    const injectScript = (src: string, id: string, defer = false) => {
      const existing = document.getElementById(id);
      if (existing) return;
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      if (defer) script.defer = true;
      document.body.appendChild(script);
    };

    injectScript(BOTPRESS_INJECT_URL, "kkar-chatbot-inject");
    injectScript(BOTPRESS_CONFIG_URL, "kkar-chatbot-config", true);
  }, [helpOpen]);

  const openSupportChat = (issue: string) => {
    setSupportIssue(issue);
    setHelpOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f5faf8] text-[#10353a]">
      <div className="mx-auto max-w-md pb-24 pt-4">
        {activeTab === "account" ? (
          <RiderAccount
            user={user}
            onSignedOut={onSignedOut}
          />
        ) : (
          <>
        <header className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4b942] text-[#10353a] shadow-[0_14px_30px_rgba(244,185,66,0.22)]">
                <Navigation className="h-5 w-5 fill-current" strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6d9c93]">Good evening</div>
                <div className="text-xl font-black tracking-[-0.05em]">Kkary</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#dfeceb] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#3a6c66]">
              <Zap className="h-3.5 w-3.5 text-[#f4b942]" />
              Express
            </div>
          </div>
        </header>

        {activeTab === "home" && (
          <RiderBooking />
        )}

        {activeTab === "activity" && (
          <RiderActivity onGetHelp={ride => { setSelectedRide(ride); setHelpOpen(true); }} />
        )}

        {helpOpen && (
          <div className="fixed inset-0 z-40 flex items-end bg-[#0d1f22]/35 p-3 backdrop-blur-[2px]">
            <div className="w-full rounded-[28px] bg-white p-4 shadow-[0_30px_100px_rgba(0,0,0,0.25)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-black tracking-[-0.04em] text-[#12393a]">Help with this ride</div>
                <button onClick={() => setHelpOpen(false)} className="rounded-full border border-[#dfeceb] p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedRide && (
                <div className="rounded-2xl bg-[#eef8f5] p-4">
                  <div className="text-lg font-black text-[#12393a]">{selectedRide.dropoff_address}</div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[#5c7975]">
                    <span>{rideWhen(selectedRide.created_at)}</span>
                    <span>•</span>
                    <span>₦{Number(selectedRide.estimated_fare).toLocaleString("en-NG")}</span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#234d4e]">
                    <Bike className="h-3.5 w-3.5 text-[#f4b942]" />
                    {selectedRide.driver?.name || `Kkary ${selectedRide.vehicle_type}`}
                  </div>
                </div>
              )}

              <div className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-[#5f928b]">Select an issue</div>
              <div className="mt-2 space-y-2">
                {supportIssues.map((issue) => (
                  <button
                    key={issue}
                    onClick={() => openSupportChat(issue)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e4efed] bg-[#f8fbfa] px-3 py-3 text-left text-sm font-semibold text-[#21494a]"
                  >
                    <span>{issue}</span>
                    <ChevronRight className="h-4 w-4 text-[#5b8a84]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {supportIssue && (
          <div className="fixed inset-x-0 bottom-20 z-50 mx-auto w-[calc(100%-2rem)] max-w-md rounded-[20px] bg-[#12393a] p-3 text-white shadow-[0_25px_80px_rgba(18,57,58,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black">
                <MessageCircleMore className="h-4 w-4 text-[#f4b942]" />
                Customer support
              </div>
              <button onClick={() => setSupportIssue(null)} className="text-xs uppercase tracking-[0.14em] text-[#c7f2e7]">
                Close
              </button>
            </div>
            <div className="mt-2 text-xs text-[#d1ebdf]">Issue: {supportIssue}</div>
            <button
              onClick={() => {
                const chatWindow = window.open(BOTPRESS_INJECT_URL, "_blank", "noopener,noreferrer");
                if (chatWindow) {
                  chatWindow.opener = null;
                }
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#f4b942] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#12393a]"
            >
              Open support chat
            </button>
          </div>
        )}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-[#dfeceb] bg-[#f8fbfa]/95 px-4 py-3 backdrop-blur-lg">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${activeTab === "home" ? "bg-[#12393a] text-white" : "bg-white text-[#315b5a]"}`}
          >
            <Home className="h-4 w-4" />
            Home
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${activeTab === "activity" ? "bg-[#12393a] text-white" : "bg-white text-[#315b5a]"}`}
          >
            <Clock3 className="h-4 w-4" />
            Activity
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${activeTab === "account" ? "bg-[#12393a] text-white" : "bg-white text-[#315b5a]"}`}
          >
            <UserRound className="h-4 w-4" />
            Account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RiderExperience() {
  const { canInstall, isInstalled, installApp } = usePwaInstall();
  const [menuOpen, setMenuOpen] = useState(false);
  const isStandaloneApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  }, []);
  const requestedAuthMode = new URLSearchParams(window.location.search).get("mode");
  const isWebAuthFlow = requestedAuthMode === "signin" || requestedAuthMode === "signup" || requestedAuthMode === "app";
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [signupVerificationPending, setSignupVerificationPending] = useState(false);
  const [returningFromLogout, setReturningFromLogout] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setHasSeenOnboarding(localStorage.getItem("kkar-onboarding-seen") === "true");

    let mounted = true;
    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) setSessionError(error.message);
      setSession(data.session);
      setSessionReady(true);
    };
    void syncSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      setSessionReady(true);
      if (event === "SIGNED_OUT") {
        setSignupVerificationPending(false);
        setReturningFromLogout(true);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!isStandaloneApp && !isWebAuthFlow) return <RiderLandingPage />;

  if (!sessionReady) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0d2d30] text-sm font-semibold text-white">Restoring your Kkary session…</div>;
  }

  if (sessionError && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d2d30] px-6 text-center text-white">
        <p>Unable to restore your session: {sessionError}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-[#f4b942] px-5 py-3 font-bold text-[#153a3a]">Try again</button>
      </div>
    );
  }

  if ((isStandaloneApp || isWebAuthFlow) && session && !signupVerificationPending) {
    return (
      <RiderDashboard
        user={session.user}
        onSignedOut={() => {
          setSession(null);
          setReturningFromLogout(true);
        }}
      />
    );
  }

  if ((isStandaloneApp || isWebAuthFlow) && !session && !signupVerificationPending && !hasSeenOnboarding && !requestedAuthMode) {
    return <OnboardingView onDone={() => { localStorage.setItem("kkar-onboarding-seen", "true"); setHasSeenOnboarding(true); }} />;
  }

  if ((isStandaloneApp || isWebAuthFlow) && (!session || signupVerificationPending)) {
    return (
      <AuthExperience
        initialMode={returningFromLogout || requestedAuthMode === "signin" ? "signin" : "signup"}
        onSignupVerificationPending={setSignupVerificationPending}
        onAuthenticated={() => {
          void supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setSignupVerificationPending(false);
            if (data.session) setReturningFromLogout(false);
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f6fbf8] pb-20 text-[#183b3b]">
      {canInstall && !isInstalled && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-[#113a3b]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:hidden">
          <button onClick={installApp} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f4b942] px-4 py-3.5 text-sm font-black text-[#153a3a]">
            <Download className="h-4 w-4" /> Download Rider App <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <section className="relative bg-[#113a3b]">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_12%_18%,#5ca58f_1px,transparent_1px),radial-gradient(circle_at_80%_65%,#f4b942_1px,transparent_1px)] [background-size:36px_36px,52px_52px]" />
        <header className="relative mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#b7d5d0] md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#apps" className="transition-colors hover:text-white">Apps</a>
            <a href="#safety" className="transition-colors hover:text-white">Safety</a>
            <a href="https://kkarydriver.aevonindustries.site/" className="transition-colors hover:text-white">Become a Kkary Driver</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {canInstall && !isInstalled && (
              <button onClick={installApp} className="rounded-xl bg-[#f4b942] px-4 py-2.5 text-xs font-black text-[#153a3a] hover:bg-[#e8b139]">
                Download Rider App <Download className="ml-2 inline h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white md:hidden">
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </header>

        {menuOpen && (
          <div className="relative border-t border-white/10 bg-[#173f40] p-5 md:hidden">
            <div className="grid gap-3 text-sm font-bold text-[#c1ddd7]">
              <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
              <a href="#apps" onClick={() => setMenuOpen(false)}>Apps</a>
              <a href="#safety" onClick={() => setMenuOpen(false)}>Safety</a>
              <a href="https://kkarydriver.aevonindustries.site/" onClick={() => setMenuOpen(false)}>Become a Kkary Driver</a>
            </div>
          </div>
        )}

        <div className="relative mx-auto grid max-w-[1240px] gap-10 px-5 pb-20 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.17em] text-[#b8e0d4]">
              <Sparkles className="h-3.5 w-3.5 text-[#f4c24d]" /> Mobility for everyone
            </div>
            <h1 className="max-w-[650px] text-5xl font-black leading-[0.97] tracking-[-0.075em] text-white sm:text-6xl lg:text-[76px]">
              Move better.<br />
              <span className="text-[#f4c24d]">Move together.</span>
            </h1>
            <p className="mt-7 max-w-[520px] text-base leading-relaxed text-[#bad5d1] sm:text-lg">
              Kkary connects riders and trusted drivers across Akwa Ibom with clear fares, safer trips, and technology made for everyday movement.
            </p>
            <div className="mt-7 flex items-center gap-3 text-[11px] font-semibold text-[#9fc9c0]">
              <ShieldCheck className="h-4 w-4 text-[#62b193]" /> Secure payments · Verified drivers · Built for local routes
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[480px]">
            <div className="absolute -inset-8 rounded-[45px] bg-[#f4b942]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[38px] border border-white/15 bg-[#e2efe9] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.22)]">
              <div className="relative min-h-[420px] overflow-hidden rounded-[29px] bg-[#d1e5df]">
                <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(30deg,#8fb8ac_1px,transparent_1px),linear-gradient(120deg,#8fb8ac_1px,transparent_1px)] [background-size:70px_70px]" />
                <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
                  <div className="rounded-2xl bg-white/90 px-3 py-2 text-[10px] font-black text-[#346d65] shadow-lg">Live trip view</div>
                  <div className="rounded-xl bg-white/90 p-3 text-[#3d8f7e] shadow-lg"><Globe2 className="h-4 w-4" /></div>
                </div>
                <div className="absolute left-[26%] top-[36%] h-44 w-44 rounded-full border-2 border-dashed border-[#4e9d89]/55" />
                <div className="absolute left-[46%] top-[49%] h-4 w-4 rounded-full bg-[#f4b942] shadow-[0_0_0_7px_rgba(244,185,66,0.24)]" />
                <div className="absolute left-[25%] top-[35%] flex h-10 w-10 items-center justify-center rounded-2xl bg-[#113a3b] text-white shadow-lg"><Bike className="h-5 w-5" /></div>
                <div className="absolute bottom-5 left-5 right-5 rounded-3xl bg-[#113a3b]/95 p-5 text-white shadow-xl">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#a6d8cb]"><span className="h-2 w-2 rounded-full bg-[#54b391]" /> Driver on the way</div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <div className="text-xl font-black tracking-tight">7 min away</div>
                      <div className="mt-1 text-[11px] text-[#b8d7d2]">Your route is protected</div>
                    </div>
                    <div className="rounded-2xl bg-[#f4b942] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#123a3a]">₦6.8k</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="max-w-[670px]">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#5b978b]">How it works</div>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.07em] text-[#12393a] sm:text-5xl">From pickup to drop-off in a few taps.</h2>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[
            ["Tell us where you are", "Choose a pickup and destination, then match with a nearby Kkary driver."],
            ["Track in real time", "See the driver moving toward you and watch your ride progress in real time."],
            ["Pay and go", "Move securely with clear pricing, in-app progress, and support after the trip."],
          ].map(([title, body], index) => (
            <div key={title} className="rounded-[25px] border border-[#dfeceb] bg-white p-6 shadow-[0_10px_30px_rgba(25,73,69,0.04)]">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ecf7f1] text-[#2d7e70] text-lg font-black">0{index + 1}</div>
              <h3 className="text-xl font-black tracking-[-0.04em] text-[#234845]">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#7d9691]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="apps" className="bg-[#edf6f2]">
        <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
          <div className="max-w-[680px]">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#5b978b]">App experience</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.07em] text-[#12393a] sm:text-5xl">Built for riders and drivers.</h2>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <AppCard kind="rider" />
            <AppCard kind="driver" />
          </div>
        </div>
      </section>

      <section id="safety" className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#5b978b]">Kkary safety</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.07em] text-[#12393a]">A safer way to move around.</h2>
            <p className="mt-5 text-base leading-relaxed text-[#73897f]">From clear trip status to verified drivers and responsive support, every part of the Kkary experience is built to feel safer and more transparent.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Verified drivers", "Every trip is anchored around vetted drivers and clear pickup coordination."],
              ["Trip visibility", "Follow the ride from pickup to arrival with live route visibility."],
              ["Support on demand", "Need help after a ride? Reach the support flow directly from your activity screen."],
              ["Protected wallet", "Your payments remain transparent before and after each trip."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[24px] border border-[#dfeceb] bg-white p-5 shadow-[0_10px_30px_rgba(25,73,69,0.04)]">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf7f3] text-[#2d7e70]"><ShieldCheck className="h-4 w-4" /></div>
                <h3 className="text-lg font-black tracking-[-0.04em] text-[#234845]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#7d9691]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
