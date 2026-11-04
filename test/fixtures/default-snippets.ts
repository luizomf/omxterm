import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished, vi } from "vitest";
import descriptor from "../../assets/default-snippets.json";
import {
  captureDefaultProfile,
  claimDefaultSnippets,
} from "../../src/main/default-snippets";
import {
  InstalledPackages,
  type LeaseAdapter,
} from "../../src/installed-packages/installed-packages";

export const publicArchive = new URL(
  "../../assets/default-snippets/snippets-0.1.0.omxext",
  import.meta.url,
);

export async function copyDefaultSnippetsResources(
  resources: string,
  target: string,
) {
  await mkdir(resources, { recursive: true });
  if (!descriptor.targets.includes(target)) return;
  const directory = path.join(resources, "bundled-snippets");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, descriptor.filename),
    await readFile(publicArchive),
  );
}

// Deterministic, single-process exclusion. Tests exercise the actual archive,
// filesystem, registry and generation admission, not OS/native lock behavior.
function leases(): LeaseAdapter {
  const held = new Set<string>();
  return {
    async tryAcquire(file) {
      if (held.has(file)) return null;
      held.add(file);
      return {
        async release() {
          held.delete(file);
        },
      };
    },
  };
}

export async function defaultSnippetsFixture() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "omxterm-default-snippets-")),
  );
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const resources = path.join(root, "resources");
  const archive = path.join(resources, "bundled-snippets", descriptor.filename);
  const userData = path.join(root, "config", "omxterm");
  const app = {
    isPackaged: true,
    isReady: vi.fn(() => false),
    getName: vi.fn(() => "omxterm"),
    getPath: vi.fn((_name: "appData") => path.join(root, "config")),
    commandLine: { hasSwitch: vi.fn(() => false) },
  };
  const options = {
    platform: "linux",
    architecture: "arm64",
    homeDirectory: root,
    environment: {
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
  };
  return {
    root,
    resources,
    archive,
    userData,
    app,
    options,
    capture: () => captureDefaultProfile(app, options),
    async claim(profile = captureDefaultProfile(app, options)) {
      // Model native creation by readiness, before the product kit/store.
      await mkdir(path.join(userData, "Crashpad"), { recursive: true });
      app.isReady.mockReturnValue(true);
      return claimDefaultSnippets(profile, () => userData, resources);
    },
    bundle: () => copyDefaultSnippetsResources(resources, "linux-arm64"),
    openStore: () =>
      InstalledPackages.open({
        root: path.join(userData, "extensions"),
        runtime: { appVersion: "0.25.0-dev.8", apiVersion: "0.1.0" },
        leases: leases(),
      }),
  };
}
