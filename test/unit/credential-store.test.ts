import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCredentialStore,
  isCredentialId,
  type SecretCipher,
} from "../../src/main/credential-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-credentials-"));
  roots.push(root);
  return root;
}

// A reversible stand-in for safeStorage that never stores the plaintext.
function fakeCipher(
  backend = "gnome_libsecret",
  available = true,
): SecretCipher {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (text) =>
      Buffer.from([...Buffer.from(text)].map((b) => b ^ 0x5a)),
    decryptString: (bytes) =>
      Buffer.from([...bytes].map((b) => b ^ 0x5a)).toString("utf8"),
  };
}

describe("Credential Store", () => {
  it("accepts only opaque credential identifiers", () => {
    expect(isCredentialId("ai:openai")).toBe(true);
    expect(isCredentialId("session:abc_DEF-1")).toBe(true);
    expect(isCredentialId("session:user@host")).toBe(false);
    expect(isCredentialId("other:x")).toBe(false);
    expect(isCredentialId("ai:")).toBe(false);
  });

  it("stores only ciphertext and round-trips secrets", async () => {
    const root = await directory();
    const store = createCredentialStore(fakeCipher(), root, "linux");
    await store.set("ai:openai", "sk-secret-value");
    const raw = await readFile(path.join(root, "credentials.json"), "utf8");
    expect(raw).not.toContain("sk-secret-value");
    expect(await store.has("ai:openai")).toBe(true);
    expect(await store.get("ai:openai")).toBe("sk-secret-value");
    await store.delete("ai:openai");
    expect(await store.get("ai:openai")).toBeUndefined();
  });

  it("refuses Chromium's plaintext basic_text backend on Linux", async () => {
    const store = createCredentialStore(
      fakeCipher("basic_text"),
      await directory(),
      "linux",
    );
    expect(store.availability()).toEqual({
      available: false,
      reason: "plaintext-backend",
    });
    await expect(store.set("ai:groq", "key")).rejects.toThrow(
      /No secure system keyring/u,
    );
  });

  it("reports the native backend on macOS and Windows", async () => {
    const root = await directory();
    expect(
      createCredentialStore(fakeCipher(), root, "darwin").availability(),
    ).toEqual({ available: true, backend: "keychain" });
    expect(
      createCredentialStore(fakeCipher(), root, "win32").availability(),
    ).toEqual({ available: true, backend: "dpapi" });
    expect(
      createCredentialStore(
        fakeCipher("x", false),
        root,
        "win32",
      ).availability(),
    ).toEqual({ available: false, reason: "unavailable" });
  });

  it("rejects invalid identifiers and empty secrets", async () => {
    const store = createCredentialStore(
      fakeCipher(),
      await directory(),
      "linux",
    );
    await expect(store.set("ai:x", "")).rejects.toThrow(/Invalid secret/u);
    await expect(store.get("../x")).rejects.toThrow(/Invalid credential/u);
  });
});
