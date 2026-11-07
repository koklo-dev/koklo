import { describe, expect, it } from "vitest";
import { assertSafeBaseUrl, isPrivateAddress, UnsafeBaseUrlError } from "../src/index.ts";

describe("assertSafeBaseUrl (enregistrement d'une adresse de base)", () => {
  it.each([
    "https://llm.exemple.test/v1",
    "https://llm.exemple.test:443/v1/",
    "https://api.exemple.fr",
    "https://93.184.216.34/v1",
    "https://[2606:2800:220:1::1]/v1",
  ])("accepte %s", (url) => {
    expect(assertSafeBaseUrl(url).protocol).toBe("https:");
  });

  it.each([
    ["http://llm.exemple.test", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["https://a:b@llm.exemple.test", "credentials"],
    ["https://llm.exemple.test:444", "port"],
    ["https://llm.exemple.test:80", "port"],
    ["https://localhost", "host"],
    ["https://x.localhost", "host"],
    ["https://x.local", "host"],
    ["https://x.internal", "host"],
    ["https://x.", "host"],
    ["https://127.0.0.1", "address"],
    ["https://127.1", "address"],
    ["https://2130706433", "address"],
    ["https://0177.0.0.1", "address"],
    ["https://0x7f000001", "address"],
    ["https://0.0.0.0", "address"],
    ["https://169.254.169.254", "address"],
    ["https://100.64.0.1", "address"],
    ["https://192.168.1.1", "address"],
    ["https://172.16.0.1", "address"],
    ["https://172.31.255.255", "address"],
    ["https://[::1]", "address"],
    ["https://[::]", "address"],
    ["https://[::ffff:10.0.0.1]", "address"],
    ["https://[fe80::1]", "address"],
    ["https://[fc00::1]", "address"],
    ["https://[64:ff9b::7f00:1]", "address"],
    ["n'importe quoi", "format"],
    [`https://${"a".repeat(2100)}.test`, "length"],
  ])("refuse %s (%s)", (url, reason) => {
    try {
      assertSafeBaseUrl(url);
      expect.unreachable(url);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeBaseUrlError);
      expect((error as UnsafeBaseUrlError).reason).toBe(reason);
      expect(String(error) + JSON.stringify(error)).not.toContain("llm.exemple");
    }
  });

  it("l'option de test accepte http://127.0.0.1 mais pas http://10.0.0.1", () => {
    expect(
      assertSafeBaseUrl("http://127.0.0.1:4010", { allowInsecureLoopbackForTests: true }).port,
    ).toBe("4010");
    expect(() =>
      assertSafeBaseUrl("http://10.0.0.1", { allowInsecureLoopbackForTests: true }),
    ).toThrow(UnsafeBaseUrlError);
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "172.20.0.1",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd12::1",
    "::ffff:192.168.0.1",
    "ff02::1",
    "2001:db8::1",
  ])("%s est privée", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1::1", "::ffff:8.8.8.8"])(
    "%s est publique",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
  it("une chaîne qui n'est pas une adresse est traitée comme privée (refus par défaut)", () => {
    expect(isPrivateAddress("pas-une-ip")).toBe(true);
  });
});
