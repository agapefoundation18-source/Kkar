import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

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

  const installApp = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setCanInstall(outcome !== "accepted");
      return;
    }

    if (window.location.pathname.startsWith("/admin")) {
      return;
    }

    const isDriverApp = window.location.pathname === "/drivers" || window.location.pathname.startsWith("/drivers/");
    const appName = isDriverApp ? "Kkary Driver" : "Kkary Rider";
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(window.navigator.userAgent);
    window.alert(
      isAppleDevice
        ? `To install ${appName}, tap Share in your browser, then choose Add to Home Screen.`
        : `To install ${appName}, open your browser menu and choose Install app or Add to Home screen.`,
    );
  };

  return {
    canInstall,
    isInstalled,
    installApp,
  };
}
