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
  timeout?: number;
  after?: number;
  lines?: number;
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

function paneArgument(options: Options, window: number): string {
  const value = options.positional[0];
  const match = value ? /^(?:(\d+):)?(s\d+)$/u.exec(value) : null;
  if (!match || !isAgentPaneId(match[2]))
    throw new CtlError(EXIT.usage, "Name a pane, such as s1 (see list).");
  if (match[1] !== undefined && Number(match[1]) !== window)
    throw new CtlError(EXIT.usage, "That pane belongs to another window.");
  return match[2]!;
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
  if (!["status", "list", "send", "read", "wait"].includes(options.command!))
    throw new CtlError(EXIT.usage, `Unknown command ${options.command}.`);

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
    return await run(client, options, window, own !== undefined);
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

async function list(
  client: Client,
  options: Options,
  selfKnown: boolean,
): Promise<Outcome> {
  const listed = (await client.request("list")) as { panes: Pane[] };
  const result = selfKnown ? listed : { ...listed, note: SELF_UNKNOWN };
  if (options.json) return done(JSON.stringify(result), result);
  return done(
    [
      ...result.panes.map((pane) =>
        [
          pane.pane,
          pane.cols ? `${pane.cols}x${pane.rows}` : "-",
          ...(pane.focused ? ["focused"] : []),
          ...(pane.self ? ["self"] : []),
        ].join("\t"),
      ),
      ...(selfKnown ? [] : [SELF_UNKNOWN]),
    ].join("\n"),
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
  if (options.wait)
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
  const pane = paneArgument(options, window);
  if (options.command === "send") return send(client, options, pane);
  if (options.command === "read") {
    const result = (await client.request("read", {
      pane,
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
