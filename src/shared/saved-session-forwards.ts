import {
  isValidHost,
  isValidPort,
  SessionValidationError,
} from "./saved-session-primitives";
import type { PortForward, PortForwardKind } from "./saved-sessions";

const BIND_ADDRESS = /^(?:\*|\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9_.:-]+)$/u;

export function validateForward(
  value: unknown,
  location = "forward",
): PortForward {
  const record = requireRecord(value, location);
  rejectUnknown(record, location, [
    "kind",
    "bindAddress",
    "listenPort",
    "host",
    "hostPort",
  ]);
  const kind = record.kind;
  if (kind !== "local" && kind !== "remote" && kind !== "dynamic")
    throw new SessionValidationError(
      `${location}.kind`,
      "must be local, remote or dynamic",
    );
  if (!isValidPort(record.listenPort))
    throw new SessionValidationError(
      `${location}.listenPort`,
      "must be 1 through 65535",
    );
  if (
    record.bindAddress !== undefined &&
    !(
      typeof record.bindAddress === "string" &&
      BIND_ADDRESS.test(record.bindAddress)
    )
  )
    throw new SessionValidationError(
      `${location}.bindAddress`,
      "must be an address",
    );
  if (kind === "dynamic") {
    if (record.host !== undefined || record.hostPort !== undefined)
      throw new SessionValidationError(
        location,
        "dynamic forwards have no destination",
      );
  } else {
    if (!isValidHost(record.host))
      throw new SessionValidationError(
        `${location}.host`,
        "must be a host name",
      );
    if (!isValidPort(record.hostPort))
      throw new SessionValidationError(
        `${location}.hostPort`,
        "must be 1 through 65535",
      );
  }
  return {
    kind,
    listenPort: record.listenPort,
    ...(record.bindAddress === undefined
      ? {}
      : { bindAddress: record.bindAddress as string }),
    ...(kind === "dynamic"
      ? {}
      : { host: record.host as string, hostPort: record.hostPort as number }),
  };
}

// "L [bind:]port:host:hostport", "R ...", "D [bind:]port" — the form used by
// the session editor's text area. Returns undefined for invalid lines.
export function parseForwardLine(line: string): PortForward | undefined {
  const match = /^([LRD])\s+(.+)$/iu.exec(line.trim());
  if (!match) return undefined;
  const kind: PortForwardKind =
    match[1]!.toUpperCase() === "L"
      ? "local"
      : match[1]!.toUpperCase() === "R"
        ? "remote"
        : "dynamic";
  const parts = splitForwardSpec(match[2]!);
  if (!parts) return undefined;
  const expected = kind === "dynamic" ? [1, 2] : [3, 4];
  if (!expected.includes(parts.length)) return undefined;
  const hasBind = parts.length === expected[1];
  const [bindAddress, rest] = hasBind
    ? [parts[0], parts.slice(1)]
    : [undefined, parts];
  const candidate = {
    kind,
    listenPort: Number(rest[0]),
    ...(bindAddress === undefined ? {} : { bindAddress }),
    ...(kind === "dynamic" ? {} : { host: rest[1], hostPort: Number(rest[2]) }),
  };
  try {
    return validateForward(candidate);
  } catch {
    return undefined;
  }
}

export function formatForward(forward: PortForward): string {
  const prefix =
    forward.kind === "local" ? "L" : forward.kind === "remote" ? "R" : "D";
  const bind = forward.bindAddress ? `${forward.bindAddress}:` : "";
  return forward.kind === "dynamic"
    ? `${prefix} ${bind}${forward.listenPort}`
    : `${prefix} ${bind}${forward.listenPort}:${forward.host}:${forward.hostPort}`;
}

function splitForwardSpec(spec: string): string[] | undefined {
  const parts: string[] = [];
  let remaining = spec.trim();
  while (remaining.length > 0) {
    if (remaining.startsWith("[")) {
      const end = remaining.indexOf("]");
      if (end < 0) return undefined;
      parts.push(remaining.slice(0, end + 1));
      remaining = remaining.slice(end + 1);
      if (remaining.startsWith(":")) remaining = remaining.slice(1);
      else if (remaining.length > 0) return undefined;
      continue;
    }
    const colon = remaining.indexOf(":");
    parts.push(colon < 0 ? remaining : remaining.slice(0, colon));
    remaining = colon < 0 ? "" : remaining.slice(colon + 1);
  }
  return parts.every((part) => part.length > 0) ? parts : undefined;
}

function requireRecord(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new SessionValidationError(location, "must be an object");
  return value as Record<string, unknown>;
}

function rejectUnknown(
  record: Record<string, unknown>,
  location: string,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    throw new SessionValidationError(`${location}.${unknown}`, "is unknown");
}
