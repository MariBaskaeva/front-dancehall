import { describe, expect, it } from "vitest";
import {
  authErrorCopy,
  confirmationError,
  emailError,
  nameError,
  normalizeEmail,
  passwordError,
} from "./auth-forms";
import { ApiError } from "./api";

describe("auth validation boundaries", () => {
  it("trims and normalizes email, retaining plus tags and dots", () => {
    expect(normalizeEmail("  Dancer.Name+steps@Example.com  ")).toBe(
      "dancer.name+steps@example.com",
    );
    expect(emailError("  dancer@example.com  ")).toBeUndefined();
    expect(emailError(`${"a".repeat(242)}@example.com`)).toBeUndefined();
    expect(emailError(`  ${"a".repeat(242)}@example.com  `)).toBeUndefined();
    expect(emailError(`${"a".repeat(243)}@example.com`)).toBeDefined();
    for (const invalid of [
      "",
      "   ",
      "no-at",
      "a@",
      "@example.com",
      "a b@example.com",
      "a@@example.com",
      "a@example",
      "a,b@example.com",
    ])
      expect(emailError(invalid)).toBeDefined();
  });

  it("validates name after trimming with 1–100 Unicode characters", () => {
    expect(nameError("   ")).toBeDefined();
    expect(nameError(" a ")).toBeUndefined();
    expect(nameError(` ${"я".repeat(100)} `)).toBeUndefined();
    expect(nameError("я".repeat(101))).toBeDefined();
    expect(nameError("💃".repeat(100))).toBeUndefined();
  });

  it("validates new passwords with 15–128 characters preserving spaces", () => {
    expect(passwordError("x".repeat(14))).toBeDefined();
    expect(passwordError("x".repeat(15))).toBeUndefined();
    expect(passwordError(" ".repeat(15))).toBeUndefined();
    expect(passwordError("x".repeat(128))).toBeUndefined();
    expect(passwordError("x".repeat(129))).toBeDefined();
    expect(passwordError("💃".repeat(128))).toBeUndefined();
  });

  it("accepts existing short passwords for login but rejects empty or overlong values", () => {
    expect(passwordError("", false)).toBeDefined();
    expect(passwordError(" ", false)).toBeUndefined();
    expect(passwordError("x", false)).toBeUndefined();
    expect(passwordError("x".repeat(128), false)).toBeUndefined();
    expect(passwordError("x".repeat(129), false)).toBeDefined();
  });

  it("compares confirmation without trimming", () => {
    expect(
      confirmationError(" password with spaces ", " password with spaces "),
    ).toBeUndefined();
    expect(
      confirmationError(" password with spaces ", "password with spaces"),
    ).toBeDefined();
  });

  it.each([
    "VALIDATION_ERROR",
    "INVALID_OR_EXPIRED_TOKEN",
    "INVALID_CREDENTIALS",
    "EMAIL_NOT_VERIFIED",
    "AUTHENTICATION_REQUIRED",
    "CSRF_INVALID",
    "UNSUPPORTED_MEDIA_TYPE",
    "TOO_MANY_REQUESTS",
    "INTERNAL_SERVER_ERROR",
  ])("translates %s independently of the backend message", (code) => {
    const message = authErrorCopy(
      new ApiError("http", 400, "Private backend detail", code),
    );
    expect(message).not.toContain("Private backend detail");
    expect(message).toMatch(/[А-Яа-я]/);
  });
});
