import { InstallPoster } from "@/components/InstallPoster";

export default function DriverLandingPage() {
  return (
    <InstallPoster
      appName="Kkary Driver"
      appPath="/drivers?mode=app"
      imageSrc="/images/driver-landing.png"
      imageAlt="Kkary Driver: Drive. Earn. Grow. A Kkary driver and branded car in a city at night, with driver benefits and an Install App button."
      installButton={{ top: "79.8%", left: "20%", width: "60%", height: "6.6%" }}
    />
  );
}
