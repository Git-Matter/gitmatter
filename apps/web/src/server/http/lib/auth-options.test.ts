import { describe, expect, test } from "vite-plus/test";
import { authRateLimitFromEnv, trustedOriginsFromEnv } from "./auth-options.js";

function env(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe("trustedOriginsFromEnv", () => {
  test("uses BETTER_AUTH_URL as the first trusted origin", () => {
    expect(
      trustedOriginsFromEnv(env({ BETTER_AUTH_URL: "https://app.gitmatter.com/some/path?a=1" }))
    ).toEqual(["https://app.gitmatter.com"]);
  });

  test("adds extra origins, normalizes them, and removes duplicates", () => {
    expect(
      trustedOriginsFromEnv(
        env({
          BETTER_AUTH_URL: "https://app.gitmatter.com",
          BETTER_AUTH_TRUSTED_ORIGINS:
            " https://app.gitmatter.com/again, https://admin.gitmatter.com/path ",
        })
      )
    ).toEqual(["https://app.gitmatter.com", "https://admin.gitmatter.com"]);
  });

  test("ignores invalid and empty values", () => {
    expect(
      trustedOriginsFromEnv(
        env({
          BETTER_AUTH_URL: "not a url",
          BETTER_AUTH_TRUSTED_ORIGINS: " , also bad, http://localhost:4280 ",
        })
      )
    ).toEqual(["http://localhost:4280"]);
  });

  test("returns undefined when no valid origin is configured", () => {
    expect(trustedOriginsFromEnv(env({}))).toBeUndefined();
  });
});

describe("authRateLimitFromEnv", () => {
  test("enables the global auth limiter with stable defaults", () => {
    expect(authRateLimitFromEnv(env({}))).toEqual({
      enabled: true,
      window: 60,
      max: 100,
    });
  });

  test("applies valid env overrides", () => {
    expect(
      authRateLimitFromEnv(
        env({
          AUTH_RATE_LIMIT: "80",
          AUTH_SIGN_IN_RATE_LIMIT: "7",
          AUTH_SIGN_UP_RATE_LIMIT: "4",
          AUTH_PASSWORD_RATE_LIMIT: "2",
        })
      )
    ).toEqual({
      enabled: true,
      window: 60,
      max: 80,
      customRules: {
        "/sign-in/*": { window: 60, max: 7 },
        "/sign-up/*": { window: 60, max: 4 },
        "/request-password-reset": { window: 60, max: 2 },
        "/send-verification-email": { window: 60, max: 2 },
      },
    });
  });

  test("ignores invalid env overrides", () => {
    expect(
      authRateLimitFromEnv(
        env({
          AUTH_RATE_LIMIT: "nope",
          AUTH_SIGN_IN_RATE_LIMIT: "0",
          AUTH_SIGN_UP_RATE_LIMIT: "-1",
          AUTH_PASSWORD_RATE_LIMIT: "",
        })
      )
    ).toEqual({
      enabled: true,
      window: 60,
      max: 100,
    });
  });
});
