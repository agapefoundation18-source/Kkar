import { useState } from "react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

interface InstallPosterProps {
  appName: string;
  appPath: string;
  imageAlt: string;
  imageSrc: string;
  installButton: {
    top: string;
    left: string;
    width: string;
    height: string;
  };
}

export function InstallPoster({
  appName,
  appPath,
  imageAlt,
  imageSrc,
  installButton,
}: InstallPosterProps) {
  const { isInstalled, installApp } = usePwaInstall();
  const [status, setStatus] = useState("");

  const handleInstall = async () => {
    if (isInstalled) {
      window.location.assign(appPath);
      return;
    }

    try {
      const outcome = await installApp();
      if (outcome === "accepted") {
        setStatus(`Installation accepted for ${appName}.`);
      } else if (outcome === "dismissed") {
        setStatus(`Installation dismissed. You can try again whenever you’re ready to install ${appName}.`);
      } else {
        setStatus(`Follow the installation instructions shown by your browser to install ${appName}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setStatus(`The install prompt could not open: ${message}`);
      window.alert(`The install prompt could not open: ${message}`);
    }
  };

  return (
    <>
      <main className="flex min-h-screen justify-center overflow-x-hidden bg-[#030A13] sm:min-h-svh">
        <figure className="relative m-0 h-fit w-full max-w-[600px]">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="block h-auto w-full"
            width="1024"
            height="1536"
            fetchPriority="high"
          />
          <button
            type="button"
            onClick={() => void handleInstall()}
            aria-label={isInstalled ? `Open ${appName}` : `Install ${appName}`}
            className="absolute z-10 rounded-full bg-transparent focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FFD400]"
            style={installButton}
          >
            <span className="sr-only">{isInstalled ? `Open ${appName}` : `Install ${appName}`}</span>
          </button>
        </figure>
      </main>
      <p role="status" className="sr-only" aria-live="polite">{status}</p>
    </>
  );
}
