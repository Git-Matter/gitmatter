# Template library launch

Status: launch copy prepared. Publication and outreach have not been performed.

## Positioning

**Stop asking which template is current.**

For in-house legal teams maintaining commercial templates in shared folders,
gitmatter provides an owned template library with revision-specific approval,
an approved current Word download, and a history of every change.

Start with templates. Keep your existing document repository for executed agreements.
Template management works without an AI call. Connected agents can read approved
templates and propose permitted draft revisions; a human reviewer approves publication.

Feature page: `/platform/template-library`.
Product entry: Library → Templates.

## Release boundaries

- Original DOCX templates keep an immutable source file. Published downloads
  return the exact approved bytes. Text templates use a clean generated layout.
- Owners and workspace admins delegate template editors and reviewers. Review
  delegation does not grant workspace administration privileges.
- Submission names a reviewer. The reviewer can request changes or approve an
  exact revision. Published access stays unchanged while a new draft is revised.
- Published audience is either the template team/admins or every member of the
  workspace. Sales users must be workspace members. There is no public download
  link or arbitrary organization-wide permission-group system.
- Drafts never replace the published snapshot until approved. Archiving withdraws
  reader access and downloads. Restoring requires fresh approval.
- Downloads include the template name and version. Unsaved input requires an
  explicit discard decision when leaving the editor.
- No Google Drive sync, reusable content-block propagation, or questionnaire-based
  assembly. DOCX content changes use a revised source file, not an in-browser
  Word layout editor.
- No deployment, authenticated browser, pilot, or customer outcome claims until
  those evidence tiers have been verified separately.

## LinkedIn draft

“Which template is current?” should have one answer.

We built a template library in gitmatter around that question:

• A named owner for each template.
• A working draft separate from the approved version.
• Approval tied to the exact revision legal reviewed.
• Original Word templates, with formatting preserved in the approved download.
• Template editors and reviewers without extra workspace admin privileges.
• A record of who changed what, and why.

Legal can keep improving the next draft while sales uses the last approved
version. Retired templates can be withdrawn without losing their history.

Upload your DOCX, assign a reviewer, and keep the approved file available while
the next draft changes. Text templates are supported too. No Drive sync yet,
and no AI call required to manage the library.

If your template process lives in a shared folder today, I'd like to hear how
you decide what is current and who can change it.

[Insert the verified live feature-page URL after deployment.]

## Reddit reply draft

Disclosure: I build gitmatter. Your distinction between a template library and
another repository for executed agreements makes sense.

I'd separate the working draft from the approved current revision, assign an
owner, and give the commercial team a view that only exposes published versions.
Every approval should name the exact revision, so editing the next draft cannot
silently change what sales downloads. Retired templates should be withdrawn
while keeping their history.

We've implemented that workflow in gitmatter, including an audit history,
delegated editors and reviewers, and exact approved Word-file downloads. Uploaded
DOCX formatting is preserved; it does not sync Drive. It can sit alongside an
existing executed-document repository.

Is the harder part for your team controlling who can publish, or finding out
when sales is still using an old copy?

Do not post until the actual client journey is verified on the deployed revision.
Check the community's current rules before posting. Use one disclosed reply;
do not message participants or imply that the original poster endorsed the product.

## Demonstration sequence

1. Upload a fictional styled mutual NDA DOCX, with guidance and workspace access.
2. Delegate an editor and reviewer without making them workspace admins.
3. Submit v1. Request changes, replace the source file, and resubmit for approval.
4. Show a human reviewer approving the exact working revision.
5. As a workspace member, download the current Word template; verify its bytes
   match the published source and its filename identifies the version.
6. Prepare the next draft. Show that the current published download stays intact.
7. Show the dirty-editor discard guard and the version and decision history.
8. Archive the template. Show that reader access and downloads are withdrawn.

Use fictional content. Label local or fixture demonstrations accurately.

## Initial audience and measurement

Audience: in-house legal operations and commercial counsel with a growing
template collection, an existing executed-contract repository, and a sales team
that needs approved starting documents.

Lead with the current-version problem, ownership, and controlled publication.
Use the feature page for discovery and a demonstrated workflow for evaluation.
Publish the website first, then the LinkedIn post, then one relevant disclosed
community reply where permitted. Track feature-page visits, demo requests,
first template publication, and successful member downloads. Treat these as
measurement goals, not implemented analytics or claimed results.
