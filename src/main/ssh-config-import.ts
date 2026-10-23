import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  isValidHost,
  isValidJumpHosts,
  isValidPort,
  isValidUser,
} from "../shared/saved-sessions";

export interface SshConfigHost {
  readonly alias: string;
  readonly hostName?: string;
  readonly user?: string;
  readonly port?: number;
  readonly identityFile?: string;
  readonly proxyJump?: string;
  readonly forwardX11?: boolean;
}

export interface SshConfigReader {
  readFile(file: string): Promise<string>;
  readdir(directory: string): Promise<readonly string[]>;
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_INCLUDE_DEPTH = 8;

const defaultReader: SshConfigReader = {
  async readFile(file) {
    const bytes = await readFile(file);
    if (bytes.byteLength > MAX_CONFIG_BYTES)
      throw new Error("ssh config file is too large");
    return bytes.toString("utf8");
  },
  readdir: (directory) => readdir(directory),
};

// Reads concrete Host entries from an OpenSSH client configuration. Wildcard
// and negated patterns are skipped; a Match block stops parsing of its file
// (its conditions cannot be evaluated statically). Include directives are
// followed with a recursion guard. Only the fields OMXTerm stores are kept:
// everything else still applies because sessions run the system ssh client.
export async function readSshConfigHosts(
  configPath: string,
  homeDirectory: string,
  reader: SshConfigReader = defaultReader,
): Promise<readonly SshConfigHost[]> {
  const hosts = new Map<string, SshConfigHost>();
  const visited = new Set<string>();
  await parseFile(configPath, homeDirectory, reader, hosts, visited, 0);
  return [...hosts.values()];
}

async function parseFile(
  file: string,
  homeDirectory: string,
  reader: SshConfigReader,
  hosts: Map<string, SshConfigHost>,
  visited: Set<string>,
  depth: number,
): Promise<void> {
  const resolved = path.resolve(file);
  if (depth > MAX_INCLUDE_DEPTH || visited.has(resolved)) return;
  visited.add(resolved);
  let text: string;
  try {
    text = await reader.readFile(resolved);
  } catch {
    return;
  }
  let current: Array<Record<string, string>> = [];
  let aliases: string[] = [];
  const flush = () => {
    aliases.forEach((alias, index) => {
      if (!hosts.has(alias)) hosts.set(alias, toHost(alias, current[index]!));
    });
    aliases = [];
    current = [];
  };
  for (const line of text.split(/\r?\n/u)) {
    const tokens = tokenize(line);
    if (tokens.length === 0) continue;
    const keyword = tokens[0]!.toLowerCase();
    const values = tokens.slice(1);
    if (keyword === "match") break;
    if (keyword === "host") {
      flush();
      aliases = values.filter((value) => !/[*?!]/u.test(value));
      current = aliases.map(() => ({}));
      continue;
    }
    if (keyword === "include") {
      for (const pattern of values)
        for (const included of await expandInclude(
          pattern,
          resolved,
          homeDirectory,
          reader,
        ))
          await parseFile(
            included,
            homeDirectory,
            reader,
            hosts,
            visited,
            depth + 1,
          );
      continue;
    }
    // ssh uses the first value obtained for each keyword.
    for (const entry of current)
      if (values[0] !== undefined && !(keyword in entry))
        entry[keyword] = values.join(" ");
  }
  flush();
}

function toHost(alias: string, fields: Record<string, string>): SshConfigHost {
  const port = fields.port === undefined ? undefined : Number(fields.port);
  const forwardX11 = fields.forwardx11?.toLowerCase();
  return {
    alias,
    ...(fields.hostname && isValidHost(fields.hostname)
      ? { hostName: fields.hostname }
      : {}),
    ...(fields.user && isValidUser(fields.user) ? { user: fields.user } : {}),
    ...(isValidPort(port) ? { port } : {}),
    ...(fields.identityfile ? { identityFile: fields.identityfile } : {}),
    ...(fields.proxyjump && isValidJumpHosts(fields.proxyjump)
      ? { proxyJump: fields.proxyjump }
      : {}),
    ...(forwardX11 === "yes" || forwardX11 === "true" || forwardX11 === "on"
      ? { forwardX11: true }
      : {}),
  };
}

async function expandInclude(
  pattern: string,
  includingFile: string,
  homeDirectory: string,
  reader: SshConfigReader,
): Promise<string[]> {
  let target = pattern.startsWith("~/")
    ? path.join(homeDirectory, pattern.slice(2))
    : pattern;
  // Relative includes are relative to ~/.ssh, as in ssh_config(5).
  if (!path.isAbsolute(target))
    target = path.join(path.dirname(includingFile), target);
  const directory = path.dirname(target);
  const base = path.basename(target);
  if (!/[*?]/u.test(base)) return [target];
  const expression = new RegExp(
    `^${base
      .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
      .replaceAll("*", ".*")
      .replaceAll("?", ".")}$`,
    "u",
  );
  try {
    return (await reader.readdir(directory))
      .filter((name) => expression.test(name))
      .sort()
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

// ssh_config tokens: whitespace or "=" separated, double quotes group words,
// and "#" starts a comment outside quotes.
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quoted = false;
  let started = false;
  for (const character of line.trim()) {
    if (character === '"') {
      quoted = !quoted;
      started = true;
      continue;
    }
    if (!quoted && character === "#" && !started) break;
    if (
      !quoted &&
      (/\s/u.test(character) || (character === "=" && tokens.length === 0))
    ) {
      if (started) tokens.push(token);
      token = "";
      started = false;
      continue;
    }
    token += character;
    started = true;
  }
  if (started) tokens.push(token);
  return tokens;
}
