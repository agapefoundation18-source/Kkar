import {
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
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
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { getAppDownloadUrl, type AppKind } from "@/lib/appDownloads";
import { normalizeE164PhoneNumber } from "@/lib/phoneAuth";
import { supabase } from "@/lib/supabase";

type AuthMode = "signup" | "signin";
type ActivityTab = "home" | "earnings";

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

  const [session, setSession] = useState<Session | null>(null);
  const [signupVerificationPending, setSignupVerificationPending] = useState(false);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [activeSlide, setActiveSlide] = useState(0);
  const [locationPermission, setLocationPermission] = useState<"unknown" | "granted" | "denied">("unknown");
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => authListener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setLocationPermission("granted"),
        () => setLocationPermission("denied"),
        { timeout: 3000 }
      );
    }
  }, []);

  if (!isStandalone) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-black to-gray-900 px-4 text-white">
        <Smartphone className="w-16 h-16 mb-4 text-blue-500" />
        <h1 className="text-3xl font-bold mb-2">Kkary Driver</h1>
        <p className="text-gray-300 mb-6 text-center">Download the app to start earning</p>
        <a href={getAppDownloadUrl("driver")} className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold">
          Download Now
        </a>
      </div>
    );
  }

  if (!session || signupVerificationPending || (authMode === "signup" && isPhoneVerified && !signupCompleted)) {
    return (
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        {activeSlide < onboardingSlides.length && !session ? (
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
                    if (locationPermission === "granted") {
                      setAuthMode("signin");
                    } else {
                      alert("Location permission is required to continue");
                    }
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
                      alert("Verify your phone number with the SMS code before creating your account.");
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
                      alert("Your phone is verified. Check your email to enable email sign-in; you can sign in with your phone and password now.");
                      setSignupCompleted(true);
                      setSignupVerificationPending(false);
                    } catch (err) {
                      alert(`Error: ${err instanceof Error ? err.message : "Sign up failed"}`);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={signupForm.name}
                    onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                    disabled={phoneOtpSent}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={signupForm.email}
                    onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                    disabled={phoneOtpSent}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={signupForm.phone}
                      onChange={(e) => {
                        setSignupForm({ ...signupForm, phone: e.target.value });
                        setIsPhoneVerified(false);
                        setPhoneOtpSent(false);
                        setPhoneOtp("");
                      }}
                      required
                      className="flex-1 px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      disabled={isLoading || isPhoneVerified}
                      onClick={async () => {
                        const phone = normalizeE164PhoneNumber(signupForm.phone);
                        if (!phone) {
                          alert("Enter a valid phone number in international format, such as +2348000000000.");
                          return;
                        }
                        if (!signupForm.name.trim() || !signupForm.email.trim() || signupForm.password.length < 10 || signupForm.password !== signupForm.confirmPassword) {
                          alert("Complete your details, use a password of at least 10 characters, and make sure both passwords match before requesting a code.");
                          return;
                        }
                        setIsLoading(true);
                        try {
                          const { error } = await supabase.auth.signUp({
                            phone,
                            password: signupForm.password,
                            options: {
                              data: { name: signupForm.name.trim(), full_name: signupForm.name.trim(), email: signupForm.email.trim(), phone, user_type: "driver" },
                            },
                          });
                          if (error) throw error;
                          setPhoneOtpSent(true);
                          alert("We sent a verification code by SMS. Enter it below to verify your phone.");
                        } catch (err) {
                          alert(`Unable to send verification code: ${err instanceof Error ? err.message : "Phone verification failed"}`);
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      className={`px-4 py-3 rounded-lg font-semibold flex items-center gap-2 ${isPhoneVerified ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"}`}
                    >
                      {isPhoneVerified ? <Check className="w-5 h-5" /> : phoneOtpSent ? "Verify code" : "Send code"}
                    </button>
                  </div>
                  {phoneOtpSent && !isPhoneVerified && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="6-digit SMS code"
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        maxLength={6}
                        className="flex-1 px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                      />
                      <button
                        type="button"
                        disabled={isLoading || phoneOtp.length !== 6}
                        onClick={async () => {
                          const phone = normalizeE164PhoneNumber(signupForm.phone);
                          if (!phone) return;
                          setIsLoading(true);
                          setSignupVerificationPending(true);
                          try {
                            const { error } = await supabase.auth.verifyOtp({ phone, token: phoneOtp, type: "sms" });
                            if (error) throw error;
                            setIsPhoneVerified(true);
                            alert("Phone number verified. Create your account to continue.");
                          } catch (err) {
                            setSignupVerificationPending(false);
                            alert(`Unable to verify code: ${err instanceof Error ? err.message : "Phone verification failed"}`);
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        className="px-4 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700"
                      >
                        Verify
                      </button>
                    </div>
                  )}
                  <input
                    type="password"
                    placeholder="Password (min 10 chars)"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    disabled={phoneOtpSent}
                    minLength={10}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={signupForm.confirmPassword}
                    onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                    disabled={phoneOtpSent}
                    required
                    className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <button type="submit" disabled={isLoading || !isPhoneVerified || signupForm.password !== signupForm.confirmPassword} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg font-semibold">
                    {isLoading ? "Creating..." : "Create Account"}
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
        {currentTab === "home" ? (
          <div className="p-4 space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-6 text-white">
              <h2 className="text-2xl font-bold mb-2">Welcome, {session.user.user_metadata?.name || "Driver"}</h2>
              <p className="text-blue-100">You're online and available</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <Clock3 className="w-6 h-6 text-green-500 mb-2" />
                <p className="text-gray-400 text-sm">Today's Earnings</p>
                <p className="text-2xl font-bold">₦8,450</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <Navigation className="w-6 h-6 text-blue-500 mb-2" />
                <p className="text-gray-400 text-sm">Trips Completed</p>
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Your Location
              </h3>
              <div className="w-full h-48 bg-gray-900 rounded flex items-center justify-center text-gray-400">Live Map View</div>
            </div>

            <button className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">Go Offline</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">Earnings</h2>
            <div className="space-y-3">
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold">Mon 8:20 PM</span>
                  <span className="text-green-500 font-bold">+₦2,850</span>
                </div>
                <p className="text-gray-400 text-sm">Uyo Main Park → Four Points by Sheraton</p>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold">Mon 5:15 PM</span>
                  <span className="text-green-500 font-bold">+₦3,200</span>
                </div>
                <p className="text-gray-400 text-sm">Nwaniba Road → Ewet Housing</p>
              </div>
            </div>
          </div>
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
        <button className="flex-1 py-4 flex flex-col items-center gap-1 text-gray-400 hover:text-white">
          <User className="w-6 h-6" />
          <span className="text-xs">Account</span>
        </button>
      </nav>
    </div>
  );
}

export default DriverExperience;
