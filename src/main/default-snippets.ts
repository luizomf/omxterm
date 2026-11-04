import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import descriptor from "../../assets/default-snippets.json";
import { resolveUserConfigurationPath } from "./user-configuration-path";
import { resolveOperationalLogDirectory } from "./operational-events";
import { readBoundedFile, syncDirectory } from "../installed-packages/archive";
import type { InstalledPackages } from "../installed-packages/installed-packages";

const WARNING =
  "OMXTerm could not provision default Snippets. No automatic retry will occur. Use Settings Extensions to install it deliberately.";
type Profile = Readonly<{
  userData: string;
  config: string;
  state: string;
  matchesCurrent(): boolean;
}>;
type StartupApp = {
  isPackaged: boolean;
  isReady(): boolean;
  getName(): string;
  getPath(name: "appData"): string;
  commandLine: { hasSwitch(name: string): boolean };
};

// ENOENT under a dangling/non-directory ancestor is not fresh-profile proof.
function absent(file: string): boolean {
  let current = file;
  for (;;) {
    try {
      const stat = lstatSync(current);
      if (current === file || !stat.isDirectory() || stat.isSymbolicLink())
        return false;
      if (path.dirname(current) === current) return true;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) return false;
      const parent = path.dirname(current);
      if (parent === current) return false;
    }
    current = path.dirname(current);
  }
}
function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

// First executable main statement. Never resolve userData/sessionData here:
// Electron's getters can create them. Developer startup always opts out.
export function captureDefaultProfile(
  app: StartupApp,
  options: {
    platform?: string;
    architecture?: string;
    environment?: Readonly<Record<string, string | undefined>>;
    homeDirectory?: string;
  } = {},
): Profile | undefined {
  try {
    if (
      !app.isPackaged ||
      process.defaultApp ||
      app.isReady() ||
      app.commandLine.hasSwitch("user-data-dir") ||
      !descriptor.targets.includes(
        `${options.platform ?? process.platform}-${options.architecture ?? process.arch}`,
      )
    )
      return;
    const name = app.getName();
    if (!name || name === "." || name === ".." || /[\\/\x00-\x1f]/u.test(name))
      return;
    const readRoots = () => {
      const home = options.homeDirectory ?? userInfo().homedir;
      const environment = options.environment ?? process.env;
      return {
        userData: path.join(app.getPath("appData"), name),
        config: path.dirname(resolveUserConfigurationPath(environment, home)),
        state: path.dirname(resolveOperationalLogDirectory(environment, home)),
      };
    };
    const profile = readRoots();
    if (
      Object.values(profile).every(
        (root) => path.isAbsolute(root) && absent(root),
      )
    )
      return Object.freeze({
        ...profile,
        matchesCurrent() {
          const current = readRoots();
          return (
            app.isReady() &&
            app.getName() === name &&
            !app.commandLine.hasSwitch("user-data-dir") &&
            current.userData === profile.userData &&
            current.config === profile.config &&
            current.state === profile.state
          );
        },
      });
  } catch {
    /* Ambiguous identity never enrolls an existing profile. */
  }
  return undefined;
}

export type DefaultSnippetsSeed = {
  install(packages: InstalledPackages): Promise<string | undefined>;
};

function seed(resources: string): DefaultSnippetsSeed {
  let consumed = false;
  return {
    async install(packages) {
      if (consumed) return;
      consumed = true;
      try {
        // Tombstones and disabled/installed selections always win, even after
        // collection. Generation 0 below also fences a concurrent manual change.
        if (
          (await packages.snapshot()).some(
            (entry) => entry.id === descriptor.id,
          )
        )
          return;
        const bytes = await readBoundedFile(
          path.join(resources, "bundled-snippets", descriptor.filename),
          descriptor.bytes,
        );
        if (
          bytes.length !== descriptor.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256
        )
          throw new Error("Invalid bundled Snippets");
        await packages.install(bytes, { expectedGeneration: 0, enabled: true });
      } catch {
        return WARNING;
      }
      return undefined;
    },
  };
}

// Claim is consumed before any extraction/publication. A partial witness is
// permanent too; no repair/reset, version-keyed marker or startup retry.
export async function claimDefaultSnippets(
  profile: Profile | undefined,
  actualUserData: () => string,
  resources: string,
): Promise<{ seed?: DefaultSnippetsSeed; warning?: string }> {
  if (!profile) return {};
  try {
    if (!profile.matchesCurrent() || actualUserData() !== profile.userData)
      return {};
    const stat = await lstat(profile.userData);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return {};
    const prior = [
      path.join(profile.config, "config.json"),
      path.join(profile.config, "snippets.yaml"),
      path.join(profile.config, "themes"),
      path.join(profile.userData, "extensions"),
      path.join(profile.userData, "extension-state"),
      path.join(profile.state, "logs"),
    ];
    if (!prior.every(absent)) return {};
    const directory = path.join(profile.userData, "provisioning");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const owner = await lstat(directory);
    if (!owner.isDirectory() || owner.isSymbolicLink()) return {};
    let marker;
    try {
      marker = await open(
        path.join(directory, "default-snippets"),
        "wx",
        0o600,
      );
    } catch (error) {
      if (hasCode(error, "EEXIST")) return {};
      throw error;
    }
    try {
      await marker.writeFile("snippets-default-attempt-v1\n");
      await marker.sync();
    } finally {
      await marker.close();
    }
    await syncDirectory(directory);
    await syncDirectory(profile.userData);
    return { seed: seed(resources) };
  } catch {
    return {
      warning:
        "OMXTerm could not establish default Snippets provisioning. No default package was installed. Use Settings Extensions to install it deliberately.",
    };
  }
}
