// Why an SSH session ended with ssh's error status (255), read from the tail
// of its final output for the ended banner's Solution dialog. The output is
// display-only evidence: nothing here reaches a command, and actions resolve
// their host from the session definition, never from this text.
export type SshFailure =
  | {
      readonly kind: "host-key-changed";
      readonly fingerprint?: string;
      readonly knownHostsFile?: string;
      readonly line?: number;
    }
  | { readonly kind: "host-key-unverified" }
  | { readonly kind: "authentication" }
  | { readonly kind: "refused" }
  | { readonly kind: "timeout" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "unknown-host" }
  | { readonly kind: "unknown"; readonly detail?: string };

const MAX_DETAIL_LENGTH = 300;
// CSI and OSC sequences, so a colored prompt never hides ssh's wording.
const ESCAPES =
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

export function diagnoseSshFailure(output: string): SshFailure {
  const text = output.replace(ESCAPES, "").replace(/\r/gu, "");
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED/u.test(text)) {
    const fingerprint =
      /key sent by the remote host is\s+(SHA256:[A-Za-z0-9+/=]{20,64})/u.exec(
        text,
      )?.[1];
    const offending = /Offending \w+ key in (.{1,1024}?):(\d{1,9})\s*$/mu.exec(
      text,
    );
    return {
      kind: "host-key-changed",
      ...(fingerprint ? { fingerprint } : {}),
      ...(offending
        ? { knownHostsFile: offending[1]!, line: Number(offending[2]) }
        : {}),
    };
  }
  if (/Host key verification failed/u.test(text))
    return { kind: "host-key-unverified" };
  if (/Permission denied \(|Too many authentication failures/u.test(text))
    return { kind: "authentication" };
  if (/Connection refused/u.test(text)) return { kind: "refused" };
  if (
    /Connection timed out|Operation timed out|timed out during banner exchange/u.test(
      text,
    )
  )
    return { kind: "timeout" };
  if (/No route to host|Network is unreachable/u.test(text))
    return { kind: "unreachable" };
  if (
    /Could not resolve hostname|Name or service not known|nodename nor servname/u.test(
      text,
    )
  )
    return { kind: "unknown-host" };
  const detail = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1)
    ?.slice(0, MAX_DETAIL_LENGTH);
  return { kind: "unknown", ...(detail ? { detail } : {}) };
}

// The user's own known_hosts file, which is the only file OMXTerm offers to
// clean; keys in a system-wide file are left to the administrator.
export function isUserKnownHostsFile(file: string): boolean {
  return /[\\/]\.ssh[\\/]known_hosts$/u.test(file);
}
