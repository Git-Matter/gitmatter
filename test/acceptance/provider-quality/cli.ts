import { readFileSync, statSync } from "node:fs";
import { plan, scenarios } from "./scenarios.ts";
import { scoreObservation } from "./scorer.ts";

const [command, value] = process.argv.slice(2);
try {
  if (command === "plan" && value) console.log(JSON.stringify(plan(value), null, 2));
  else if (command === "score" && value) {
    if (statSync(value).size > 1024 * 1024) throw new Error("observation_too_large");
    const result = scoreObservation(JSON.parse(readFileSync(value, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.technicalChecksPassed) process.exitCode = 1;
  } else {
    console.error(
      `Usage: cli.ts plan <${scenarios.map((scenario) => scenario.id).join("|")}> OR cli.ts score <synthetic-observation.json>`
    );
    process.exitCode = 2;
  }
} catch {
  // Never print input, parsing excerpts, SDK errors, headers or environment values.
  console.error(
    "Provider-quality input rejected. Check the documented synthetic observation shape and size."
  );
  process.exitCode = 2;
}
