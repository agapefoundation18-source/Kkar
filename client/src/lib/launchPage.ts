export function shouldShowLaunchPage({
  pathname,
  standalone,
  enabled,
  launchAt,
  now = Date.now(),
}: {
  pathname: string;
  standalone: boolean;
  enabled: boolean;
  launchAt: string | null | undefined;
  now?: number;
}) {
  if (!["/", "/drivers"].includes(pathname) || standalone || !enabled || !launchAt) return false;
  const launchTime = Date.parse(launchAt);
  return Number.isFinite(launchTime) && launchTime > now;
}
