import { describe, expect, it } from "vitest";
import {
  generateUserToken,
  userTokenExpiry,
  buildUserActionUrl,
} from "./userAuth";

describe("userAuth helpers", () => {
  it("generateUserToken returns a 64-char hex string", () => {
    const token = generateUserToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateUserToken returns a unique value on each call", () => {
    const a = generateUserToken();
    const b = generateUserToken();
    expect(a).not.toBe(b);
  });

  it("userTokenExpiry('email_verify') is 24 hours in the future", () => {
    const before = Date.now();
    const expiry = userTokenExpiry("email_verify").getTime();
    const after = Date.now();
    const expectedLow = before + 24 * 60 * 60 * 1000;
    const expectedHigh = after + 24 * 60 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(expectedLow);
    expect(expiry).toBeLessThanOrEqual(expectedHigh + 1000);
  });

  it("userTokenExpiry('password_reset') is 30 minutes in the future", () => {
    const before = Date.now();
    const expiry = userTokenExpiry("password_reset").getTime();
    const after = Date.now();
    const expectedLow = before + 30 * 60 * 1000;
    const expectedHigh = after + 30 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(expectedLow);
    expect(expiry).toBeLessThanOrEqual(expectedHigh + 1000);
  });

  it("buildUserActionUrl encodes the token and trims trailing slashes", () => {
    const url = buildUserActionUrl("https://app.tulistica.cr/", "verify-email", "abc/=def");
    expect(url).toBe("https://app.tulistica.cr/verify-email?token=abc%2F%3Ddef");
  });
});
