import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_TERMINAL_THEME } from "../shared/terminal-theme";
import {
  DEFAULT_USER_CONFIGURATION,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

/** Seed only absent files. Existing configuration opts out of the entire kit. */
export async function createInitialConfigurationKit(
  options: Pick<LoadUserConfigurationOptions, "environment" | "homeDirectory">,
): Promise<string | undefined> {
  const configPath = resolveUserConfigurationPath(
    options.environment,
    options.homeDirectory,
  );
  try {
    try {
      await lstat(configPath);
      return;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    const directory = path.dirname(configPath);
    await mkdir(path.join(directory, "themes"), { recursive: true });
    await publishAbsentJson(
      path.join(directory, "themes", "omtheme.json"),
      DEFAULT_TERMINAL_THEME,
    );
    await publishAbsentJson(path.join(directory, "snippets.json"), {
      version: 1,
      snippets: [
        {
          name: "Hello from OMXTerm",
          description: "Insert a greeting command without pressing Enter.",
          body: "echo Hello from OMXTerm",
          execute: false,
        },
      ],
    });
    const defaults = DEFAULT_USER_CONFIGURATION;
    // Publish config last so its theme already exists. Keep platform-specific
    // shell, font selection and keybind defaults implicit.
    await publishAbsentJson(configPath, {
      version: 1,
      confirmClose: defaults.confirmClose,
      logLevel: defaults.logLevel,
      font: {
        size: defaults.fontSize,
        lineHeight: defaults.fontLineHeight,
        ligatures: defaults.fontLigatures,
      },
      terminal: { padding: defaults.terminalPadding },
      scrollback: { lines: defaults.scrollbackLines },
      keyboard: { optionAsAlt: defaults.optionKeyMode },
      window: {
        alwaysOnTop: defaults.alwaysOnTop,
        blur: defaults.blur,
        transparency: defaults.transparency,
        showTitleBar: defaults.showTitleBar,
        showTabBar: defaults.showTabBar,
      },
      theme: { path: "themes/omtheme.json" },
    });
  } catch {
    return "OMXTerm could not create its initial configuration files. Existing files were not replaced. Check permissions in the configuration directory; normal configuration loading will continue.";
  }
}

async function publishAbsentJson(destination: string, document: unknown) {
  const temporary = path.join(
    path.dirname(destination),
    `.omxterm-${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(document, null, 2)}\n`);
    // A hard link publishes complete bytes atomically without replacing a file,
    // directory or dangling symlink, including during concurrent launches.
    try {
      await link(temporary, destination);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
  } finally {
    try {
      await file.close();
    } finally {
      await unlink(temporary);
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
