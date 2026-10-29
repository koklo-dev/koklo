import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";

const srcDir = resolve(import.meta.dirname, "..", "src");

describe("B9 horloge injectée : aucune lecture du temps système dans src", () => {
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));

  it("ne référence ni Date.now, ni new Date() sans argument, ni performance.now", () => {
    for (const file of files) {
      const source = readFileSync(resolve(srcDir, file), "utf8");
      expect(source, `${file} : Date.now`).not.toMatch(/Date\s*\.\s*now\b/);
      expect(source, `${file} : new Date()`).not.toMatch(/new\s+Date\s*\(\s*\)/);
      expect(source, `${file} : performance.now`).not.toMatch(/performance\s*\.\s*now\b/);
    }
  });

  it("sépare baux, verrous et état de projet en un fichier chacun", () => {
    expect(files).toEqual(expect.arrayContaining(["lease.ts", "lock.ts", "project-state.ts"]));
  });

  it("exporte l'API baux, verrous, état et erreurs typées", () => {
    for (const name of [
      "DEFAULT_LEASE_TTL_MS",
      "acquireLease",
      "heartbeat",
      "release",
      "isActive",
      "activeLeaseFor",
      "releaseExpired",
      "acquireLock",
      "releaseLock",
      "isLockActive",
      "createProjectState",
      "writeProjectState",
      "LeaseAlreadyHeldError",
      "LeaseExpiredError",
      "LeaseNotHeldByError",
      "InvalidLeaseError",
      "LockAlreadyHeldError",
      "NestedLockError",
      "LockNotHeldByError",
      "StaleProjectStateError",
      "InvalidProjectStateVersionError",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });

  it("toute fonction prenant le temps le reçoit en argument (arité)", () => {
    expect(domain.acquireLease.length).toBe(3);
    expect(domain.heartbeat.length).toBe(3);
    expect(domain.activeLeaseFor.length).toBe(3);
    expect(domain.releaseExpired.length).toBe(2);
    expect(domain.acquireLock.length).toBe(3);
  });
});
