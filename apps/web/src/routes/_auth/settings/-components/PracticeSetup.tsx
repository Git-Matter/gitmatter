import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileCheck2, Settings2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PracticeSetup() {
  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-col gap-2">
        <h2 className="font-sans text-base font-semibold">Set up for your practice</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Start with fictional material, choose how your approved AI account connects, and set the
          context for your work.
        </p>
      </div>
      <ol className="flex flex-col gap-stack">
        <li>
          <Card variant="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="size-4" aria-hidden="true" />
                1. Set your practice preferences
              </CardTitle>
              <CardDescription>
                Your state or territory, correspondence header and preferred sign-off are shared
                across your practice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/settings"
                search={{ tab: "practice" }}
                className="text-sm font-medium underline underline-offset-4"
              >
                Set practice preferences
              </Link>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card variant="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" aria-hidden="true" />
                2. Choose your AI connection
              </CardTitle>
              <CardDescription>
                Use a connected assistant under that service's account terms, or run gitmatter's
                built-in assistant with an API-provider account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Check your practice's approval, contractual protections, retention and processing
                arrangements before sharing client material. A paid subscription alone does not
                establish those protections.
              </p>
              <div className="flex flex-wrap gap-4 text-sm font-medium">
                <Link
                  to="/settings"
                  search={{ tab: "agents" }}
                  className="underline underline-offset-4"
                >
                  Connect your assistant
                </Link>
                <Link
                  to="/settings"
                  search={{ tab: "ai" }}
                  className="underline underline-offset-4"
                >
                  Configure built-in AI
                </Link>
              </div>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card variant="section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-4" aria-hidden="true" />
                3. Try a fictional matter
              </CardTitle>
              <CardDescription>
                Prepare a file briefing, agreement review or client update. Inspect the instructions
                before starting an AI run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/assistant" className="text-sm font-medium underline underline-offset-4">
                Open guided work
              </Link>
            </CardContent>
          </Card>
        </li>
      </ol>
      <Alert>
        <AlertTitle>Check what each setting covers</AlertTitle>
        <AlertDescription>
          Document-region selection covers document object storage. Account data, backups,
          monitoring and AI processing can have different locations. A connected external assistant
          also has its own handling and retention terms.
        </AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        For help setting up,{" "}
        <a
          className="inline-flex items-center gap-1 underline underline-offset-4"
          href="https://www.cal.eu/gitmatter/demo"
          target="_blank"
          rel="noreferrer"
        >
          book an assisted walkthrough
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
        . Use fictional material for the first session and keep credentials out of support messages.
      </p>
    </div>
  );
}
