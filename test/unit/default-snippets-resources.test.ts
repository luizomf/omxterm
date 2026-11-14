import {
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { FileMatcher } from "app-builder-lib/out/fileMatcher.js";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  defaultSnippetsFixture,
  publicArchive,
} from "../fixtures/default-snippets";
import preparePackageInputs, {
  defaultSnippets,
  prepareDefaultSnippets,
  readDefaultSnippets,
  stageDefaultSnippets,
  verifyDefaultSnippetsResources,
} from "../../scripts/prepare-default-snippets.mjs";
import {
  inspectForbiddenPackagedEntries,
  inspectAsarEntries,
} from "../../scripts/verify-packaged-app.mjs";
import { usesOptionalSnippets } from "../../src/shared/snippets-mode";

async function prepared() {
  const f = await defaultSnippetsFixture();
  await prepareDefaultSnippets(publicArchive, f.root);
  return f;
}

describe("pinned public archive and narrow package resources", () => {
  it("pins actual immutable public0.1 bytes, independent of mutable catalogs and source rebuilds", async () => {
    const bytes = await readDefaultSnippets(publicArchive);
    expect(bytes.length).toBe(82514);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "2ab03c51b5a341323765195eaa459fd94a3c9f61b392719c965ecb60d9819557",
    );
    expect(defaultSnippets).toMatchObject({
      id: "omxterm.snippets",
      version: "0.1.4",
      sourceCommit: "b91350c575641031793b85ef8030ca4eb31f9059",
    });
    for (const platform of ["linux", "darwin", "win32"])
      for (const arch of ["arm64", "x64"])
        expect(defaultSnippets.targets.includes(`${platform}-${arch}`)).toBe(
          usesOptionalSnippets(platform, arch),
        );
  });

  it.each(["linux-arm64", "win32-arm64"])(
    "stages and verifies only exact pinned resource for %s",
    async (target) => {
      const f = await prepared();
      const resources = await stageDefaultSnippets(f.root, target);
      const staged = path.join(resources, "bundled-snippets");
      expect(await readdir(staged)).toEqual([defaultSnippets.filename]);
      if (process.platform !== "win32")
        expect(
          (await stat(path.join(staged, defaultSnippets.filename))).mode &
            0o444,
        ).toBe(0o444);
      await verifyDefaultSnippetsResources(resources, target);
      expect(
        await readFile(path.join(staged, defaultSnippets.filename)),
      ).toEqual(await readFile(publicArchive));
      await writeFile(path.join(staged, "files-0.6.0.omxext"), "other archive");
      await expect(
        verifyDefaultSnippetsResources(resources, target),
      ).rejects.toThrow();
    },
  );

  it.each(["win32-x64", "unknown-x64"])(
    "clears stale same-target archive on unsupported %s even with no input",
    async (target) => {
      const f = await defaultSnippetsFixture();
      const resources = await stageDefaultSnippets(f.root, target);
      const staged = path.join(resources, "bundled-snippets");
      await writeFile(path.join(staged, defaultSnippets.filename), "stale");
      await stageDefaultSnippets(f.root, target);
      expect(await readdir(staged)).toEqual([]);
      await verifyDefaultSnippetsResources(resources, target);
      await expect(
        verifyDefaultSnippetsResources(resources, "linux-arm64"),
      ).rejects.toThrow();
    },
  );

  it("actual concurrent beforePack hooks use target arch, without cross-target staging bleed", async () => {
    const f = await prepared();
    await Promise.all(
      [3, 1].map((arch) =>
        preparePackageInputs({
          electronPlatformName: "win32",
          arch,
          packager: { projectDir: f.root },
        }),
      ),
    );
    await verifyDefaultSnippetsResources(
      path.join(f.root, "dist/default-snippets/win-arm64"),
      "win32-arm64",
    );
    const x64 = path.join(f.root, "dist/default-snippets/win-x64");
    await verifyDefaultSnippetsResources(x64, "win32-x64");
    expect(await readdir(path.join(x64, "bundled-snippets"))).toEqual([]);
    await expect(stageDefaultSnippets(f.root, "../../escape")).rejects.toThrow(
      "Invalid package target",
    );
  });

  it("fails missing/corrupt input and clears stale eligible staging; rejects extra receipts and links", async () => {
    const f = await defaultSnippetsFixture();
    await expect(stageDefaultSnippets(f.root, "linux-arm64")).rejects.toThrow();
    await prepareDefaultSnippets(publicArchive, f.root);
    const resources = await stageDefaultSnippets(f.root, "linux-arm64");
    const input = path.join(
      f.root,
      "assets/default-snippets",
      defaultSnippets.filename,
    );
    const corrupt = await readFile(publicArchive);
    corrupt[42] = corrupt[42]! ^ 1;
    await writeFile(input, corrupt);
    await expect(stageDefaultSnippets(f.root, "linux-arm64")).rejects.toThrow();
    expect(await readdir(path.join(resources, "bundled-snippets"))).toEqual([]);
    await prepareDefaultSnippets(publicArchive, f.root);
    await stageDefaultSnippets(f.root, "linux-arm64");
    await writeFile(
      path.join(
        resources,
        "bundled-snippets",
        `${defaultSnippets.filename}.json`,
      ),
      "receipt",
    );
    await expect(
      verifyDefaultSnippetsResources(resources, "linux-arm64"),
    ).rejects.toThrow();
    const link = path.join(f.root, "linked.omxext");
    await symlink(input, link);
    await expect(readDefaultSnippets(link)).rejects.toThrow();
  });

  it.each(["linux-arm64", "win32-x64"])(
    "rejects unrelated archives elsewhere in resources on %s",
    async (target) => {
      const f = await prepared();
      const resources = await stageDefaultSnippets(f.root, target);
      await writeFile(path.join(resources, "other.omxext"), "not allowed");
      await expect(
        verifyDefaultSnippetsResources(resources, target),
      ).rejects.toThrow("Unexpected extension archive");
    },
  );

  it("explicit input recovery never follows a linked destination", async () => {
    const f = await defaultSnippetsFixture();
    const directory = path.join(f.root, "assets/default-snippets");
    await mkdir(directory, { recursive: true });
    const outside = path.join(f.root, "retain.txt");
    await writeFile(outside, "retain original bytes");
    await symlink(outside, path.join(directory, defaultSnippets.filename));
    await expect(prepareDefaultSnippets(publicArchive, f.root)).rejects.toThrow(
      "Invalid fixed Snippets destination",
    );
    expect(await readFile(outside, "utf8")).toBe("retain original bytes");
  });

  it("allows only the exact external path+target, never an archive inside asar or a sidecar/lookalike", () => {
    const exact = `/resources/bundled-snippets/${defaultSnippets.filename}`;
    const forbidden = [
      exact + ".json",
      exact + ".sha256",
      exact.replace("snippets-0.1.4", "snippets-0.2.0"),
      "/dist/default-snippets/linux-arm64/bundled-snippets/" +
        defaultSnippets.filename,
      exact.replace("/resources/", "/elsewhere/resources/"),
    ];
    expect(
      inspectForbiddenPackagedEntries([exact, ...forbidden], "linux-arm64"),
    ).toEqual(forbidden);
    expect(inspectForbiddenPackagedEntries([exact], "win32-x64")).toEqual([
      exact,
    ]);
    expect(inspectForbiddenPackagedEntries([exact])).toEqual([exact]);
    expect(inspectAsarEntries([exact], "linux", "arm64").forbidden).toContain(
      exact,
    );
    const mac = exact.replace("/resources/", "/Contents/Resources/");
    expect(inspectForbiddenPackagedEntries([mac], "darwin-arm64")).toEqual([]);
    expect(inspectForbiddenPackagedEntries([mac], "darwin-x64")).toEqual([mac]);
  });

  it("actual package filters preserve asar exclusions and copy only one fixed external resource", async () => {
    const configuration = await readFile(
      new URL("../../electron-builder.yml", import.meta.url),
      "utf8",
    );
    expect(configuration).toContain(
      "beforePack: scripts/prepare-default-snippets.mjs",
    );
    for (const suffix of ["", ".json", ".sha256"])
      expect(configuration).toContain(`!dist/**/*.omxext${suffix}`);
    const config = parse(configuration) as {
      extraResources: { from: string; to: string; filter?: string[] }[];
      [key: string]: unknown;
    };
    const rule = config.extraResources.find(
      (item) => item.to === "bundled-snippets",
    )!;
    expect(rule.from).toBe(
      "dist/default-snippets/${os}-${arch}/bundled-snippets",
    );
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const expand = (value: string) =>
      value.replaceAll("${os}", "linux").replaceAll("${arch}", "arm64");
    const source = path.join(root, expand(rule.from));
    const filter = new FileMatcher(
      source,
      source,
      expand,
      rule.filter,
    ).createFilter();
    const regularFile = await stat(publicArchive);
    for (const file of [
      defaultSnippets.filename,
      "files-0.6.0.omxext",
      `${defaultSnippets.filename}.json`,
      `${defaultSnippets.filename}.sha256`,
      `nested/${defaultSnippets.filename}`,
    ])
      expect(filter(path.join(source, file), regularFile), file).toBe(
        file === defaultSnippets.filename,
      );
    for (const target of ["mac", "linux", "win"]) {
      const { files } = config[target] as { files: string[] };
      const asar = new FileMatcher(root, root, expand, files).createFilter();
      expect(
        asar(path.join(source, defaultSnippets.filename), regularFile),
      ).toBe(false);
      expect(asar(fileURLToPath(publicArchive), regularFile)).toBe(false);
    }
  });
});
