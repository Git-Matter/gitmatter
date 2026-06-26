import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { fonts, palette } from "./theme.js";

export interface EmailLayoutProps {
  /** Inbox preview line (hidden in the body). */
  preview: string;
  /** Serif headline at the top of the card. */
  heading: string;
  /** Body paragraphs above the call to action. */
  children: ReactNode;
  /** Primary action: a labelled button plus the raw URL fallback. */
  action: { label: string; url: string };
  /** Closing line under the action (e.g. the "ignore this" reassurance). */
  footnote: string;
  /** "ink" (default) or "danger" for destructive acts like account deletion. */
  tone?: "ink" | "danger";
}

// Shared shell for every transactional email: warm-paper canvas, a single raised
// card, the boxed commit-node wordmark, serif headline, sans body, one button.
// The Quiet Chambers, delivered to an inbox.
export function EmailLayout({
  preview,
  heading,
  children,
  action,
  footnote,
  tone = "ink",
}: EmailLayoutProps) {
  const accent = tone === "danger" ? palette.danger : palette.ink;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={card}>
            <Row>
              <Column style={{ width: "30px" }}>
                <div style={mark}>
                  <div style={markDot} />
                </div>
              </Column>
              <Column>
                <Text style={wordmark}>gitmatter</Text>
              </Column>
            </Row>

            <Heading style={{ ...title, color: accent }}>{heading}</Heading>

            {children}

            <Section style={{ textAlign: "center", margin: "28px 0 8px" }}>
              <Button style={{ ...button, backgroundColor: accent }} href={action.url}>
                {action.label}
              </Button>
            </Section>

            <Text style={fallbackLabel}>Or paste this link into your browser:</Text>
            <Section style={linkWell}>
              <Link href={action.url} style={linkText}>
                {action.url}
              </Link>
            </Section>

            <Text style={footnoteText}>{footnote}</Text>

            <Hr style={divider} />
            <Text style={footer}>
              gitmatter — audited legal AI any agent plugs into. Every change a commit with author,
              message, and blame.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// A single body paragraph in the brand's sans body style. Templates compose
// these between the heading and the button.
export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={paragraph}>{children}</Text>;
}

const body: React.CSSProperties = {
  backgroundColor: palette.paper,
  margin: 0,
  padding: "32px 0",
  fontFamily: fonts.sans,
};

const container: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "0 16px",
};

const card: React.CSSProperties = {
  backgroundColor: palette.card,
  border: `1px solid ${palette.hairline}`,
  borderRadius: "14px",
  padding: "32px",
  boxShadow: "0 1px 2px rgba(21, 24, 30, 0.05)",
};

const mark: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "6px",
  backgroundColor: palette.ink,
  textAlign: "center",
  lineHeight: "24px",
};

const markDot: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: palette.paper,
  display: "inline-block",
  verticalAlign: "middle",
};

const wordmark: React.CSSProperties = {
  fontFamily: fonts.serif,
  fontSize: "20px",
  fontWeight: 600,
  color: palette.ink,
  letterSpacing: "-0.01em",
  margin: 0,
  lineHeight: "24px",
};

const title: React.CSSProperties = {
  fontFamily: fonts.serif,
  fontSize: "22px",
  fontWeight: 500,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  margin: "28px 0 16px",
};

const paragraph: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "14px",
  lineHeight: 1.6,
  color: palette.ink,
  margin: "0 0 14px",
};

const button: React.CSSProperties = {
  color: palette.paper,
  fontFamily: fonts.sans,
  fontSize: "14px",
  fontWeight: 600,
  borderRadius: "8px",
  padding: "11px 20px",
  textDecoration: "none",
  display: "inline-block",
};

const fallbackLabel: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "12px",
  fontWeight: 500,
  color: palette.inkSoft,
  margin: "16px 0 6px",
  letterSpacing: "0.01em",
};

const linkWell: React.CSSProperties = {
  backgroundColor: palette.sunken,
  borderRadius: "8px",
  padding: "10px 12px",
};

const linkText: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "12px",
  color: palette.link,
  wordBreak: "break-all",
  textDecoration: "none",
};

const footnoteText: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "13px",
  lineHeight: 1.6,
  color: palette.inkSoft,
  margin: "18px 0 0",
};

const divider: React.CSSProperties = {
  borderColor: palette.hairline,
  margin: "24px 0 16px",
};

const footer: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "12px",
  lineHeight: 1.5,
  color: palette.inkSoft,
  margin: 0,
};
