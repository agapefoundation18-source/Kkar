export function BrandLogo({ driver = false, className = "h-10 w-10" }: { driver?: boolean; className?: string }) {
  return (
    <img
      src={driver ? "/icons/kkary-target-driver.svg" : "/icons/kkary-target.svg"}
      alt="Kkary"
      className={className}
    />
  );
}
