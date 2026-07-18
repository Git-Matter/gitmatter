import Hero from "@/marketing/components/Hero";
import BringYourOwn from "@/marketing/components/BringYourOwn";
import Manifesto from "@/marketing/components/Manifesto";
import WorkIndex from "@/marketing/components/WorkIndex";
import AuditSpine from "@/marketing/components/AuditSpine";
import TrustBand from "@/marketing/components/TrustBand";
import SelfHost from "@/marketing/components/SelfHost";
import CTASection from "@/marketing/components/CTASection";
import LegalAiCategory from "@/marketing/components/LegalAiCategory";

// Cloud-only marketing landing. Bundled solely when DEPLOYMENT=cloud (see
// routes/(marketing)/). One story, top to bottom: the promise, how you plug
// your own AI in, why firms choose it, the work itself, the record as proof,
// the guarantees, then your terms.
export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <LegalAiCategory />
      <BringYourOwn />
      <Manifesto />
      <WorkIndex />
      <AuditSpine />
      <TrustBand />
      <SelfHost />
      <CTASection />
    </div>
  );
}
