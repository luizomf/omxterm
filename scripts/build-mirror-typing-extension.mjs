import { build, version as esbuildVersion } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Separate maintainer artifact; never bundled into the terminal. A transported
// Git archive may assert its source commit, recorded distinctly in the receipt.
export async function buildMirrorTypingExtension(output, suppliedCommit) {
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "extensions/mirror-typing/extension.json"),
      "utf8",
    ),
  );
  const commit =
    suppliedCommit ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("Expected a full source commit");
  if (
    !suppliedCommit &&
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8",
    }).trim()
  )
    throw new Error("Commit source changes before building a release artifact");
  const destination = path.resolve(
    output ??
      path.join(
        root,
        `dist/extensions/mirror-typing-${manifest.version}.omxext`,
      ),
  );
  const stage = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-mirror-typing-build-"),
  );
  const published = [];
  try {
    await build({
      absWorkingDir: root,
      entryPoints: ["extensions/mirror-typing/backend.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: path.join(stage, "backend.mjs"),
    });
    await build({
      absWorkingDir: root,
      entryPoints: ["extensions/mirror-typing/view.ts"],
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: path.join(stage, "view.js"),
    });
    // Bundle the real shared Settings controls and tokens, not a copied kit.
    await build({
      absWorkingDir: root,
      entryPoints: ["extensions/mirror-typing/mirror-typing.css"],
      bundle: true,
      outfile: path.join(stage, "mirror-typing.css"),
    });
    for (const name of ["index.html", "NOTICE", "licenses/ashyterm.txt"]) {
      await mkdir(path.dirname(path.join(stage, name)), { recursive: true });
      await copyFile(
        path.join(root, "extensions/mirror-typing", name),
        path.join(stage, name),
      );
    }
    await copyFile(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
    await writeFile(
      path.join(stage, "extension.json"),
      JSON.stringify(manifest),
    );
    const python = execFileSync("python3", ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
    execFileSync(
      "python3",
      [
        "-c",
        `import pathlib,sys,zipfile
source=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'x', compression=zipfile.ZIP_DEFLATED) as archive:
 for name in ['extension.json','backend.mjs','index.html','mirror-typing.css','view.js','LICENSE','NOTICE','licenses/ashyterm.txt']:
  entry=zipfile.ZipInfo(name, (2026,1,1,0,0,0))
  entry.external_attr=0o100600 << 16
  entry.compress_type=zipfile.ZIP_DEFLATED
  archive.writestr(entry, (source/name).read_bytes())
`,
        stage,
        path.join(stage, "archive.omxext"),
      ],
      { stdio: "pipe", timeout: 30_000 },
    );
    const bytes = await readFile(path.join(stage, "archive.omxext"));
    const host = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );
    const receipt = {
      format: 1,
      source: {
        commit,
        identity: suppliedCommit ? "supplied-commit" : "clean-git-head",
        lockSha256: sha256(
          await readFile(path.join(root, "package-lock.json")),
        ),
      },
      tools: { node: process.version, esbuild: esbuildVersion, python },
      builder: { platform: process.platform, arch: process.arch },
      archive: {
        name: path.basename(destination),
        bytes: bytes.length,
        sha256: sha256(bytes),
      },
      manifest,
      qualification: {
        status: "not-run",
        intendedHost: host.version,
        target: "linux-arm64",
      },
    };
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(
      path.join(stage, "archive.omxext"),
      destination,
      constants.COPYFILE_EXCL,
    );
    published.push(destination);
    for (const [suffix, content] of [
      [".sha256", `${receipt.archive.sha256}  ${receipt.archive.name}\n`],
      [".json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]) {
      const file = destination + suffix;
      await writeFile(file, content, { flag: "wx" });
      published.push(file);
    }
    return receipt;
  } catch (error) {
    for (const file of published) await rm(file, { force: true });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length > 4) {
    console.error(
      "Usage: build-mirror-typing-extension.mjs [OUTPUT [SOURCE_COMMIT]]",
    );
    process.exitCode = 1;
  } else {
    try {
      await buildMirrorTypingExtension(process.argv[2], process.argv[3]);
      console.log(
        "Built separate Mirror Typing archive, checksum and unqualified build receipt.",
      );
    } catch {
      console.error(
        "Mirror Typing build failed. Check source identity, dependencies and unused output paths.",
      );
      process.exitCode = 1;
    }
  }
}
