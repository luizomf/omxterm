// Host, user, port and target validation shared by Saved Sessions, Quick
// Connect and ssh_config import. A leading "-" is never a host: ssh would
// parse it as an option.
export class SessionValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`${field} ${message}`);
    this.name = "SessionValidationError";
    this.field = field;
  }
}

// Host names, IPv4/IPv6 literals and ssh_config aliases. A leading "-" would
// be parsed by ssh as an option, so it is rejected outright.
const HOST = /^(?:\[[0-9A-Fa-f:.%]+\]|[A-Za-z0-9_.%:-]+)$/u;
const USER = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/u;

export function isValidHost(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !value.startsWith("-") &&
    HOST.test(value)
  );
}

export function isValidUser(value: unknown): value is string {
  return typeof value === "string" && USER.test(value);
}

export function isValidPort(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= 65_535
  );
}

// "[user@]host[:port]" with optional comma-separated hops for ProxyJump.
export function isValidJumpHosts(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024)
    return false;
  return value.split(",").every((hop) => parseSshTarget(hop) !== undefined);
}

export interface SshTarget {
  readonly host: string;
  readonly user?: string;
  readonly port?: number;
}

// Quick Connect syntax: [user@]host[:port], with IPv6 hosts in brackets.
export function parseSshTarget(value: string): SshTarget | undefined {
  const text = value.trim();
  if (text.length === 0 || text.length > 300 || /\s/u.test(text))
    return undefined;
  const at = text.lastIndexOf("@");
  const user = at >= 0 ? text.slice(0, at) : undefined;
  const rest = at >= 0 ? text.slice(at + 1) : text;
  let host = rest;
  let port: number | undefined;
  const bracketed = /^(\[[^\]]+\])(?::(\d+))?$/u.exec(rest);
  if (bracketed) {
    host = bracketed[1]!;
    if (bracketed[2] !== undefined) port = Number(bracketed[2]);
  } else {
    const colon = rest.lastIndexOf(":");
    if (colon > 0 && rest.indexOf(":") === colon) {
      host = rest.slice(0, colon);
      port = Number(rest.slice(colon + 1));
      if (!/^\d+$/u.test(rest.slice(colon + 1))) return undefined;
    }
  }
  if (user !== undefined && !isValidUser(user)) return undefined;
  if (!isValidHost(host)) return undefined;
  if (port !== undefined && !isValidPort(port)) return undefined;
  return {
    host,
    ...(user === undefined ? {} : { user }),
    ...(port === undefined ? {} : { port }),
  };
}
