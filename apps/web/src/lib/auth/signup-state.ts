import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@workspace/core";

export const getSignupState = createServerFn({ method: "GET" }).handler(async () => {
  return { open: getEnv("ALLOW_SIGNUPS") !== "false" };
});
