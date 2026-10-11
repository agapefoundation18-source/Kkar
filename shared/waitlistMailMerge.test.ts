import { describe, expect, it } from "vitest";
import { mergeWaitlistMessage } from "./waitlistMailMerge";

describe("waitlist mail merge", () => {
  const recipient = {
    email: "rider@example.com",
    joinedAt: "2026-10-11T12:00:00.000Z",
  };

  it("replaces supported per-recipient fields and leaves unrelated template text alone", () => {
    const rendered = mergeWaitlistMessage(
      "Hello {{email}}, you joined on {{joinedDate}}. We will write to {{email}} again.",
      recipient,
    );
    expect(rendered).toContain("Hello rider@example.com");
    expect(rendered).toContain("you joined on ");
    expect(rendered).not.toContain("{{email}}");
  });

  it("rejects invalid recipient dates rather than creating a malformed message", () => {
    expect(() => mergeWaitlistMessage("Hello {{email}}", {
      email: "rider@example.com",
      joinedAt: "not-a-date",
    })).toThrow("invalid joined date");
  });
});
