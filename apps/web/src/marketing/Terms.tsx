import { LegalPage } from "./LegalPage";

// Cloud-only marketing page. DRAFT boilerplate — review with counsel before launch.
export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        This is a <strong>draft</strong> outline of the terms governing use of gitcounsel. It is not
        yet binding and must be reviewed by counsel before any production launch.
      </p>
      <h2>Not legal advice</h2>
      <p>
        gitcounsel is software for organizing and AI-assisting legal work. AI-generated text,
        redlines, and document drafts are starting points, not legal advice, and are not a
        substitute for review by a qualified lawyer. You are responsible for verifying all output.
      </p>
      <h2>Your content</h2>
      <p>
        You retain ownership of the documents and data you upload. You are responsible for having
        the rights to upload and process that content.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Do not use gitcounsel for unlawful purposes or to upload content you are not authorized to
        process.
      </p>
      <h2>Availability</h2>
      <p>The service is provided “as is” without warranties during this pre-launch period.</p>
    </LegalPage>
  );
}
