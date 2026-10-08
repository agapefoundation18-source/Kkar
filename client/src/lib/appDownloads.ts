export type AppKind = "rider" | "driver";
export type AppPlatform = "android" | "ios";

const appIds: Record<AppKind, string> = {
  rider: "ng.kkary.rider",
  driver: "ng.kkary.driver",
};

const installerUrls: Record<AppKind, { android?: string; ios?: string }> = {
  rider: {
    android: import.meta.env.VITE_KKARY_RIDER_ANDROID_INSTALLER,
    ios: import.meta.env.VITE_KKARY_RIDER_IOS_INSTALLER,
  },
  driver: {
    android: import.meta.env.VITE_KKARY_DRIVER_ANDROID_INSTALLER,
    ios: import.meta.env.VITE_KKARY_DRIVER_IOS_INSTALLER,
  },
};

export function getAppDownloadUrl(kind: AppKind) {
  const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  const platform = isAppleDevice ? "ios" : "android";
  const configuredUrl = getAppStoreUrls(kind)[platform];

  return configuredUrl;
}

export function getAppStoreUrls(kind: AppKind): Record<AppPlatform, string> {
  return {
    android:
      installerUrls[kind].android ??
      `https://play.google.com/store/apps/details?id=${appIds[kind]}`,
    ios:
      installerUrls[kind].ios ??
      `https://apps.apple.com/ng/search?term=Kkary%20${kind === "driver" ? "Driver" : "Rider"}`,
  };
}