import { NoxiaIntro } from "@/components/landing/NoxiaIntro";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Modules } from "@/components/landing/Modules";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Footer } from "@/components/landing/Footer";
export default function Home() {
  return <>
    <NoxiaIntro />
    <Header />
    <main>
      <Hero />
      <Modules />
      <HowItWorks />
    </main>
    <Footer />
  </>;
}
