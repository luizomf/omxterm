// omxterm-ctl: a small, dependency-free client for OMXTerm's local agent API
// (ADR 0052, docs/dev/agent-api.md). OMXTerm's own runtime runs it in Node
// mode through the launcher that $OMXTERM_CTL names.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AGENT_GRANT_ITEM,
  AGENT_GRANT_VERSION,
  agentNotGrantedSentence,
  isAgentInstance,
  isAgentPaneId,
  isAgentWindowId,
  isPlainRecord,
  parseAgentPane,
} from "../shared/agent-api";
import { Client, CtlError, EXIT, type Grant } from "./client";

const usage = `Usage: omxterm-ctl <command> [options]

Drive a Terminal Window the user allowed (Window > ${AGENT_GRANT_ITEM}).
Inside an OMXTerm pane, run it as "$OMXTERM_CTL"; no options are needed.

Commands:
  status                       Say whether this window allows agents.
  grants                       List the windows of this profile that do.
  list                         List the window's panes.
  send <pane> [--text TEXT] [--keys KEY,...] [--enter]
              [--wait [--idle MS] [--timeout MS]]
                               Type into a pane. Keys: Enter, Tab, Escape,
                               Backspace, Space, Ctrl+A ... Ctrl+Z.
  read <pane> [--lines N]      Print the last N lines (default 200).
  wait <pane> [--after OFFSET] [--idle MS] [--timeout MS]
                               Wait until the pane goes quiet or its program
                               ends. Prints idle, exited or timeout.

Options:
  --window ID      The granted window, when there is more than one.
  --profile DIR    OMXTerm's profile directory, for a non-default profile.
  --json           Print the raw result.

Exit status: 0 done, 1 API error, 2 usage, 3 no grant, 124 wait timeout.
`;

type Options = {
  command?: string;
  positional: string[];
  text?: string;
  keys: string[];
  enter: boolean;
  wait: boolean;
  idle?: number;
  timeout?: number;
  after?: number;
  lines?: number;
  window?: number;
  profile?: string;
  json: boolean;
  help: boolean;
};

function parse(argv: readonly string[]): Options {
  const options: Options = {
    positional: [],
    keys: [],
    enter: false,
    wait: false,
    json: false,
    help: false,
  };
  const number = (name: string, value: string | undefined) => {
    if (value === undefined || !/^\d+$/u.test(value))
      throw new CtlError(EXIT.usage, `${name} needs a whole number.`);
    return Number(value);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined)
        throw new CtlError(EXIT.usage, `${argument} needs a value.`);
      index += 1;
      return next;
    };
    switch (argument) {
      case "--text":
        options.text = value();
        break;
      case "--keys":
        options.keys.push(...value().split(",").filter(Boolean));
        break;
      case "--enter":
        options.enter = true;
        break;
      case "--wait":
        options.wait = true;
        break;
      case "--idle":
        options.idle = number(argument, value());
        break;
      case "--timeout":
        options.timeout = number(argument, value());
        break;
      case "--after":
        options.after = number(argument, value());
        break;
      case "--lines":
        options.lines = number(argument, value());
        break;
      case "--window":
        options.window = number(argument, value());
        break;
      case "--profile":
        options.profile = value();
        break;
      case "--json":
        options.json = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        if (argument.startsWith("--"))
          throw new CtlError(EXIT.usage, `Unknown option ${argument}.`);
        if (options.command === undefined) options.command = argument;
        else options.positional.push(argument);
    }
  }
  return options;
}

function defaultProfile(): string {
  const home = os.homedir();
  if (process.platform === "darwin")
    return path.join(home, "Library", "Application Support", "omxterm");
  if (process.platform === "win32")
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "omxterm",
    );
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "omxterm",
  );
}

// The caller's own process, window and pane, inside an OMXTerm pane.
const ownPane = () => parseAgentPane(process.env.OMXTERM_PANE);

const grantsDirectory = (profile: string) =>
  path.join(profile, "agent-api", "grants");

function grantedWindows(profile: string): number[] {
  let names: string[];
  try {
    names = readdirSync(grantsDirectory(profile));
  } catch {
    return [];
  }
  return names
    .map((name) => /^(\d+)\.json$/u.exec(name)?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number)
    .filter(isAgentWindowId)
    .sort((a, b) => a - b);
}

// Inside a pane, only a grant of this pane's own process counts.
function readGrant(
  profile: string,
  window: number,
  instance: string | undefined,
): Grant | undefined {
  const file = path.join(grantsDirectory(profile), `${window}.json`);
  let content: string;
  try {
    const stat = lstatSync(file);
    // Only the user may read a credential; anything else isn't OMXTerm's.
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())
    )
      return undefined;
    content = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (
    !isPlainRecord(value) ||
    value.version !== AGENT_GRANT_VERSION ||
    value.window !== window ||
    !isAgentInstance(value.instance) ||
    (instance !== undefined && value.instance !== instance) ||
    typeof value.endpoint !== "string" ||
    typeof value.token !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.token)
  )
    return undefined;
  return {
    instance: value.instance,
    window,
    endpoint: value.endpoint,
    token: Buffer.from(value.token, "hex"),
  };
}

function chooseWindow(options: Options, profile: string): number {
  if (options.window !== undefined) return options.window;
  const own = ownPane();
  if (own && options.profile === undefined) return own.window;
  const windows = grantedWindows(profile);
  if (windows.length === 0)
    throw new CtlError(EXIT.absent, agentNotGrantedSentence());
  if (windows.length > 1)
    throw new CtlError(
      EXIT.usage,
      `Several windows allow agents (${windows.join(", ")}); pick one with --window.`,
    );
  return windows[0]!;
}

function paneArgument(options: Options, window: number): string {
  const value = options.positional[0];
  const match = value ? /^(?:(\d+):)?(s\d+)$/u.exec(value) : null;
  if (!match || !isAgentPaneId(match[2]))
    throw new CtlError(EXIT.usage, "Name a pane, such as s1 (see list).");
  if (match[1] !== undefined && Number(match[1]) !== window)
    throw new CtlError(EXIT.usage, "That pane belongs to another window.");
  return match[2]!;
}

function print(text: string) {
  process.stdout.write(text.endsWith("\n") || text === "" ? text : `${text}\n`);
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parse(argv);
  if (options.help || !options.command) {
    process.stdout.write(usage);
    return options.help ? EXIT.ok : EXIT.usage;
  }
  const profile =
    options.profile ?? process.env.OMXTERM_PROFILE ?? defaultProfile();
  if (options.command === "grants") {
    const windows = grantedWindows(profile);
    print(options.json ? JSON.stringify({ windows }) : windows.join("\n"));
    return EXIT.ok;
  }
  if (!["status", "list", "send", "read", "wait"].includes(options.command))
    throw new CtlError(EXIT.usage, `Unknown command ${options.command}.`);

  const window = chooseWindow(options, profile);
  // An explicit --profile looks past the pane's own process.
  const own = options.profile === undefined ? ownPane() : undefined;
  const grant = readGrant(profile, window, own?.instance);
  if (!grant) throw new CtlError(EXIT.absent, agentNotGrantedSentence());
  const client = await Client.connect(grant.endpoint);
  try {
    await client.handshake(
      grant,
      own && own.window === window ? own.pane : undefined,
    );
    return await run(client, options, window);
  } finally {
    client.end();
  }
}

type Pane = {
  pane: string;
  cols?: number;
  rows?: number;
  focused: boolean;
  self: boolean;
};

async function list(client: Client, options: Options) {
  const result = (await client.request("list")) as { panes: Pane[] };
  if (options.json) return print(JSON.stringify(result));
  for (const pane of result.panes)
    print(
      [
        pane.pane,
        pane.cols ? `${pane.cols}x${pane.rows}` : "-",
        ...(pane.focused ? ["focused"] : []),
        ...(pane.self ? ["self"] : []),
      ].join("\t"),
    );
}

async function send(client: Client, options: Options, pane: string) {
  const keys = [...options.keys, ...(options.enter ? ["Enter"] : [])];
  if (options.text === undefined && keys.length === 0)
    throw new CtlError(EXIT.usage, "send needs --text, --keys or --enter.");
  const sent = (await client.request("send", {
    pane,
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(keys.length ? { keys } : {}),
  })) as { offset: number };
  if (options.wait)
    return report(
      options,
      await client.request("wait", waitArguments(options, pane, sent.offset)),
    );
  if (options.json) print(JSON.stringify(sent));
  return EXIT.ok;
}

async function run(
  client: Client,
  options: Options,
  window: number,
): Promise<number> {
  if (options.command === "status") {
    print(
      options.json
        ? JSON.stringify({ granted: true, window })
        : `Agents can control and read this OMXTerm window (${window}).`,
    );
    return EXIT.ok;
  }
  if (options.command === "list") {
    await list(client, options);
    return EXIT.ok;
  }
  const pane = paneArgument(options, window);
  if (options.command === "send") return send(client, options, pane);
  if (options.command === "read") {
    const result = (await client.request("read", {
      pane,
      ...(options.lines === undefined ? {} : { lines: options.lines }),
    })) as { text: string };
    print(options.json ? JSON.stringify(result) : result.text);
    return EXIT.ok;
  }
  return report(
    options,
    await client.request("wait", waitArguments(options, pane, options.after)),
  );
}

function waitArguments(options: Options, pane: string, after?: number) {
  return {
    pane,
    timeoutMs: options.timeout ?? 60_000,
    ...(after === undefined ? {} : { after }),
    ...(options.idle === undefined ? {} : { idleMs: options.idle }),
  };
}

function report(options: Options, value: unknown): number {
  const result = value as { reason: string; exitCode?: number };
  if (options.json) print(JSON.stringify(result));
  else
    print(
      result.reason === "exited" && result.exitCode !== undefined
        ? `exited ${result.exitCode}`
        : result.reason,
    );
  return result.reason === "timeout" ? EXIT.timeout : EXIT.ok;
}

const argv = process.argv.slice(2);
main(argv).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const failure =
      error instanceof CtlError
        ? error
        : new CtlError(EXIT.api, "omxterm-ctl failed unexpectedly.");
    // status answers on stdout either way, so an agent can relay it.
    const output =
      argv[0] === "status" && failure.exitCode === EXIT.absent
        ? process.stdout
        : process.stderr;
    output.write(`${failure.message}\n`);
    process.exitCode = failure.exitCode;
  },
);
