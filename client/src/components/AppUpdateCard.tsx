import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";

export function AppUpdateCard({ variant = "rider" }: { variant?: "rider" | "driver" }) {
  const { data: release, isLoading, error } = trpc.operations.appRelease.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const buildStorageKey = `kkar-${variant}-installed-build`;
  const [installedBuildId, setInstalledBuildId] = useState(() => {
    const storedBuildId = window.localStorage.getItem(buildStorageKey);
    if (storedBuildId) return storedBuildId;
    window.localStorage.setItem(buildStorageKey, __KKAR_BUILD_ID__);
    return __KKAR_BUILD_ID__;
  });
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const dark = variant === "driver";
  useEffect(() => {
    if (release && !release.promptForUpdate) {
      window.localStorage.setItem(buildStorageKey, __KKAR_BUILD_ID__);
      setInstalledBuildId(__KKAR_BUILD_ID__);
    }
  }, [buildStorageKey, release?.releaseId, release?.promptForUpdate]);
  const isOutdated = Boolean(
    release?.version &&
      release.buildId &&
      release.promptForUpdate &&
      release.buildId !== installedBuildId,
  );

  if (isLoading || error || !isOutdated || !release) return null;

  const installUpdate = async () => {
    setUpdating(true);
    setUpdateError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        const installing = registration.installing;
        if (installing && installing.state !== "installed") {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              installing.removeEventListener("statechange", handleStateChange);
              reject(new Error("The update is taking too long to download. Please try again."));
            }, 20_000);
            const handleStateChange = () => {
              if (installing.state === "installed" || installing.state === "redundant") {
                window.clearTimeout(timeout);
                installing.removeEventListener("statechange", handleStateChange);
                if (installing.state === "redundant") {
                  reject(new Error("The update could not be installed. Please try again."));
                } else {
                  resolve();
                }
              }
            };
            installing.addEventListener("statechange", handleStateChange);
            handleStateChange();
          });
        }
        const worker = registration.waiting;
        if (worker) {
          const controllerChanged = new Promise<void>(resolve => {
            const timeout = window.setTimeout(() => {
              navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
              resolve();
            }, 10_000);
            const handleControllerChange = () => {
              window.clearTimeout(timeout);
              navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
              resolve();
            };
            navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
          });
          worker.postMessage({ type: "SKIP_WAITING" });
          await controllerChanged;
        }
      }
      window.localStorage.setItem(buildStorageKey, release.buildId);
      setInstalledBuildId(release.buildId);
      window.location.reload();
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : "Unable to check for the update.");
      setUpdating(false);
    }
  };

  return (
    <section className={`rounded-2xl border p-4 ${dark ? "border-blue-500/30 bg-blue-950/40 text-white" : "border-[#d9eae4] bg-[#f2faf6] text-[#173b3b]"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${dark ? "bg-blue-500/15 text-blue-300" : "bg-[#dff2e8] text-[#398171]"}`}>
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-black">Kkary {variant === "driver" ? "Driver" : "Rider"} update available</h2>
          <p className={`mt-1 text-sm ${dark ? "text-gray-300" : "text-[#718c86]"}`}>
            Version {release.version} is ready to install.
          </p>
          {release.notes && <p className={`mt-2 whitespace-pre-wrap text-sm ${dark ? "text-gray-200" : "text-[#597872]"}`}>{release.notes}</p>}
          <button
            type="button"
            onClick={() => void installUpdate()}
            disabled={updating}
            className={`mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-60 ${dark ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-[#12393a] text-white hover:bg-[#1c5050]"}`}
          >
            <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            {updating ? "Installing update..." : "Update now"}
          </button>
          {updateError && <p role="alert" className="mt-2 text-sm text-red-500">{updateError}</p>}
        </div>
      </div>
    </section>
  );
}
