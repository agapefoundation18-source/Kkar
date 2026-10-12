import { InstallPoster } from "@/components/InstallPoster";

export default function RiderLandingPage() {
  return (
    <InstallPoster
      appName="Kkary Rider"
      appPath="/?mode=app"
      imageSrc="/images/rider-landing.png"
      imageAlt="Kkary Rider: Ride Safe. Ride Easy. A Kkary driver and branded car in a city at night, with rider benefits and an Install App button."
      installButton={{ top: "83.7%", left: "21.5%", width: "57%", height: "7.2%" }}
    />
  );
}
