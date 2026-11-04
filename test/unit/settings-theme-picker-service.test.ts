// @vitest-environment jsdom
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  button,
  deferred,
  installSettingsDom,
  open,
} from "../fixtures/settings-dialog-dom";
import type { SettingsResult } from "../../src/shared/settings";

beforeAll(installSettingsDom);
const roots: string[] = [];
afterEach(async () => {
  document.body.replaceChildren();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it.each(["retained", "reopened"] as const)(
  "bounds rapid picker replay to the active save and final selection under a delayed reload (%s view)",
  async (lifetime) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-picker-backlog-"));
    roots.push(root);
    const directory = path.join(root, "omxterm");
    await mkdir(path.join(directory, "themes"), { recursive: true });
    await writeFile(
      path.join(directory, "config.json"),
      JSON.stringify({ version: 1, confirmClose: false }),
    );
    for (const name of ["a", "b"])
      await writeFile(
        path.join(directory, "themes", `${name}.json`),
        JSON.stringify({ ...DEFAULT_TERMINAL_THEME, name }),
      );
    const entered = deferred<void>();
    const resume = deferred<void>();
    const applied: unknown[] = [];
    const reload = vi.fn(async () => {
      const configuration = JSON.parse(
        await readFile(path.join(directory, "config.json"), "utf8"),
      ) as { theme?: { path: string } };
      applied.push(configuration.theme?.path ?? "");
      if (applied.length === 1) {
        entered.resolve();
        await resume.promise;
      }
      return { applied: true as const, notices: [] };
    });
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      reload,
    });
    const changes: Promise<SettingsResult>[] = [];
    const view = await open({
      ...service,
      change: (change) => {
        const result = service.change(change);
        changes.push(result);
        return result;
      },
    });
    const select = (value: string) => {
      const radio = [
        ...document.querySelectorAll<HTMLInputElement>(
          ".settings-themes input",
        ),
      ].find((input) => input.value === value)!;
      radio.click();
      return radio;
    };
    try {
      await vi.waitFor(() =>
        expect(
          document.querySelector('input[value="themes/a.json"]'),
        ).not.toBeNull(),
      );
      select("themes/a.json");
      await entered.promise;
      // Native arrow navigation emits the same radio change route. No browser
      // keyboard behavior is claimed by this jsdom test.
      for (let index = 0; index < 100; index += 1)
        select(index % 2 === 0 ? "themes/b.json" : "themes/a.json");
      const final = select("");
      expect(final.checked).toBe(true);
      expect(final.parentElement?.textContent).toContain("Saving…");
      expect(reload).toHaveBeenCalledOnce();
      let reopened: Promise<void> | undefined;
      if (lifetime === "reopened") {
        button("Close").click();
        // This read must follow the final queued choice, even though its view
        // disappeared before the active reload completed.
        reopened = view.dialog.open();
      }
      resume.resolve();
      const results = await Promise.all(changes);
      await reopened;
      await vi.waitFor(() =>
        expect(view.status()).toBe(lifetime === "retained" ? "Saved." : ""),
      );
      expect(results.map((result) => result.status)).toEqual([
        "saved",
        ...Array<string>(100).fill("superseded"),
        "saved",
      ]);
      expect(applied).toEqual(["themes/a.json", ""]);
      expect(reload).toHaveBeenCalledTimes(2);
      await vi.waitFor(() =>
        expect(
          document.querySelector<HTMLInputElement>(
            '.settings-themes input[value=""]',
          )?.checked,
        ).toBe(true),
      );
      expect(
        JSON.parse(await readFile(path.join(directory, "config.json"), "utf8")),
      ).toEqual({
        version: 1,
        confirmClose: false,
      });
    } finally {
      resume.resolve();
      await Promise.all(changes);
      view.dialog.dispose();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "selects a linked local theme through the real save and reload path without changing the links",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-picker-service-"));
    roots.push(root);
    const logical = path.join(root, "config", "omxterm");
    const managed = path.join(root, "managed");
    const palettes = path.join(root, "palettes");
    await Promise.all([
      mkdir(logical, { recursive: true }),
      mkdir(managed),
      mkdir(palettes),
    ]);
    const configuration = path.join(managed, "config.json");
    const theme = path.join(palettes, "chosen.json");
    const contents = JSON.stringify({
      ...DEFAULT_TERMINAL_THEME,
      name: "Synthetic choice",
    });
    await writeFile(
      configuration,
      JSON.stringify({ version: 1, confirmClose: false }),
    );
    await writeFile(theme, contents);
    await symlink(configuration, path.join(logical, "config.json"), "file");
    await symlink(managed, path.join(logical, "themes"), "dir");
    await symlink(theme, path.join(managed, "linked.json"), "file");
    const reload = vi.fn(async () => ({ applied: true as const, notices: [] }));
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: path.dirname(logical) },
        homeDirectory: root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      reload,
    });
    const view = await open({
      snapshot: service.snapshot,
      themes: service.themes,
      change: service.change,
      saveText: service.saveText,
      changeKeybind: service.changeKeybind,
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector('input[value="themes/linked.json"]'),
      ).not.toBeNull(),
    );
    (
      document.querySelector(
        'input[value="themes/linked.json"]',
      ) as HTMLInputElement
    ).click();
    await vi.waitFor(() => expect(view.status()).toBe("Saved."));
    expect(reload).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(configuration, "utf8"))).toEqual({
      version: 1,
      confirmClose: false,
      theme: { path: "themes/linked.json" },
    });
    expect(
      (await lstat(path.join(logical, "config.json"))).isSymbolicLink(),
    ).toBe(true);
    expect((await lstat(path.join(logical, "themes"))).isSymbolicLink()).toBe(
      true,
    );
    expect(
      (await lstat(path.join(managed, "linked.json"))).isSymbolicLink(),
    ).toBe(true);
    expect(await readFile(theme, "utf8")).toBe(contents);

    (
      document.querySelector(
        '.settings-themes input[value=""]',
      ) as HTMLInputElement
    ).click();
    await vi.waitFor(() =>
      expect(
        (
          document.querySelector(
            '.settings-themes input[value=""]',
          ) as HTMLInputElement
        ).checked,
      ).toBe(true),
    );
    await vi.waitFor(async () =>
      expect(
        (
          JSON.parse(await readFile(configuration, "utf8")) as {
            theme?: unknown;
          }
        ).theme,
      ).toBeUndefined(),
    );
    await vi.waitFor(() =>
      expect(view.query(".settings-themes-message").textContent).not.toContain(
        "Loading themes",
      ),
    );
    await rm(theme);
    (
      document.querySelector(
        'input[value="themes/linked.json"]',
      ) as HTMLInputElement
    ).click();
    await vi.waitFor(() => expect(view.status()).toContain("Not saved"));
    expect(
      (JSON.parse(await readFile(configuration, "utf8")) as { theme?: unknown })
        .theme,
    ).toBeUndefined();
    expect(reload).toHaveBeenCalledTimes(2);
    view.dialog.dispose();
  },
);
