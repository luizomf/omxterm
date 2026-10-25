import {
  createApplicationDocumentStore,
  requireRecord,
  requireString,
  type ApplicationDocumentStore,
} from "./application-data";

// The subset of Electron's safeStorage used here. On macOS it is backed by the
// Keychain, on Windows by DPAPI, and on Linux by the Secret Service (GNOME
// Keyring, KWallet) or Chromium's hard-coded "basic_text" key.
export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export type CredentialAvailability =
  | { readonly available: true; readonly backend: string }
  | {
      readonly available: false;
      readonly reason: "unavailable" | "plaintext-backend";
    };

const MAX_CREDENTIALS = 512;
const MAX_SECRET_LENGTH = 16 * 1024;
const MAX_ENCRYPTED_LENGTH = 64 * 1024;
// Opaque ids name what a secret belongs to without containing the secret or
// any host name: "ai:<provider>" or "session:<saved-session-id>".
const CREDENTIAL_ID = /^(ai|session):[A-Za-z0-9_-]{1,64}$/u;

export function isCredentialId(value: unknown): value is string {
  return typeof value === "string" && CREDENTIAL_ID.test(value);
}

export class CredentialStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialStoreError";
  }
}

export interface CredentialStore {
  availability(): CredentialAvailability;
  has(id: string): Promise<boolean>;
  // Every stored id, never a secret.
  ids(): Promise<readonly string[]>;
  get(id: string): Promise<string | undefined>;
  set(id: string, secret: string): Promise<void>;
  delete(id: string): Promise<void>;
}

type EncryptedEntries = Readonly<Record<string, string>>;

export function createCredentialStore(
  cipher: SecretCipher,
  directory: string,
  platform: string,
): CredentialStore {
  const document: ApplicationDocumentStore<EncryptedEntries> =
    createApplicationDocumentStore(
      {
        fileName: "credentials.json",
        version: 1,
        empty: () => ({}),
        validate(value) {
          const record = requireRecord(value, "credentials");
          const entries = Object.entries(record);
          if (entries.length > MAX_CREDENTIALS)
            throw new TypeError("credentials has too many entries");
          return Object.fromEntries(
            entries.map(([id, encrypted]) => {
              if (!isCredentialId(id))
                throw new TypeError("credentials has an invalid id");
              return [
                id,
                requireString(encrypted, "credential", MAX_ENCRYPTED_LENGTH),
              ];
            }),
          );
        },
      },
      { directory },
    );

  const availability = (): CredentialAvailability => {
    if (!cipher.isEncryptionAvailable())
      return { available: false, reason: "unavailable" };
    const backend =
      platform === "linux"
        ? (cipher.getSelectedStorageBackend?.() ?? "unknown")
        : platform === "darwin"
          ? "keychain"
          : platform === "win32"
            ? "dpapi"
            : "unknown";
    // Chromium's basic_text backend encrypts with a constant key: storing a
    // secret there would be plaintext with extra steps, so OMXTerm refuses.
    if (backend === "basic_text" || backend === "unknown")
      return { available: false, reason: "plaintext-backend" };
    return { available: true, backend };
  };

  const requireAvailable = () => {
    const state = availability();
    if (!state.available)
      throw new CredentialStoreError(
        state.reason === "plaintext-backend"
          ? "No secure system keyring is available to protect secrets"
          : "System secret storage is unavailable",
      );
  };
  const requireId = (id: string) => {
    if (!isCredentialId(id))
      throw new CredentialStoreError("Invalid credential identifier");
  };
  const entries = async () => (await document.load()).value;
  // Writes rewrite the whole file, so they run one at a time.
  let writes: Promise<unknown> = Promise.resolve();
  const serialized = (write: () => Promise<void>): Promise<void> => {
    const run = writes.then(write, write);
    writes = run.catch(() => {});
    return run;
  };

  return {
    availability,
    async has(id) {
      requireId(id);
      return Object.hasOwn(await entries(), id);
    },
    async ids() {
      return Object.keys(await entries());
    },
    async get(id) {
      requireId(id);
      const encrypted = (await entries())[id];
      if (encrypted === undefined) return undefined;
      requireAvailable();
      try {
        return cipher.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        throw new CredentialStoreError("The stored secret could not be read");
      }
    },
    async set(id, secret) {
      requireId(id);
      if (
        typeof secret !== "string" ||
        secret.length === 0 ||
        secret.length > MAX_SECRET_LENGTH
      )
        throw new CredentialStoreError("Invalid secret");
      requireAvailable();
      const encrypted = cipher.encryptString(secret).toString("base64");
      await serialized(async () =>
        document.save({ ...(await entries()), [id]: encrypted }),
      );
    },
    async delete(id) {
      requireId(id);
      await serialized(async () => {
        const current = await entries();
        if (!Object.hasOwn(current, id)) return;
        const { [id]: _removed, ...rest } = current;
        await document.save(rest);
      });
    },
  };
}
