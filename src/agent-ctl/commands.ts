// omxterm-ctl's commands over the agent API (ADR 0052, docs/dev/agent-api.md):
// argument parsing, finding the grant, and one connection per command. The CLI
// prints what they return; the MCP server wraps the same calls as tools.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AGENT_GRANT_VERSION,
  agentNotGrantedSentence,
  isAgentInstance,
  isAgentPaneId,
  isAgentWindowId,
  isPlainRecord,
  parseAgentPane,
} from "../shared/agent-api";
import { Client, CtlError, EXIT, type Grant } from "./client";

export type Options = {
  command?: string;
  positional: string[];
  text?: string;
  keys: string[];
  enter: boolean;
  wait: boolean;
  idle?: number;
  match?: string;
  timeout?: number;
  after?: number;
  lines?: number;
  screen: boolean;
  window?: number;
  profile?: string;
  json: boolean;
  help: boolean;
  /** How messages name the window choice: `--window`, or MCP's argument. */
  windowName: string;
};

export function parse(argv: readonly string[]): Options {
  const options: Options = {
    positional: [],
    keys: [],
    enter: false,
    wait: false,
    screen: false,
    json: false,
    help: false,
    windowName: "--window",
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
      case "--match":
        options.match = value();
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
      case "--screen":
        options.screen = true;
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

/**
 * `--text -` or `--match -`: the CLI's text from stdin instead of an argument,
 * so no shell or launcher reads it as syntax. Strict UTF-8, without the byte
 * order marks Windows PowerShell puts first and one final line break, which
 * `echo` and every pipe add. MCP passes its text as is and never calls this.
 */
export async function textFromStdin(
  options: Options,
  read: () => Promise<Buffer>,
): Promise<void> {
  const fields = (["text", "match"] as const).filter(
    (field) => options[field] === "-",
  );
  if (fields.length === 0) return;
  if (fields.length > 1)
    throw new CtlError(
      EXIT.usage,
      "Only one of --text and --match can read stdin.",
    );
  const bytes = await read();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new CtlError(EXIT.usage, "The text on stdin isn't UTF-8.");
  }
  options[fields[0]!] = text.replace(/^\uFEFF+/u, "").replace(/\r?\n$/u, "");
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

// The caller's own process, window and pane, inside an OMXTerm pane. Another
// profile than the pane's own looks past it.
function ownPane(options: Options) {
  const own = parseAgentPane(process.env.OMXTERM_PANE);
  if (!own || options.profile === undefined) return own;
  const profile = process.env.OMXTERM_PROFILE;
  return profile !== undefined &&
    path.resolve(options.profile) === path.resolve(profile)
    ? own
    : undefined;
}

/** Said by status and list when no pane can be marked self. */
export const SELF_UNKNOWN =
  "OMXTerm can't tell which pane of this window is yours, so none is marked self; you may be running in one of them.";

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

/**
 * An endpoint a grant file may name. On Windows only OMXTerm's own local pipe
 * name: a planted file can't send the client to another pipe or to a remote
 * host (`\\host\pipe\…` would also offer the user's NTLM credentials).
 */
export function trustedEndpoint(
  endpoint: unknown,
  platform: NodeJS.Platform = process.platform,
): endpoint is string {
  if (typeof endpoint !== "string") return false;
  return (
    platform !== "win32" ||
    /^\\\\\.\\pipe\\omxterm-agent-[0-9a-f]{16}$/u.test(endpoint)
  );
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
    // Windows has no mode bits: the profile's inherited ACL guards the file.
    if (
      !stat.isFile() ||
      (process.platform !== "win32" && (stat.mode & 0o077) !== 0) ||
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
    !trustedEndpoint(value.endpoint) ||
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
  const own = ownPane(options);
  if (own) return own.window;
  const windows = grantedWindows(profile);
  if (windows.length === 0)
    throw new CtlError(EXIT.absent, agentNotGrantedSentence());
  if (windows.length > 1)
    throw new CtlError(
      EXIT.usage,
      `Several windows allow agents (${windows.join(", ")}); pick one with ${options.windowName}.`,
    );
  return windows[0]!;
}

// A pane as `s4`, `3:s4` or as OMXTERM_PANE spells it, `<instance>:3:s4`. The
// window and the instance must be the granted window's and this process's.
export function paneArgument(
  value: string | undefined,
  window: number,
  instance: string,
): string {
  const match = value
    ? /^(?:(?:([0-9a-f]{16}):)?(\d+):)?(s\d+)$/u.exec(value)
    : null;
  if (!match || !isAgentPaneId(match[3]))
    throw new CtlError(EXIT.usage, "Name a pane, such as s1 (see list).");
  if (
    (match[2] !== undefined && Number(match[2]) !== window) ||
    (match[1] !== undefined && match[1] !== instance)
  )
    throw new CtlError(EXIT.usage, "That pane belongs to another window.");
  return match[3]!;
}

/** What a command answers: the text the CLI prints, and its exit status. */
export interface Outcome {
  readonly output: string;
  readonly code: number;
  /** The raw result, for a caller that wants more than the printed text. */
  readonly result?: unknown;
}

const done = (output: string, result?: unknown): Outcome => ({
  output,
  code: EXIT.ok,
  ...(result === undefined ? {} : { result }),
});

/**
 * Runs one command (not help, guide or mcp) on its own connection. Failures
 * throw CtlError. Aborting the signal drops the connection.
 */
export async function execute(
  options: Options,
  signal?: AbortSignal,
): Promise<Outcome> {
  const profile =
    options.profile ?? process.env.OMXTERM_PROFILE ?? defaultProfile();
  if (options.command === "grants") {
    const windows = grantedWindows(profile);
    return done(
      options.json ? JSON.stringify({ windows }) : windows.join("\n"),
      { windows },
    );
  }
  if (
    !["status", "list", "keys", "send", "read", "wait", "press"].includes(
      options.command!,
    )
  )
    throw new CtlError(EXIT.usage, `Unknown command ${options.command}.`);
  // A shell that splits a quoted argument leaves its tail here; typing the
  // head and dropping the rest would run a cut-off command.
  const panes = ["send", "read", "wait"].includes(options.command!) ? 1 : 0;
  if (options.command !== "press" && options.positional.length > panes)
    throw new CtlError(
      EXIT.usage,
      `Unexpected ${JSON.stringify(options.positional[panes])}. Quote the text, or pipe it with --text -.`,
    );

  const window = chooseWindow(options, profile);
  const own = ownPane(options);
  const grant = readGrant(profile, window, own?.instance);
  if (!grant) throw new CtlError(EXIT.absent, agentNotGrantedSentence());
  const client = await Client.connect(grant.endpoint);
  const drop = () => client.destroy();
  if (signal?.aborted) drop();
  else signal?.addEventListener("abort", drop, { once: true });
  try {
    await client.handshake(
      grant,
      own && own.window === window ? own.pane : undefined,
    );
    return await run(
      client,
      options,
      window,
      own !== undefined,
      grant.instance,
    );
  } finally {
    signal?.removeEventListener("abort", drop);
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
type Tab = { tab: string; title: string; selected: boolean; panes: Pane[] };

async function list(
  client: Client,
  options: Options,
  selfKnown: boolean,
): Promise<Outcome> {
  const listed = (await client.request("list")) as { tabs: Tab[] };
  const result = selfKnown ? listed : { ...listed, note: SELF_UNKNOWN };
  if (options.json) return done(JSON.stringify(result), result);
  return done(
    [
      ...result.tabs.flatMap((tab) => [
        [tab.tab, tab.title, ...(tab.selected ? ["selected"] : [])].join("\t"),
        ...tab.panes.map((pane) =>
          [
            `  ${pane.pane}`,
            pane.cols ? `${pane.cols}x${pane.rows}` : "-",
            ...(pane.focused ? ["focused"] : []),
            ...(pane.self ? ["self"] : []),
          ].join("\t"),
        ),
      ]),
      ...(selfKnown ? [] : [SELF_UNKNOWN]),
    ].join("\n"),
    result,
  );
}

type Shortcut = {
  action: string;
  chord: string | null;
  status: "available" | "refused" | "not-yet";
};

// The window's shortcuts: chord, action, and a note for what press won't run.
async function keys(client: Client, options: Options): Promise<Outcome> {
  const result = (await client.request("keys")) as { shortcuts: Shortcut[] };
  if (options.json) return done(JSON.stringify(result), result);
  return done(
    result.shortcuts
      .map((shortcut) =>
        [
          shortcut.chord ?? "-",
          shortcut.action,
          ...(shortcut.status === "available" ? [] : [shortcut.status]),
        ].join("\t"),
      )
      .join("\n"),
    result,
  );
}

async function send(
  client: Client,
  options: Options,
  pane: string,
): Promise<Outcome> {
  const keys = [...options.keys, ...(options.enter ? ["Enter"] : [])];
  if (options.text === undefined && keys.length === 0)
    throw new CtlError(EXIT.usage, "send needs --text, --keys or --enter.");
  const sent = (await client.request("send", {
    pane,
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(keys.length ? { keys } : {}),
  })) as { offset: number };
  // A match is something to wait for.
  if (options.wait || options.match !== undefined)
    return report(
      options,
      await client.request("wait", waitArguments(options, pane, sent.offset)),
    );
  return done(options.json ? JSON.stringify(sent) : "", sent);
}

async function run(
  client: Client,
  options: Options,
  window: number,
  selfKnown: boolean,
  instance: string,
): Promise<Outcome> {
  if (options.command === "status") {
    const result = {
      granted: true,
      window,
      ...(selfKnown ? {} : { note: SELF_UNKNOWN }),
    };
    return done(
      options.json
        ? JSON.stringify(result)
        : [
            `Agents can control and read this OMXTerm window (${window}).`,
            ...(selfKnown ? [] : [SELF_UNKNOWN]),
          ].join("\n"),
      result,
    );
  }
  if (options.command === "list") return list(client, options, selfKnown);
  if (options.command === "keys") return keys(client, options);
  const pane = paneArgument(options.positional[0], window, instance);
  if (options.command === "send") return send(client, options, pane);
  if (options.command === "press") {
    const keys = [...options.positional.slice(1), ...options.keys];
    if (keys.length === 0)
      throw new CtlError(
        EXIT.usage,
        "press needs at least one key, such as Up.",
      );
    const result = (await client.request("press", { pane, keys })) as {
      action?: string;
      pane?: string;
    };
    // A shortcut says which action ran on which pane; keys print nothing.
    return done(
      options.json
        ? JSON.stringify(result)
        : result.action
          ? `${result.action}\t${result.pane}`
          : "",
      result,
    );
  }
  if (options.command === "read") {
    const result = (await client.request("read", {
      pane,
      ...(options.screen ? { source: "screen" } : {}),
      ...(options.lines === undefined ? {} : { lines: options.lines }),
    })) as { text: string };
    return done(options.json ? JSON.stringify(result) : result.text, result);
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
    ...(options.match === undefined ? {} : { match: options.match }),
  };
}

function report(options: Options, value: unknown): Outcome {
  const result = value as { reason: string; exitCode?: number };
  return {
    output: options.json
      ? JSON.stringify(result)
      : result.reason === "exited" && result.exitCode !== undefined
        ? `exited ${result.exitCode}`
        : result.reason,
    code: result.reason === "timeout" ? EXIT.timeout : EXIT.ok,
    result,
  };
}
