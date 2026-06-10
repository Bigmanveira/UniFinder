import { describe, expect, it } from "vitest";
import { getPostAuthPath, getRequestedPostAuthPath } from "./postAuthRouting";

describe("post-auth routing", () => {
  it("sends a newly created user to roadmap onboarding", () => {
    expect(getPostAuthPath({
      nextPath: null,
      hasGuestResults: false,
      isNewUser: true,
    })).toBe("/app/roadmap");
  });

  it("sends a returning user to the dashboard", () => {
    expect(getPostAuthPath({
      nextPath: null,
      hasGuestResults: false,
      isNewUser: false,
    })).toBe("/app");
  });

  it("preserves an explicit destination for new and returning users", () => {
    for (const isNewUser of [true, false]) {
      expect(getPostAuthPath({
        nextPath: "/app?tab=billing",
        hasGuestResults: false,
        isNewUser,
      })).toBe("/app?tab=billing");
    }
  });

  it("preserves a valid guest-results flow", () => {
    expect(getPostAuthPath({
      nextPath: null,
      hasGuestResults: true,
      isNewUser: false,
    })).toBe("/results");
  });

  it("does not embed a default route in an auth email link", () => {
    expect(getRequestedPostAuthPath(null, false)).toBeNull();
    expect(getRequestedPostAuthPath("/app/roadmap", false)).toBe("/app/roadmap");
    expect(getRequestedPostAuthPath(null, true)).toBe("/results");
  });
});
