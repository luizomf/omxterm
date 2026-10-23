export type ApplicationDataDocumentName =
  | "sessions"
  | "credentials"
  | "commands"
  | "highlights"
  | "workspace"
  | "assistant";

const applicationDataDocuments: readonly ApplicationDataDocumentName[] = [
  "sessions",
  "credentials",
  "commands",
  "highlights",
  "workspace",
  "assistant",
];

// An Application Data document could not be used and was replaced by its
// empty state (corrupt files are quarantined, never overwritten).
export interface ApplicationDataRecoveredEvent {
  readonly name: "application-data.recovered";
  readonly document: ApplicationDataDocumentName;
  readonly reason: "unreadable" | "too-large" | "invalid" | "newer-version";
}

const recoveryReasons = ["unreadable", "too-large", "invalid", "newer-version"];

// "application-data.recovered" names only the document and a fixed reason:
// never a path, file contents or what the document held.
export function isApplicationDataEvent(
  value: Record<string, unknown>,
): boolean {
  const keys = Object.keys(value).sort().join(",");
  return (
    value.name === "application-data.recovered" &&
    keys === "document,name,reason" &&
    applicationDataDocuments.includes(
      value.document as ApplicationDataDocumentName,
    ) &&
    recoveryReasons.includes(value.reason as string)
  );
}
