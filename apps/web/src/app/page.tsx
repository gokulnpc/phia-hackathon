import { HeroSection } from "@/components/landing/HeroSection";
import { LandingNav } from "@/components/landing/LandingNav";
import { VideoBackground } from "@/components/landing/VideoBackground";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg">
      <VideoBackground />
      <LandingNav />
      <main>
        <HeroSection />
      </main>
    </div>
  );
}
