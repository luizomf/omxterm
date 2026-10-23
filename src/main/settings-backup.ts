import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type ScryptOptions,
} from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  MAX_APPLICATION_DATA_BYTES,
  writeAtomically,
} from "./application-data";

// A settings backup is one passphrase-encrypted JSON file holding the user
// configuration, snippets, themes and Application Data documents as text.
// Credentials are never included: the Credential Store is bound to this
// device's keychain.
export const BACKUP_FORMAT = "omxterm-settings-backup";
export const BACKUP_EXTENSION = "omxbackup";
export const MAX_BACKUP_BYTES = 48 * 1024 * 1024;
export const MIN_PASSPHRASE_LENGTH = 8;
const MAX_PASSPHRASE_LENGTH = 1024;
const MAX_THEMES = 64;
const KEY_LENGTH = 32;
// Interactive-strength scrypt; the cost is stored so it can be raised later.
const KDF = { N: 2 ** 17, r: 8, p: 1 } as const;
const MAX_KDF_MEMORY = 256 * 1024 * 1024;

export const USER_FILES = ["config.json", "snippets.json"] as const;
export const APPLICATION_DATA_FILES = [
  "sessions.json",
  "highlights.json",
  "commands.json",
] as const;
const THEME_FILE = /^themes\/[A-Za-z0-9][A-Za-z0-9._ -]{0,127}\.json$/u;

export function isBackupFileName(name: string): boolean {
  return (
    (USER_FILES as readonly string[]).includes(name) ||
    (APPLICATION_DATA_FILES as readonly string[]).includes(name) ||
    (THEME_FILE.test(name) && !name.includes(".."))
  );
}

export class BackupError extends Error {
  readonly reason: "passphrase" | "invalid" | "too-large" | "newer-version";

  constructor(reason: BackupError["reason"], message: string) {
    super(message);
    this.name = "BackupError";
    this.reason = reason;
  }
}

// File text by path relative to the configuration directory.
export interface BackupContents {
  readonly createdAt: string;
  readonly files: Readonly<Record<string, string>>;
}

export function validatePassphrase(passphrase: unknown): string {
  if (
    typeof passphrase !== "string" ||
    passphrase.length < MIN_PASSPHRASE_LENGTH ||
    passphrase.length > MAX_PASSPHRASE_LENGTH
  )
    throw new BackupError(
      "passphrase",
      `The passphrase must have at least ${MIN_PASSPHRASE_LENGTH} characters`,
    );
  return passphrase;
}

export async function collectBackup(
  directory: string,
  now: () => Date = () => new Date(),
): Promise<BackupContents> {
  const themes = (await readdir(path.join(directory, "themes")).catch(() => []))
    .map((name) => `themes/${name}`)
    .filter(isBackupFileName)
    .sort();
  if (themes.length > MAX_THEMES)
    throw new BackupError("too-large", `More than ${MAX_THEMES} theme files`);
  const files: Record<string, string> = {};
  for (const name of [...USER_FILES, ...APPLICATION_DATA_FILES, ...themes]) {
    const text = await readText(path.join(directory, name));
    if (text !== undefined) files[name] = text;
  }
  return { createdAt: now().toISOString(), files };
}

async function readText(file: string): Promise<string | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(file);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
  if (bytes.byteLength > MAX_APPLICATION_DATA_BYTES)
    throw new BackupError("too-large", `${path.basename(file)} is too large`);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

const deriveKey = (
  passphrase: string,
  salt: Uint8Array,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(
      passphrase.normalize("NFC"),
      salt,
      KEY_LENGTH,
      { ...options, maxmem: MAX_KDF_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );

// The header is authenticated with the data, so its parameters cannot be
// swapped without failing decryption.
const headerText = (kdf: { N: number; r: number; p: number }) =>
  `${BACKUP_FORMAT};1;scrypt;${kdf.N};${kdf.r};${kdf.p};aes-256-gcm`;

export async function encryptBackup(
  contents: BackupContents,
  passphrase: string,
): Promise<Buffer> {
  validatePassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, KDF);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(headerText(KDF)));
  const plaintext = JSON.stringify({ version: 1, ...contents });
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const envelope = {
    format: BACKUP_FORMAT,
    version: 1,
    kdf: { name: "scrypt", ...KDF, salt: salt.toString("base64") },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    },
    data: data.toString("base64"),
  };
  return Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

export async function decryptBackup(
  bytes: Uint8Array,
  passphrase: string,
): Promise<BackupContents> {
  validatePassphrase(passphrase);
  const envelope = parseEnvelope(bytes);
  const key = await deriveKey(passphrase, envelope.salt, envelope.kdf);
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
  decipher.setAAD(Buffer.from(headerText(envelope.kdf)));
  decipher.setAuthTag(envelope.tag);
  let plaintext: string;
  try {
    plaintext = Buffer.concat([
      decipher.update(envelope.data),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new BackupError(
      "passphrase",
      "The passphrase is wrong or the backup is damaged",
    );
  }
  try {
    return validateContents(JSON.parse(plaintext) as unknown);
  } catch (cause) {
    if (cause instanceof BackupError) throw cause;
    throw invalid("contents");
  }
}

const invalid = (detail: string) =>
  new BackupError("invalid", `This is not an OMXTerm backup (${detail})`);

function parseEnvelope(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_BACKUP_BYTES)
    throw new BackupError("too-large", "The backup file is too large");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid("not JSON");
  }
  const envelope = record(value, "envelope");
  if (envelope.format !== BACKUP_FORMAT) throw invalid("format");
  if (envelope.version !== 1)
    throw Number.isInteger(envelope.version) && (envelope.version as number) > 1
      ? new BackupError(
          "newer-version",
          "The backup was made by a newer OMXTerm",
        )
      : invalid("version");
  const kdf = record(envelope.kdf, "kdf");
  const cipher = record(envelope.cipher, "cipher");
  if (kdf.name !== "scrypt" || cipher.name !== "aes-256-gcm")
    throw invalid("algorithm");
  // Bounded costs keep a crafted file from exhausting memory or time.
  const N = kdf.N as number;
  if (
    !Number.isInteger(N) ||
    N < 2 ** 14 ||
    N > 2 ** 20 ||
    (N & (N - 1)) !== 0 ||
    !Number.isInteger(kdf.r) ||
    (kdf.r as number) < 1 ||
    (kdf.r as number) > 16 ||
    !Number.isInteger(kdf.p) ||
    (kdf.p as number) < 1 ||
    (kdf.p as number) > 4
  )
    throw invalid("key parameters");
  return {
    kdf: { N, r: kdf.r as number, p: kdf.p as number },
    salt: base64(kdf.salt, 16),
    iv: base64(cipher.iv, 12),
    tag: base64(cipher.tag, 16),
    data: base64(envelope.data),
  };
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid(location);
  return value as Record<string, unknown>;
}

function base64(value: unknown, length?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value))
    throw invalid("encoding");
  const bytes = Buffer.from(value, "base64");
  if (length !== undefined && bytes.byteLength !== length)
    throw invalid("encoding");
  return bytes;
}

function validateContents(value: unknown): BackupContents {
  const contents = record(value, "contents");
  if (contents.version !== 1) throw invalid("contents version");
  if (
    typeof contents.createdAt !== "string" ||
    Number.isNaN(Date.parse(contents.createdAt))
  )
    throw invalid("date");
  const files = record(contents.files, "files");
  const names = Object.keys(files);
  if (
    names.length >
    USER_FILES.length + APPLICATION_DATA_FILES.length + MAX_THEMES
  )
    throw invalid("too many files");
  for (const name of names) {
    const text = files[name];
    if (
      !isBackupFileName(name) ||
      typeof text !== "string" ||
      Buffer.byteLength(text, "utf8") > MAX_APPLICATION_DATA_BYTES
    )
      throw invalid("file entry");
  }
  return {
    createdAt: contents.createdAt,
    files: files as Record<string, string>,
  };
}

export type RestoreTargets = Readonly<
  Record<
    (typeof APPLICATION_DATA_FILES)[number],
    (bytes: Uint8Array) => () => Promise<unknown>
  >
>;

// Applies a backup. Application Data documents are all decoded before any
// file changes, so an invalid one leaves everything as it was; they are then
// replaced through their services, and user files are written atomically.
// Files missing from the backup are kept.
export async function restoreBackup(
  contents: BackupContents,
  directory: string,
  targets: RestoreTargets,
): Promise<{ readonly restored: number }> {
  const commits = APPLICATION_DATA_FILES.filter(
    (name) => contents.files[name] !== undefined,
  ).map((name) => {
    try {
      return targets[name](Buffer.from(contents.files[name]!, "utf8"));
    } catch (cause) {
      throw new BackupError(
        "invalid",
        `${name} in the backup is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  });
  const userFiles = Object.keys(contents.files).filter(
    (name) => !(APPLICATION_DATA_FILES as readonly string[]).includes(name),
  );
  for (const name of userFiles)
    await writeAtomically(
      { mkdir, open, rename, rm },
      path.join(directory, ...name.split("/")),
      contents.files[name]!,
    );
  for (const commit of commits) await commit();
  return { restored: userFiles.length + commits.length };
}
