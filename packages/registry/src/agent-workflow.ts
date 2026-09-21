/** Shared product copy for the matter handoff and connector onboarding. */
export const SUBSCRIPTION_WORKFLOW =
  "Your assistant reads the documents and supplies the analysis. GitMatter saves cited findings, reusable playbooks and proposed Word edits. Accept or reject document changes in GitMatter. No separate LLM API key is needed for this workflow.";

export function matterReviewPrompt(matter: { id: string; name: string }): string {
  return `Use GitMatter to review documents in matter ${JSON.stringify(matter.name)} (matter ID: ${matter.id}). List the documents and ask me which to review if there is more than one. Read the source text and any approved playbook before analysing. If no approved playbook fits, ask for my review criteria. Use your own analysis to populate a cited review, with exact source quotes and an explicit not-found result where evidence is missing. Propose Word edits for my review; leave them pending. Give me links to the review and document in GitMatter. Use my existing AI subscription, without starting separately billed model runs.`;
}
