import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "../src/components/login-form.tsx";

// Frontière externe : le client Better Auth (réseau + redirection OAuth).
const social = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/auth-client.ts", () => ({ authClient: { signIn: { social } } }));

beforeEach(() => {
  social.mockReset();
  social.mockResolvedValue({});
});

const ID = "01900000-0000-7000-8000-0000000000b1";
const GITHUB = /Continuer avec GitHub/;

async function signInWith(next: string | undefined) {
  render(<LoginForm next={next} />);
  await userEvent.click(screen.getByRole("button", { name: GITHUB }));
}

describe("C3.b/C3.c : LoginForm transmet le retour au callbackURL", () => {
  it("next = /accept-invitation/<uuid> : callbackURL pointe vers l'invitation", async () => {
    await signInWith(`/accept-invitation/${ID}`);
    expect(social).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: `/accept-invitation/${ID}`,
    });
  });

  it("sans next : callbackURL reste /projects", async () => {
    await signInWith(undefined);
    expect(social).toHaveBeenCalledWith({ provider: "github", callbackURL: "/projects" });
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "/members",
    "/accept-invitation/abc",
    "javascript:alert(1)",
  ])("next hostile %s est ignoré : callbackURL = /projects", async (next) => {
    await signInWith(next);
    expect(social).toHaveBeenCalledWith({ provider: "github", callbackURL: "/projects" });
  });
});
