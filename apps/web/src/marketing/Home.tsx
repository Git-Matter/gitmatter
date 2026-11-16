import Hero from "@/marketing/components/Hero";
import BringYourOwn from "@/marketing/components/BringYourOwn";
import WorkIndex from "@/marketing/components/WorkIndex";
import AuditSpine from "@/marketing/components/AuditSpine";
import TrustBand from "@/marketing/components/TrustBand";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only marketing landing. Bundled solely when DEPLOYMENT=cloud (see
// routes/(marketing)/). One story, top to bottom: the promise, how you plug
// your own AI in, why firms choose it, the work itself, the record as proof,
// the guarantees, then your terms.
export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <WorkIndex />
      <AuditSpine />
      <BringYourOwn />
      <TrustBand />
      <CTASection />
    </div>
  );
}
