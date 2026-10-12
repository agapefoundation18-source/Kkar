import {
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Globe2,
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
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { normalizeE164PhoneNumber } from "@/lib/phoneAuth";
import { supabase } from "@/lib/supabase";
import { AppUpdateCard } from "@/components/AppUpdateCard";
import { DriverDispatch } from "@/components/ride/DriverDispatch";
import DriverLandingPage from "@/pages/DriverLandingPage";

type AuthMode = "signup" | "signin";
type ActivityTab = "home" | "earnings" | "account";

const onboardingSlides = [
  {
    title: "Earn flexibly on your schedule",
    description: "Work whenever you want. Accept rides that match your preferences and earn competitive rates.",
    icon: Smartphone,
  },
  {
    title: "Transparent earnings, real-time tracking",
    description: "See exactly how much you'll earn per ride. Track your daily, weekly, and monthly earnings.",
    icon: ShieldCheck,
  },
  {
    title: "Verified passengers, safe rides",
    description: "Every passenger is verified. Get trip details before accepting, and enjoy a supportive community.",
    icon: Bike,
  },
  {
    title: "Support when you need it",
    description: "24/7 driver support, insurance coverage, and help with any issues that come up.",
    icon: MapPin,
  },
];

export function DriverExperience() {
  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  }, []);
  const requestedAuthMode = new URLSearchParams(window.location.search).get("mode");
  const isWebAuthFlow = requestedAuthMode === "signin" || requestedAuthMode === "signup" || requestedAuthMode === "app";

  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [signupVerificationPending, setSignupVerificationPending] = useState(false);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(requestedAuthMode === "signup" ? "signup" : "signin");
  const [activeSlide, setActiveSlide] = useState(() => {
    if (typeof window === "undefined") return 0;
    return isWebAuthFlow || localStorage.getItem("kkary-driver-onboarding-seen") === "true" ? onboardingSlides.length : 0;
  });
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [currentTab, setCurrentTab] = useState<ActivityTab>("home");
  const [unreadMailCount, setUnreadMailCount] = useState(0);

  const [signupForm, setSignupForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [signinForm, setSigninForm] = useState({ emailOrPhone: "", password: "" });
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false);
  const [mailList, setMailList] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setSessionError(error.message);
      setSession(data.session);
      setSessionReady(true);
    }).catch(cause => {
      if (!mounted) return;
      setSessionError(cause instanceof Error ? cause.message : "Unable to restore your session.");
      setSessionReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionReady(true);
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authMode !== "signup" || locationEnabled || !navigator.permissions) return;
    void navigator.permissions.query({ name: "geolocation" })
      .then(permission => {
        if (permission.state === "granted") setLocationEnabled(true);
      })
      .catch(() => {});
  }, [authMode, locationEnabled]);

  const requestDriverLocation = () => {
    if (!navigator.geolocation) {
      alert("This device does not support location services.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocationEnabled(true),
      () => setLocationEnabled(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const createDriverAccount = async () => {
    if (!locationEnabled) {
      alert("Enable location access once during sign-up. You can change this later in your device settings.");
      return;
    }
    const phone = signupForm.phone.trim() ? normalizeE164PhoneNumber(signupForm.phone) : null;
    if (signupForm.phone.trim() && !phone) {
      alert("Enter a valid phone number in international format, such as +2348000000000.");
      return;
    }
    if (
      !signupForm.name.trim() ||
      !signupForm.email.trim() ||
      signupForm.password.length < 10 ||
      signupForm.password !== signupForm.confirmPassword
    ) {
      alert("Complete all details, use a password of at least 10 characters, and make sure both passwords match.");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp(phone
        ? {
            phone,
            password: signupForm.password,
            options: {
              data: {
                name: signupForm.name.trim(),
                full_name: signupForm.name.trim(),
                email: signupForm.email.trim(),
                phone,
                user_type: "driver",
              },
            },
          }
        : {
            email: signupForm.email.trim(),
            password: signupForm.password,
            options: {
              data: {
                name: signupForm.name.trim(),
                full_name: signupForm.name.trim(),
                phone: null,
                user_type: "driver",
              },
            },
          });
      if (error) throw error;
      if (!phone) {
        if (!data.session) {
          alert("Email confirmation is enabled for this Supabase project. Disable it to create accounts without a verification step.");
          return;
        }
        setSignupCompleted(true);
      } else {
        setPhoneOtp("");
        setPhoneOtpSent(true);
      }
    } catch (cause) {
      alert(`Unable to create account: ${cause instanceof Error ? cause.message : "Phone verification failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyDriverPhone = async (code: string) => {
    if (!/^\d{6}$/.test(code) || isLoading) return;
    const phone = normalizeE164PhoneNumber(signupForm.phone);
    if (!phone) {
      alert("Enter a valid phone number.");
      return;
    }
    setIsLoading(true);
    setSignupVerificationPending(true);
    let phoneVerified = false;
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
      if (verifyError) throw verifyError;
      phoneVerified = true;
      setIsPhoneVerified(true);
      const { error: updateError } = await supabase.auth.updateUser({
        email: signupForm.email.trim(),
        data: {
          name: signupForm.name.trim(),
          full_name: signupForm.name.trim(),
          phone,
          user_type: "driver",
        },
      });
      if (updateError) throw updateError;
      setSignupCompleted(true);
      setSignupVerificationPending(false);
    } catch (cause) {
      if (!phoneVerified) setSignupVerificationPending(false);
      alert(`Unable to verify code: ${cause instanceof Error ? cause.message : "Phone verification failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resendDriverCode = async () => {
    const phone = normalizeE164PhoneNumber(signupForm.phone);
    if (!phone) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "sms", phone });
      if (error) throw error;
      setPhoneOtp("");
      alert(`A new verification code was sent to ${phone}.`);
    } catch (cause) {
      alert(`Unable to resend verification code: ${cause instanceof Error ? cause.message : "Please try again."}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isStandalone && !isWebAuthFlow) return <DriverLandingPage />;

  if (!sessionReady) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-900 text-sm font-semibold text-white">Restoring your Kkary Driver session…</div>;
  }

  if (sessionError && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-900 px-6 text-center text-white">
        <p>Unable to restore your session: {sessionError}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold">Try again</button>
      </div>
    );
  }

  if (!session || signupVerificationPending || (authMode === "signup" && isPhoneVerified && !signupCompleted)) {
    return (
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        {phoneOtpSent && authMode === "signup" && !isPhoneVerified ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
              <h2 className="text-center text-2xl font-bold">Verify your phone number</h2>
              <p className="mt-3 text-center text-sm text-gray-300">
                We sent a verification code to <strong className="text-white">{normalizeE164PhoneNumber(signupForm.phone)}</strong>.
              </p>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit verification code"
                placeholder="••••••"
                value={phoneOtp}
                onChange={event => {
                  const code = event.target.value.replace(/\D/g, "").slice(0, 6);
                  setPhoneOtp(code);
                  if (code.length === 6) void verifyDriverPhone(code);
                }}
                maxLength={6}
                className="mt-6 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-4 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-blue-500"
              />
              {isLoading && <p className="mt-3 text-center text-sm text-gray-300">Verifying code…</p>}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void resendDriverCode()}
                className="mt-5 w-full rounded-lg border border-gray-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                Resend verification code
              </button>
              <button
                type="button"
                onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }}
                className="mt-3 w-full text-sm text-gray-300"
              >
                Change phone number
              </button>
            </div>
          </div>
        ) : activeSlide < onboardingSlides.length && !session ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="mb-8 text-center">
              {(() => {
                const Icon = onboardingSlides[activeSlide].icon;
                return <Icon className="w-20 h-20 mx-auto mb-4 text-blue-500" />;
              })()}
              <h2 className="text-3xl font-bold mb-4">{onboardingSlides[activeSlide].title}</h2>
              <p className="text-gray-300 text-lg">{onboardingSlides[activeSlide].description}</p>
            </div>

            <div className="flex gap-1 justify-center mb-8">
              {onboardingSlides.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all ${i === activeSlide ? "w-8 bg-blue-500" : "w-2 bg-gray-500"}`} />
              ))}
            </div>

            <div className="w-full flex gap-3">
              {activeSlide > 0 && (
                <button
                  onClick={() => setActiveSlide(activeSlide - 1)}
                  className="flex-1 py-3 border border-gray-500 rounded-lg hover:border-blue-500 transition-colors"
                >
                  Previous
                </button>
              )}

              {activeSlide < onboardingSlides.length - 1 ? (
                <button onClick={() => setActiveSlide(activeSlide + 1)} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex items-center justify-center gap-2">
                  Next <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem("kkary-driver-onboarding-seen", "true");
                    setActiveSlide(onboardingSlides.length);
                    setAuthMode("signin");
                  }}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  Start Using Kkary <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
              <h2 className="text-3xl font-bold mb-6 text-center">{authMode === "signup" ? "Create Account" : "Sign In"}</h2>

              {authMode === "signup" ? (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!isPhoneVerified) {
                      await createDriverAccount();
                      return;
                    }
                    setIsLoading(true);
                    try {
                      const phone = normalizeE164PhoneNumber(signupForm.phone);
                      if (!phone) throw new Error("Enter a valid phone number in international format.");
                      const { error } = await supabase.auth.updateUser({
                        email: signupForm.email.trim(),
                        data: { name: signupForm.name.trim(), full_name: signupForm.name.trim(), phone, user_type: "driver" },
                      });
                      if (error) throw error;
                      setSignupCompleted(true);
                      setSignupVerificationPending(false);
                    } catch (err) {
                      alert(`Error: ${err instanceof Error ? err.message : "Sign up failed"}`);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Location access</div>
                        <div className="mt-1 text-xs text-gray-400">Enable once during sign-up so nearby rides can be matched.</div>
                      </div>
                      <button type="button" onClick={requestDriverLocation} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold">
                        {locationEnabled ? "Enabled" : "Enable"}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={signupForm.name}
                    onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={signupForm.email}
                    onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (optional)"
                    value={signupForm.phone}
                    onChange={(e) => {
                      setSignupForm({ ...signupForm, phone: e.target.value });
                      setIsPhoneVerified(false);
                      setPhoneOtpSent(false);
                      setPhoneOtp("");
                    }}
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 10 chars)"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    minLength={10}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={signupForm.confirmPassword}
                    onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <button type="submit" disabled={isLoading || signupForm.password !== signupForm.confirmPassword} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg font-semibold">
                    {isLoading ? "Creating..." : isPhoneVerified ? "Finish Account Setup" : "Create Account"}
                  </button>
                </form>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    try {
                      if (!signinForm.emailOrPhone.includes("@") && !normalizeE164PhoneNumber(signinForm.emailOrPhone)) {
                        throw new Error("Enter a valid phone number in international format.");
                      }
                      const isEmail = signinForm.emailOrPhone.includes("@");
                      const phone = isEmail ? null : normalizeE164PhoneNumber(signinForm.emailOrPhone);
                      if (!isEmail && !phone) throw new Error("Enter a valid phone number in international format.");
                      const credentials = isEmail
                        ? { email: signinForm.emailOrPhone.trim(), password: signinForm.password }
                        : { phone: phone!, password: signinForm.password };
                      const { error } = await supabase.auth.signInWithPassword(credentials);
                      if (error) throw error;
                    } catch (err) {
                      alert(`Error: ${err instanceof Error ? err.message : "Sign in failed"}`);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    placeholder="Email or Phone"
                    value={signinForm.emailOrPhone}
                    onChange={(e) => setSigninForm({ ...signinForm, emailOrPhone: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={signinForm.password}
                    onChange={(e) => setSigninForm({ ...signinForm, password: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg font-semibold">
                    {isLoading ? "Signing in..." : "Sign In"}
                  </button>
                </form>
              )}

              <p className="text-center text-gray-400 mt-4">
                {authMode === "signup" ? "Already have an account? " : "Don't have an account? "}
                <button
                  onClick={async () => {
                    if (signupVerificationPending) {
                      const { error } = await supabase.auth.signOut();
                      if (error) {
                        alert(`Unable to switch accounts: ${error.message}`);
                        return;
                      }
                      setSession(null);
                      setSignupVerificationPending(false);
                      setIsPhoneVerified(false);
                      setPhoneOtpSent(false);
                      setPhoneOtp("");
                    }
                    setSignupCompleted(false);
                    setAuthMode(authMode === "signup" ? "signin" : "signup");
                  }}
                  className="text-blue-500 hover:text-blue-400 font-semibold"
                >
                  {authMode === "signup" ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="bg-black px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <h1 className="text-xl font-bold text-blue-500">Kkary Driver</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMailModal(true)} className="relative">
            <Mail className="w-6 h-6" />
            {unreadMailCount > 0 && <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadMailCount}</span>}
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              setSession(null);
            }}
            className="p-2 hover:bg-gray-800 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </header>

      {showMailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-96 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Inbox</h3>
              <button onClick={() => setShowMailModal(false)} className="hover:bg-gray-700 p-2 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            {mailList.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No messages</p>
            ) : (
              <div className="space-y-3">
                {mailList.map((mail) => (
                  <div key={mail.id} className="bg-gray-700 p-3 rounded cursor-pointer hover:bg-gray-600" onClick={() => alert(`From: ${mail.fromName}\n\n${mail.messageBody}`)}>
                    <p className="font-semibold text-sm">{mail.fromName}</p>
                    <p className="text-xs text-gray-300 truncate">{mail.subject}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-20">
        {currentTab === "account" ? (
          <div className="space-y-4 p-4">
            <h2 className="text-2xl font-bold">Settings</h2>
            <AppUpdateCard variant="driver" />
          </div>
        ) : currentTab === "home" ? (
          <DriverDispatch />
        ) : (
          <DriverDispatch view="earnings" />
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 flex justify-around">
        <button
          onClick={() => setCurrentTab("home")}
          className={`flex-1 py-4 flex flex-col items-center gap-1 ${currentTab === "home" ? "text-blue-500" : "text-gray-400 hover:text-white"}`}
        >
          <Navigation className="w-6 h-6" />
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => setCurrentTab("earnings")}
          className={`flex-1 py-4 flex flex-col items-center gap-1 ${currentTab === "earnings" ? "text-blue-500" : "text-gray-400 hover:text-white"}`}
        >
          <Zap className="w-6 h-6" />
          <span className="text-xs">Earnings</span>
        </button>
        <button
          onClick={() => setCurrentTab("account")}
          className={`flex-1 py-4 flex flex-col items-center gap-1 ${currentTab === "account" ? "text-blue-500" : "text-gray-400 hover:text-white"}`}
        >
          <User className="w-6 h-6" />
          <span className="text-xs">Account</span>
        </button>
      </nav>
    </div>
  );
}

export default DriverExperience;
