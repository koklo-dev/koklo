import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  label: "main",
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: mocks.label }),
}));

import { isSplashWindow, revealMainWindow, SPLASH_LABEL } from "./splash";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.label = "main";
});

describe("isSplashWindow", () => {
  it("is true only for the splash window label", () => {
    mocks.label = SPLASH_LABEL;
    expect(isSplashWindow()).toBe(true);
  });

  it("is false for the main window", () => {
    mocks.label = "main";
    expect(isSplashWindow()).toBe(false);
  });
});

describe("revealMainWindow", () => {
  it("invokes the backend finish_boot command", async () => {
    await revealMainWindow();
    expect(mocks.invoke).toHaveBeenCalledWith("finish_boot");
  });

  it("swallows errors when not running under Tauri", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("no tauri runtime"));
    await expect(revealMainWindow()).resolves.toBeUndefined();
  });
});
