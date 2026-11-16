import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ArrowRight, FileText, GitCommitHorizontal, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import Wordmark from "@/marketing/components/Wordmark";

const SECTIONS = ["Foundations", "Typography", "Controls", "Navigation", "Documents", "Feedback"];
const COLORS = [
  ["Background", "--background"],
  ["Surface", "--card"],
  ["Muted surface", "--muted"],
  ["Ink", "--foreground"],
  ["Secondary ink", "--ink-secondary"],
  ["Muted ink", "--muted-foreground"],
  ["Hairline", "--border"],
  ["Field border", "--input"],
  ["Focus", "--ring"],
] as const;

function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description: string;
}) {
  return (
    <section id={title.toLowerCase()} className="scroll-mt-8 border-t border-border py-12">
      <h2 className="font-heading text-3xl">{title}</h2>
      <p className="mt-3 mb-8 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}

export default function DesignSystem() {
  const { resolvedTheme, setTheme } = useTheme();
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <main className="page-container pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <a href="/" aria-label="gitmatter home">
          <Wordmark />
        </a>
        <Button
          variant="outline"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          Switch to {resolvedTheme === "dark" ? "light" : "dark"}
        </Button>
      </header>
      <div className="grid gap-12 py-12 lg:grid-cols-[12rem_1fr] lg:gap-16">
        <nav
          aria-label="Design system sections"
          className="flex flex-wrap content-start gap-x-6 gap-y-3 text-sm lg:sticky lg:top-8 lg:flex-col lg:self-start"
        >
          {SECTIONS.map((s) => (
            <a
              key={s}
              href={`#${s.toLowerCase()}`}
              className="py-1 text-muted-foreground hover:text-foreground"
            >
              {s}
            </a>
          ))}
          <a href="/" className="mt-4 text-sm underline underline-offset-4">
            View the website
          </a>
        </nav>
        <div className="min-w-0">
          <div className="pb-12">
            <h1 className="text-section">The gitmatter design system</h1>
            <p className="mt-5 max-w-[48ch] text-lead text-ink-secondary">
              A quiet interface for serious work. Warm paper, clear type, and a record you can read.
            </p>
            <p className="mt-4 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              Inspired by Harvey’s public website. Newsreader and Inter are open-source substitutes.
              These examples use the same components and tokens as the product. Sample records are
              fictional; controls on this page only change this preview.
            </p>
          </div>
          <Section
            title="Foundations"
            description="Use neutral surfaces for hierarchy. Color carries a decision, error, or keyboard focus. The theme switch previews our light and dark palettes."
          >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
              {COLORS.map(([name, token]) => (
                <div key={token}>
                  <div
                    className="mb-3 h-16 rounded-sm border border-border"
                    style={{ background: `var(${token})` }}
                  />
                  <dt className="text-sm font-medium">{name}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{token}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              <div>
                <h3 className="text-sm font-medium">Spacing</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  4 / 8 / 16 / 24 / 32 / 64 / 128px. Sections have room; controls stay compact.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Shape</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  16px for controls. 24px for media and dialogs. 28px for cards. Circles only for
                  circular controls and people.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Elevation</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Flat pages and cards. Only menus and dialogs cast a shadow.
                </p>
              </div>
            </div>
          </Section>
          <Section
            title="Typography"
            description="Newsreader gives pages and documents their voice. Inter carries controls, labels, and running text. Display type stays regular; interface emphasis uses medium weight."
          >
            <div className="space-y-8">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Display · 44–72 / 1.05 · regular
                </p>
                <p className="text-display">The whole story.</p>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Section · 32–48 / 1.1 · regular
                </p>
                <p className="text-section">See what changed.</p>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Page title · 32 / 1.2 · regular
                </p>
                <p className="font-heading text-[2rem] leading-[1.2]">Northstar acquisition</p>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Title · 20 / 1.3 · medium</p>
                <p className="text-title">Review the liability cap</p>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Body · 16 / 1.5 · regular</p>
                <p className="max-w-[62ch] leading-relaxed text-ink-secondary">
                  Each revision keeps the author, the reason, and the exact before and after. Your
                  team can follow the decision back to its source.
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Label · 14 / 1.3 · medium</p>
                <p className="text-sm font-medium">Current approved version</p>
              </div>
            </div>
          </Section>
          <Section
            title="Controls"
            description="One primary action per group. Labels stay sentence case. Fields have visible labels, readable borders, and an error beside the field."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setNotice("Preview saved. No product data was changed.")}>
                Save revision
              </Button>
              <Button variant="outline" onClick={() => setNotice("Preview download selected.")}>
                Download Word
              </Button>
              <Button variant="ghost" onClick={() => setNotice("Preview edit selected.")}>
                Edit details
              </Button>
              <Button disabled>Saving…</Button>
              <Button
                variant="destructive"
                onClick={() => setNotice("Preview archive selected. No template was archived.")}
              >
                Archive
              </Button>
              <Button
                variant="ghost"
                size="icon"
                tooltip="Search documents"
                onClick={() => document.getElementById("preview-title")?.focus()}
              >
                <Search />
              </Button>
            </div>
            <p role="status" className="mt-3 min-h-5 text-sm text-muted-foreground">
              {notice}
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <Button size="sm">Compact · 32px</Button>
              <Button>Default · 36px</Button>
              <Button size="lg">Large · 48px</Button>
            </div>
            <form
              className="mt-10 grid max-w-2xl gap-6 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="preview-title">Template name</Label>
                <Input id="preview-title" placeholder="e.g. Mutual NDA" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preview-owner">Owner</Label>
                <Select
                  defaultValue="legal"
                  items={[
                    { value: "legal", label: "Legal team" },
                    { value: "commercial", label: "Commercial team" },
                  ]}
                >
                  <SelectTrigger id="preview-owner" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legal">Legal team</SelectItem>
                    <SelectItem value="commercial">Commercial team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="preview-reason">Reason for the change</Label>
                <Textarea
                  id="preview-reason"
                  aria-invalid={submitted}
                  aria-describedby="preview-error"
                  placeholder="Explain what changed and why"
                />
                <p id="preview-error" className="text-sm text-destructive">
                  {submitted ? "Add a reason before saving this revision." : ""}
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox defaultChecked /> Require human approval
              </label>
              <div className="flex items-center gap-3">
                <Switch
                  id="preview-notifications"
                  aria-label="Email me about decisions"
                  defaultChecked
                />
                <Label htmlFor="preview-notifications">Email me about decisions</Label>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline">
                  Preview field error
                </Button>
              </div>
            </form>
          </Section>
          <Section
            title="Navigation"
            description="Navigation is text first. Active tabs use a small underline. Menus and dialogs disclose the next decision without adding permanent controls."
          >
            <Tabs defaultValue="documents">
              <TabsList variant="line" aria-label="Matter workspace">
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="history">Change history</TabsTrigger>
                <TabsTrigger value="team">Team</TabsTrigger>
              </TabsList>
              <TabsContent value="documents" className="py-5 text-muted-foreground">
                Matter documents and their current revisions.
              </TabsContent>
              <TabsContent value="history" className="py-5 text-muted-foreground">
                People and agents share the same history.
              </TabsContent>
              <TabsContent value="team" className="py-5 text-muted-foreground">
                Only people staffed on this matter can access its work.
              </TabsContent>
            </Tabs>
            <div className="mt-6 flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger render={<Button variant="outline" />}>
                  Open review dialog
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send this revision for review?</DialogTitle>
                    <DialogDescription>
                      The assigned reviewer checks this exact version before it becomes available to
                      the workspace.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                    <DialogClose
                      render={<Button onClick={() => setNotice("Preview review requested.")} />}
                    >
                      Send for review
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" aria-label="Template actions" size="icon" />}
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setNotice("Preview history selected.")}>
                    View history
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNotice("Preview download selected.")}>
                    Download approved Word
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Section>
          <Section
            title="Documents"
            description="The work is the focal point. Lists use spacing and horizontal rules. Audit metadata stays with the exact language it describes."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      Mutual NDA
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Approved</Badge>
                  </TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Services agreement</TableCell>
                  <TableCell>
                    <Badge variant="outline">Needs review</Badge>
                  </TableCell>
                  <TableCell>2</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <figure className="mt-10 bg-card p-6 sm:p-8">
              <figcaption className="mb-4 flex items-center gap-2 text-sm">
                <GitCommitHorizontal className="size-4" />
                Morgan Reyes · Accepted liability cap · Revision 3
              </figcaption>
              <blockquote className="max-w-[60ch] font-heading text-2xl leading-relaxed">
                Total liability shall not exceed{" "}
                <del className="bg-destructive-surface text-destructive">$5,000,000</del>{" "}
                <ins className="bg-success-surface text-success no-underline">$2,000,000</ins>.
              </blockquote>
              <p className="mt-4 text-sm text-muted-foreground">
                Reason: align the cap with the negotiated insurance cover.
              </p>
            </figure>
            <a
              href="/platform/audit-trail"
              className="mt-6 inline-flex items-center gap-2 text-sm underline underline-offset-4"
            >
              See the audit trail <ArrowRight className="size-4" />
            </a>
          </Section>
          <Section
            title="Feedback"
            description="State is explicit in words. Reserve color for meaningful feedback; never rely on a dot or color alone. Motion responds to work in progress and respects reduced-motion preferences."
          >
            <div className="space-y-4 text-sm">
              <p className="rounded-sm bg-success-surface px-4 py-3 text-success">
                Approved. Version 3 is available to the workspace.
              </p>
              <p className="rounded-sm bg-warning-surface px-4 py-3 text-warning">
                Needs review. This revision has changed since the last approval.
              </p>
              <p
                role="note"
                className="rounded-sm bg-destructive-surface px-4 py-3 text-destructive"
              >
                Upload failed. The file exceeds the workspace limit.
              </p>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Loading documents…</h3>
                <div aria-hidden="true" className="mt-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium">No documents yet</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Add the contract you want to review. Its revisions will appear here.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setNotice("Preview add-document selected.")}
                >
                  Add document
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
