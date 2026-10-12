import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Hook to handle PWA installation prompts
 * Returns the deferredPrompt and install state
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  });
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const isAdmin = window.location.pathname.startsWith("/admin");
    if (!isAdmin) setCanInstall(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = async (): Promise<PwaInstallOutcome> => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setCanInstall(outcome === "dismissed");
      return outcome;
    }

    if (window.location.pathname.startsWith("/admin")) {
      return "unavailable";
    }

    const isDriverApp = window.location.pathname === "/drivers" || window.location.pathname.startsWith("/drivers/");
    const appName = isDriverApp ? "Kkary Driver" : "Kkary Rider";
    const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(window.navigator.userAgent);
    const instructions = isIOS
      ? `To install ${appName} on iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen.`
      : isAndroid
        ? `To install ${appName} on Android, open this page in Chrome, tap the ⋮ menu, then choose Install app or Add to Home screen.`
        : `To install ${appName} on desktop, use your browser's Install icon or page menu and choose Install ${appName}.`;
    window.alert(instructions);
    return "unavailable";
  };

  return {
    canInstall,
    isInstalled,
    installApp,
  };
}
