import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import RiderExperience from "./pages/RiderExperience";
import DriverExperience from "./pages/DriverExperience";
import Admin from "./pages/Admin";
import Drivers from "./pages/Drivers";
import LaunchComingSoon from "./components/LaunchComingSoon";
import { trpc } from "./lib/trpc";
import { Button } from "./components/ui/button";
import { useCallback, useEffect, useState } from "react";

function Router() {
  const isDriverHost = window.location.hostname === "kkarydriver.aevonindustries.site";
  const launchStatus = trpc.operations.launchStatus.useQuery(undefined, {
    retry: 2,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const [launchEnded, setLaunchEnded] = useState(false);
  const endLaunch = useCallback(() => setLaunchEnded(true), []);
  const isLegacyDriverPath = !isDriverHost && window.location.pathname === "/drivers";
  const isPublicAppPath = window.location.pathname === "/" &&
    new URLSearchParams(window.location.search).get("mode") !== "app";
  useEffect(() => setLaunchEnded(false), [launchStatus.data?.launchAt]);
  useEffect(() => {
    if (isLegacyDriverPath) {
      window.location.replace("https://kkarydriver.aevonindustries.site/");
    }
  }, [isLegacyDriverPath]);

  if (isLegacyDriverPath) {
    return <div className="flex min-h-screen items-center justify-center bg-[#113a3b] text-sm font-semibold text-[#b8d7d2]">Opening Kkary Driver…</div>;
  }

  if (isPublicAppPath && launchStatus.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#113a3b] text-sm font-semibold text-[#b8d7d2]">Loading Kkary…</div>;
  }
  if (isPublicAppPath && launchStatus.error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#113a3b] px-5 text-center text-white">
        <h1 className="text-2xl font-black">Kkary is temporarily unavailable.</h1>
        <p className="max-w-md text-sm text-[#bad5d1]">We couldn’t check the current launch status. Please try again in a moment.</p>
        <Button onClick={() => launchStatus.refetch()} className="rounded-xl bg-[#f4b942] text-[#153a3a] hover:bg-[#e8b139]">Try again</Button>
      </main>
    );
  }
  const launchAt = launchStatus.data?.launchAt;
  const launchCountdownActive = Boolean(
    isPublicAppPath &&
    launchStatus.data?.enabled &&
    launchAt &&
    Date.parse(launchAt) > Date.now() &&
    !launchEnded,
  );
  if (launchCountdownActive) {
    return <LaunchComingSoon launchAt={launchAt!} onCountdownEnd={endLaunch} />;
  }

  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={isDriverHost ? DriverExperience : RiderExperience} />
      <Route path={"/drivers"} component={DriverExperience} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
