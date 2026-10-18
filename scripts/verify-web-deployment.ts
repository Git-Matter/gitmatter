import {
  DeploymentVerificationError,
  describeDeploymentObservation,
  verifyWebDeployment,
} from "../packages/core/src/platform/deployment-readiness";

try {
  const [url, expectedRelease, ...extra] = process.argv.slice(2);
  if (!url || !expectedRelease || extra.length)
    throw new DeploymentVerificationError(
      "Usage: bun scripts/verify-web-deployment.ts <readiness-url> <expected-release-sha>"
    );
  const result = await verifyWebDeployment({
    url,
    expectedRelease,
    onObservation: (observation) => console.log(describeDeploymentObservation(observation)),
  });
  console.log(`Web runtime readiness verified at release ${result.release}. Docs remains independent.`);
} catch (error) {
  console.error(
    error instanceof DeploymentVerificationError ? error.message : "Web deployment verification failed."
  );
  process.exitCode = 1;
}
