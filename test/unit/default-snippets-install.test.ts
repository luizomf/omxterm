import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import descriptor from "../../assets/default-snippets.json";
import { version as appVersion } from "../../package.json";
import { claimDefaultSnippets } from "../../src/main/default-snippets";
import {
  defaultSnippetsFixture,
  publicArchive,
} from "../fixtures/default-snippets";

describe("fixed default Snippets installed-package publication", () => {
  it("installs the pinned default through the current host admission", async () => {
    const f = await defaultSnippetsFixture();
    const claim = await f.claim();
    await f.bundle();
    const store = await f.openStore(appVersion);
    expect(await claim.seed!.install(store)).toBeUndefined();
    expect(await store.snapshot()).toEqual([
      expect.objectContaining({
        id: descriptor.id,
        digest: descriptor.sha256,
        enabled: true,
        generation: 1,
      }),
    ]);
  });

  it("installs actual public bytes enabled at generation1 without YAML/code activation; restart/uninstall never restores", async () => {
    const f = await defaultSnippetsFixture();
    const captured = f.capture();
    const claim = await f.claim(captured);
    await f.bundle();
    const store = await f.openStore();
    expect(await claim.seed!.install(store)).toBeUndefined();
    const [entry] = await store.snapshot();
    expect(entry).toMatchObject({
      id: "omxterm.snippets",
      enabled: true,
      generation: 1,
      digest:
        "9f331d1f5ace110db3d72858006cdc1090aa06c3ec4438062cbbba2fd5006c07",
      manifest: { version: "0.1.3", engines: { omxterm: ">=0.24.0-dev.8" } },
    });
    expect((await readdir(f.userData)).sort()).toEqual([
      "Crashpad",
      "extensions",
      "provisioning",
    ]);
    expect(await claim.seed!.install(store)).toBeUndefined();
    expect((await store.snapshot())[0]?.generation).toBe(1);
    await store.uninstall(descriptor.id, 1);
    await store.collect();
    const reopened = await f.openStore();
    expect(await reopened.snapshot()).toEqual([
      expect.objectContaining({
        id: descriptor.id,
        generation: 2,
        digest: null,
        enabled: false,
      }),
    ]);
    expect(
      await claimDefaultSnippets(captured, () => f.userData, f.resources),
    ).toEqual({});
    // Even clearing the entire store is not an enrollment reset.
    await rm(path.join(f.userData, "extensions"), { recursive: true });
    expect(
      await claimDefaultSnippets(captured, () => f.userData, f.resources),
    ).toEqual({});
    f.app.isReady.mockReturnValue(false);
    expect(f.capture()).toBeUndefined();
  });

  it.each(["enabled", "disabled", "tombstone"])(
    "preserves a later existing %s entry exactly",
    async (kind) => {
      const f = await defaultSnippetsFixture();
      const claim = await f.claim();
      const store = await f.openStore();
      await store.install(await readFile(publicArchive), {
        expectedGeneration: 0,
        enabled: kind !== "disabled",
      });
      if (kind === "tombstone") await store.uninstall(descriptor.id, 1);
      const before = await store.snapshot();
      // Deliberately missing resource: existing admission must not even need it.
      expect(await claim.seed!.install(store)).toBeUndefined();
      expect(await store.snapshot()).toEqual(before);
    },
  );

  it.each(["missing", "corrupt", "oversize", "truncated"])(
    "consumes the claim permanently after %s input without publication or retry",
    async (kind) => {
      const f = await defaultSnippetsFixture();
      const captured = f.capture();
      const claim = await f.claim(captured);
      const store = await f.openStore();
      const install = vi.spyOn(store, "install");
      if (kind !== "missing") {
        await f.bundle();
        const bytes = await readFile(publicArchive);
        if (kind === "corrupt") bytes[42] = bytes[42]! ^ 1;
        await writeFile(
          f.archive,
          kind === "oversize"
            ? Buffer.concat([bytes, Buffer.from("x")])
            : kind === "truncated"
              ? bytes.subarray(0, -1)
              : bytes,
        );
      }
      const warning = await claim.seed!.install(store);
      expect(warning).toMatch(/No automatic retry/u);
      expect(warning).not.toContain(f.root);
      expect(install).not.toHaveBeenCalled();
      expect(await store.snapshot()).toEqual([]);
      await f.bundle();
      expect(await claim.seed!.install(store)).toBeUndefined();
      expect(install).not.toHaveBeenCalled();
      expect(
        await claimDefaultSnippets(captured, () => f.userData, f.resources),
      ).toEqual({});
    },
  );

  it("production generation0 admission rejects a stale empty snapshot after concurrent disabled install", async () => {
    const f = await defaultSnippetsFixture();
    const claim = await f.claim();
    await f.bundle();
    const store = await f.openStore();
    vi.spyOn(store, "snapshot").mockImplementationOnce(async () => {
      await store.install(await readFile(publicArchive), {
        expectedGeneration: 0,
        enabled: false,
      });
      return []; // The earlier decision is now stale; production CAS must win.
    });
    const install = vi.spyOn(store, "install");
    expect(await claim.seed!.install(store)).toMatch(/No automatic retry/u);
    expect(install.mock.calls.at(-1)?.[1]).toEqual({
      expectedGeneration: 0,
      enabled: true,
    });
    expect(await store.snapshot()).toEqual([
      expect.objectContaining({ enabled: false, generation: 1 }),
    ]);
  });

  it("uncertain publication is not repeated after restart", async () => {
    const f = await defaultSnippetsFixture();
    const captured = f.capture();
    const claim = await f.claim(captured);
    await f.bundle();
    const store = await f.openStore();
    const publish = store.install.bind(store);
    const install = vi
      .spyOn(store, "install")
      .mockImplementationOnce(async (bytes, options) => {
        await publish(bytes, options);
        throw new Error("simulated lost publication acknowledgement");
      });
    expect(await claim.seed!.install(store)).toMatch(/No automatic retry/u);
    expect((await store.snapshot())[0]?.generation).toBe(1);
    expect(await claim.seed!.install(store)).toBeUndefined();
    expect(install).toHaveBeenCalledTimes(1);
    expect(
      await claimDefaultSnippets(captured, () => f.userData, f.resources),
    ).toEqual({});
  });
});
