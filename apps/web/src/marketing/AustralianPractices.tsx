import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";

const ENQUIRY_FIELDS = [
  "Practice role and size:",
  "State or territory:",
  "Recurring task (describe the type of work, without client details):",
  "Current tools:",
  "Preferred contact details:",
];

function enquiryHref(subject: string) {
  const body = [
    "Hello gitmatter,",
    "",
    "I would like to discuss the Australian practitioner pilot.",
    "",
    ...ENQUIRY_FIELDS.flatMap((field) => [field, ""]),
    "Please provide an AUD quote stating whether GST applies and is included, and explain any separate AI-provider costs.",
    "",
    "Do not attach client documents or include client names, confidential information, API keys, or other credentials.",
  ].join("\n");
  return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const QUOTE_HREF = enquiryHref("Australian sole-practice pilot quote");
const PILOT_HREF = enquiryHref("Australian practitioner pilot enquiry");

const TASKS = [
  {
    title: "Help me understand this file",
    body: "Prepare a matter briefing from the documents you select. Separate supported facts, missing information, and questions that need your judgment.",
    output: "A source-linked briefing to check against the file.",
  },
  {
    title: "Review this agreement",
    body: "Work through the agreement against your instructions. Inspect the source wording, consider proposed changes, and record your decisions.",
    output: "An issues list and proposed changes for your review.",
  },
  {
    title: "Draft a client update",
    body: "Prepare a draft from what the file actually establishes. Use your practice's correspondence preferences, then check and edit it before use.",
    output: "An editable Word draft kept with the matter.",
  },
];

const WEEKS = [
  {
    title: "Understand your work",
    body: "Walk through a recurring task and establish the time spent preparing, checking, correcting, and exporting it.",
  },
  {
    title: "Set up and try a sample",
    body: "Review the proposed AI configuration, save your preferences, and complete a fictional matter together.",
  },
  {
    title: "Try the recurring workflow",
    body: "Where appropriately authorised, test the task on your work. Record missed issues, corrections, formatting problems, and assistance required.",
  },
  {
    title: "Decide whether to continue",
    body: "Review the evidence, repeat use, and a clearly stated AUD price. Agree any continuation separately.",
  },
];

export default function AustralianPractices() {
  return (
    <div>
      <section className="mx-auto grid max-w-7xl gap-12 px-6 pt-20 pb-24 lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:gap-20">
        <div>
          <h1 className="max-w-[18ch] font-heading text-5xl leading-[1.06] tracking-tight text-balance sm:text-6xl">
            Your next piece of work starts with a clearer file.
          </h1>
          <p className="mt-7 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
            For Australian sole practitioners and general practices. Understand matter documents,
            review an agreement, or prepare a client update with your own approved AI. Check the
            sources and keep a record of what you decide in gitmatter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" nativeButton={false} render={<a href="#pilot" />}>
              Explore the practitioner pilot
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<a href={SITE.bookDemo} target="_blank" rel="noreferrer" />}
            >
              Book a walkthrough
            </Button>
          </div>
        </div>
        <aside className="bg-secondary p-7 sm:p-8" aria-label="The review loop">
          <h2 className="text-title font-sans">The review loop</h2>
          <ol className="mt-6 flex flex-col gap-5">
            {[
              "Bring the source documents",
              "Prepare a draft with your AI",
              "Check the source and make decisions",
              "Keep the work on the matter file",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-4">
                <span className="font-heading text-xl text-bronze" aria-hidden="true">
                  {index + 1}.
                </span>
                <span className="pt-0.5 text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
            AI outputs are drafts. A recorded AI action does not establish that a practitioner has
            checked the result.
          </p>
        </aside>
      </section>

      <section className="border-y border-border bg-secondary/40" aria-labelledby="practice-tasks">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2
            id="practice-tasks"
            className="max-w-[25ch] font-heading text-4xl tracking-tight text-balance"
          >
            Start with the job in front of you.
          </h2>
          <div className="mt-12">
            {TASKS.map((task) => (
              <article
                key={task.title}
                className="grid gap-4 border-t border-border py-8 lg:grid-cols-[1fr_1.2fr] lg:gap-8"
              >
                <h3 className="font-heading text-2xl tracking-tight">{task.title}</h3>
                <div>
                  <p className="max-w-[58ch] leading-relaxed text-muted-foreground">{task.body}</p>
                  <p className="mt-3 text-sm font-medium">{task.output}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Extracted dates need your confirmation. These workflows do not calculate legal
            deadlines, file court documents, or send client correspondence automatically.
          </p>
        </div>
      </section>

      <section
        className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20"
        aria-labelledby="practice-setup"
      >
        <div>
          <h2
            id="practice-setup"
            className="max-w-[18ch] font-heading text-4xl tracking-tight text-balance"
          >
            Start with fictional documents. Work through the details together.
          </h2>
          <a
            href={SITE.bookDemo}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
          >
            Book an assisted walkthrough <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <div className="flex flex-col gap-7">
          <div>
            <h3 className="font-heading text-xl">Choose how your practice uses AI</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Connect an approved external assistant such as ChatGPT or Claude, or configure an
              API-provider account for gitmatter's built-in features. Review that account's terms,
              settings, and permissions before using client material. A paid subscription alone does
              not establish suitability for confidential work.
            </p>
          </div>
          <div>
            <h3 className="font-heading text-xl">Set your practice context</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Choose the applicable Australian jurisdiction and save correspondence wording and a
              preferred sign-off. You remain responsible for checking the output and the law that
              applies to each matter.
            </p>
          </div>
          <div>
            <h3 className="font-heading text-xl">Understand where information goes</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Document-storage region is one control. Account data, backups, monitoring, AI
              processing, and a connected assistant can have different locations and retention. Zero
              retention depends on the actual provider, account, settings, and agreements.
            </p>
            <a
              href={`${SITE.docs}/admin/ai-data-handling`}
              className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
            >
              Read the AI data-handling guide
            </a>
          </div>
        </div>
      </section>

      <section className="bg-secondary/60" aria-labelledby="practice-quote">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <h2
              id="practice-quote"
              className="max-w-[20ch] font-heading text-4xl tracking-tight text-balance"
            >
              Discuss the workflow, setup, and price before committing.
            </h2>
          </div>
          <div>
            <p className="leading-relaxed text-muted-foreground">
              Request a pilot quote in Australian dollars. The quote will state the scope of hosted
              access and assisted setup, the proposed monthly price and terms, and whether GST
              applies and is included. There is no published pilot fee or automatic enrolment here.
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Your external AI subscription or API-provider usage may be separately payable to that
              provider. We will distinguish these costs from the gitmatter quote.
            </p>
            <div className="mt-7">
              <Button size="lg" nativeButton={false} render={<a href={QUOTE_HREF} />}>
                Request an AUD pilot quote
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Opens an editable email draft. Review and send it yourself; no payment is taken.
            </p>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Prefer to manage your own infrastructure? The application remains MIT-licensed and{" "}
              <a
                href={`${SITE.docs}/admin/self-hosting`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                self-hostable
              </a>
              . Hosting, support, and provider costs are separate from the software licence.
            </p>
          </div>
        </div>
      </section>

      <section
        id="pilot"
        className="mx-auto max-w-7xl scroll-mt-8 px-6 py-24"
        aria-labelledby="practice-pilot"
      >
        <h2
          id="practice-pilot"
          className="max-w-[23ch] font-heading text-4xl tracking-tight text-balance"
        >
          Test it against the work you repeat.
        </h2>
        <p className="mt-6 max-w-[68ch] text-lg leading-relaxed text-muted-foreground">
          We are seeking expressions of interest from Australian sole practitioners and general
          practices that regularly work through document bundles and prepare client correspondence.
          The initial target is 5 practitioners. Participation, pricing, and document handling would
          be agreed individually.
        </p>
        <ol className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {WEEKS.map((week, index) => (
            <li key={week.title} className="border-t border-border pt-5">
              <p className="text-sm font-medium text-muted-foreground">Week {index + 1}</p>
              <h3 className="mt-3 font-heading text-2xl">{week.title}</h3>
              <p className="mt-3 max-w-[55ch] leading-relaxed text-muted-foreground">{week.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 rounded-xl bg-secondary/60 p-6 sm:p-8">
          <h3 className="font-heading text-2xl">Tell us about your recurring task.</h3>
          <p className="mt-3 max-w-[70ch] leading-relaxed text-muted-foreground">
            In your enquiry, include your role and practice size, state or territory, the type of
            task, current tools, and preferred contact details. Do not include client names,
            documents, confidential details, or credentials.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <Button size="lg" nativeButton={false} render={<a href={PILOT_HREF} />}>
              Open a pilot enquiry
            </Button>
            <a href={SITE.contact} className="text-sm underline underline-offset-4">
              {SITE.email}
            </a>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Opens your email app with an editable template. Nothing is sent, booked, or accepted
            until you take the next step. You can also email the address above directly.
          </p>
        </div>
      </section>
    </div>
  );
}
