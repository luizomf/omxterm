import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILTIN_COMMANDS } from "../../src/shared/command-builtins";
import { BUILTIN_COMMANDS_PT_BR } from "../../src/shared/command-builtins/pt-BR";
import {
  buildCommand,
  CommandFieldError,
  quoteForShell,
  templatePlaceholders,
  validateCommandDefinition,
  validateCommandLibrary,
  type CommandDefinition,
} from "../../src/shared/commands";
import {
  catalogEntries,
  commandsForPlatform,
  localizeCommand,
  requiredTools,
} from "../../src/renderer/commands/command-catalog";
import { createCommandLibraryService } from "../../src/main/command-library";

const builtin = (id: string) =>
  BUILTIN_COMMANDS.find((item) => item.id === id)!;
const compare = new Intl.Collator("en").compare;

describe("command templates", () => {
  it("quotes free text for POSIX shells and PowerShell", () => {
    expect(quoteForShell("simple-name.txt", "posix")).toBe("simple-name.txt");
    expect(quoteForShell("it's here", "posix")).toBe("'it'\\''s here'");
    expect(quoteForShell("$(rm -rf ~)", "posix")).toBe("'$(rm -rf ~)'");
    expect(quoteForShell("it's here", "powershell")).toBe("'it''s here'");
    expect(quoteForShell("$env:PATH; calc", "powershell")).toBe(
      "'$env:PATH; calc'",
    );
  });

  it("expands AshyTerm's find with switches, choices, prefixes and suffixes", () => {
    expect(
      buildCommand(
        builtin("builtin_find"),
        {
          path: "My Docs",
          depth: false,
          name: "*.log",
          type: "-type f",
          content: "fatal error",
        },
        "posix",
      ),
    ).toBe(
      "find 'My Docs' -maxdepth 1 -name '*.log' -type f -exec grep -l 'fatal error' {} \\;",
    );
    expect(buildCommand(builtin("builtin_find"), {}, "posix")).toBe("find .");
  });

  it("never inserts typed text where an authored option is expected", () => {
    expect(
      buildCommand(
        builtin("builtin_systemctl"),
        { action: "status; reboot", service: "nginx" },
        "posix",
      ),
    ).toBe("systemctl nginx");
  });

  it("quotes each line of a per-line list as its own argument", () => {
    expect(
      buildCommand(
        builtin("builtin_compress"),
        { input: "a file.txt\n\nfolder/\n", output: "out.tar.xz" },
        "posix",
      ),
    ).toBe("tar -cJvf out.tar.xz 'a file.txt' folder/");
  });

  it("enforces required fields and numeric ranges", () => {
    expect(() => buildCommand(builtin("builtin_ping"), {}, "posix")).toThrow(
      CommandFieldError,
    );
    expect(() =>
      buildCommand(
        builtin("builtin_ping"),
        { target: "h", count: "1;ls" },
        "posix",
      ),
    ).toThrow(/number/u);
    expect(() =>
      buildCommand(
        builtin("ssh_copy_id"),
        { target: "u@h", port: "70000" },
        "posix",
      ),
    ).toThrow(/range/u);
    expect(
      buildCommand(
        builtin("win_ping"),
        { target: "example.com", count: "2" },
        "powershell",
      ),
    ).toBe("ping -n 2 example.com");
  });
});

describe("built-in command catalog", () => {
  it("has unique ids, declared platforms and fields matching placeholders", () => {
    expect(new Set(BUILTIN_COMMANDS.map((item) => item.id)).size).toBe(
      BUILTIN_COMMANDS.length,
    );
    for (const command of BUILTIN_COMMANDS) {
      expect(command.platforms?.length, command.id).toBeGreaterThan(0);
      expect(templatePlaceholders(command.template).sort(), command.id).toEqual(
        command.fields.map((field) => field.id).sort(),
      );
      expect(command.execution, command.id).toBe(
        command.fields.length > 0 ? "dialog" : "execute",
      );
    }
  });

  it("ports every AshyTerm built-in", () => {
    for (const id of [
      "builtin_find",
      "builtin_ls",
      "builtin_compress",
      "builtin_extract",
      "builtin_systemctl",
      "builtin_journalctl",
      "builtin_pacman",
      "builtin_ping",
    ])
      expect(
        BUILTIN_COMMANDS.some((item) => item.id === id),
        id,
      ).toBe(true);
  });

  it("offers the same core tasks on every platform", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      const names = new Set(
        commandsForPlatform(platform, {
          custom: [],
          favorites: [],
          hidden: [],
        }).map((command) => command.name),
      );
      for (const task of [
        "List Files",
        "Memory Usage",
        "Disk Space",
        "Top Processes",
        "Ping",
        "System Information",
        "Listening Ports",
      ])
        expect(names.has(task), `${platform}: ${task}`).toBe(true);
    }
  });

  it("translates every built-in name, description, category and field into pt-BR", () => {
    for (const command of BUILTIN_COMMANDS) {
      const overlay = BUILTIN_COMMANDS_PT_BR.commands[command.id];
      expect(overlay, command.id).toBeDefined();
      expect(BUILTIN_COMMANDS_PT_BR.categories[command.category]).toBeDefined();
      for (const field of command.fields)
        expect(
          overlay?.fields?.[field.id],
          `${command.id}.${field.id}`,
        ).toBeDefined();
      const localized = localizeCommand(command, "pt-BR");
      expect(localized.template).toBe(command.template);
    }
  });
});

describe("command catalog view", () => {
  const custom: CommandDefinition = validateCommandDefinition({
    id: "custom_1",
    name: "Deploy",
    description: "Ship it",
    category: "Mine",
    template: "make deploy ENV={env}",
    execution: "dialog",
    fields: [{ id: "env", label: "Environment", type: "text" }],
  });
  const library = {
    custom: [custom],
    favorites: ["builtin_ping"],
    hidden: ["builtin_ls"],
  };

  it("filters by platform, favorites, hidden and search, and reports missing tools", () => {
    const linux = commandsForPlatform("linux", library);
    expect(linux.some((item) => item.id === "win_ping")).toBe(false);
    expect(linux.some((item) => item.id === "custom_1")).toBe(true);
    expect(requiredTools(linux)).toContain("systemctl");
    const query = { search: "", filter: "all", showHidden: false };
    const entries = catalogEntries(
      linux,
      library,
      { ping: false },
      query,
      compare,
    );
    expect(entries.some((entry) => entry.command.id === "builtin_ls")).toBe(
      false,
    );
    expect(
      entries.find((entry) => entry.command.id === "builtin_ping")?.missing,
    ).toEqual(["ping"]);
    expect(
      catalogEntries(
        linux,
        library,
        {},
        { ...query, filter: "favorites" },
        compare,
      ).map((entry) => entry.command.id),
    ).toEqual(["builtin_ping"]);
    expect(
      catalogEntries(
        linux,
        library,
        {},
        { ...query, search: "deploy" },
        compare,
      ).map((entry) => entry.command.id),
    ).toEqual(["custom_1"]);
  });
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("command library service", () => {
  it("stores custom commands, favorites and hidden built-ins and caches PATH lookups", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "omxterm-commands-"));
    roots.push(directory);
    const lookups: string[] = [];
    const service = createCommandLibraryService({
      directory,
      findExecutable: (name) => {
        lookups.push(name);
        return name === "git" ? "/usr/bin/git" : undefined;
      },
    });
    await service.load();
    await service.saveCommand({
      id: "custom_a",
      name: "A",
      description: "",
      category: "",
      template: "echo {x}",
      execution: "dialog",
      fields: [{ id: "x", label: "X", type: "text" }],
    });
    await service.setFavorite("custom_a", true);
    await service.setHidden("builtin_ls", true);
    expect(service.current()).toMatchObject({
      favorites: ["custom_a"],
      hidden: ["builtin_ls"],
      custom: [{ id: "custom_a", category: "Custom" }],
    });
    expect(service.availability(["git", "missing", "bad;name"])).toEqual({
      git: true,
      missing: false,
    });
    service.availability(["git"]);
    expect(lookups).toEqual(["git", "missing"]);
    service.refreshTools();
    service.availability(["git"]);
    expect(lookups).toEqual(["git", "missing", "git"]);
    await service.deleteCommand("custom_a");
    expect(service.current().favorites).toEqual([]);
    await expect(service.saveCommand({ id: "x" })).rejects.toThrow();
  });

  it("validates libraries strictly", () => {
    expect(() =>
      validateCommandLibrary({ custom: [], favorites: ["../x"], hidden: [] }),
    ).toThrow();
    expect(() =>
      validateCommandDefinition({
        id: "a",
        name: "A",
        template: "x",
        execution: "now",
        fields: [],
      }),
    ).toThrow(/execution/u);
  });
});
