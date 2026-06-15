import { describe, it, expect } from "vitest";
import type { AccountDto } from "@koklo/trpc-client";
import type { UserSetupValues } from "@koklo/ui";
import { accountPhase, sidebarUser, toAccountInput } from "./accountModel";

const account: AccountDto = {
  name: "Awa Yade",
  email: "awa@studio.com",
  role: "Designer",
  createdAt: 7,
};

describe("accountPhase", () => {
  it("is ready when an account exists", () => {
    expect(accountPhase(account)).toBe("ready");
  });

  it("needs setup when no account exists", () => {
    expect(accountPhase(null)).toBe("needs-setup");
  });
});

describe("toAccountInput", () => {
  const values: UserSetupValues = {
    name: "Awa Yade",
    email: "awa@studio.com",
    role: "Designer",
  };

  it("maps name, email and role", () => {
    expect(toAccountInput(values)).toEqual({
      name: "Awa Yade",
      email: "awa@studio.com",
      role: "Designer",
    });
  });

  it("turns a blank role into null", () => {
    expect(toAccountInput({ ...values, role: "   " }).role).toBeNull();
  });

  it("drops the avatar file (not persisted in v1)", () => {
    const file = new File([], "a.png");
    const input = toAccountInput({ ...values, avatarFile: file });
    expect("avatarFile" in input).toBe(false);
  });
});

describe("sidebarUser", () => {
  it("uses the account identity when present", () => {
    expect(sidebarUser(account)).toEqual({ name: "Awa Yade", email: "awa@studio.com" });
  });

  it("falls back to a placeholder when no account is set", () => {
    expect(sidebarUser(null)).toEqual({ name: "Koklo User", email: "" });
  });
});
