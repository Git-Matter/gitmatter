import Hero from "@/marketing/components/Hero";
import BringYourOwn from "@/marketing/components/BringYourOwn";
import Manifesto from "@/marketing/components/Manifesto";
import AuditSpine from "@/marketing/components/AuditSpine";
import SelfHost from "@/marketing/components/SelfHost";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only marketing landing. Bundled solely when DEPLOYMENT=cloud (see
// routes/(marketing)/). One story, top to bottom: the promise, how you plug
// your own AI in, why firms choose it, the record as proof, then your terms.
export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <BringYourOwn />
      <Manifesto />
      <AuditSpine />
      <SelfHost />
      <CTASection />
    </div>
  );
}
