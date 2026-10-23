import type { Readable, Writable } from "node:stream";

// A minimal SFTP version 3 client (draft-ietf-secsh-filexfer-02), spoken over
// the stdin/stdout of `ssh -s <host> sftp`, as OpenSSH's own sftp does. Paths
// travel as length-prefixed protocol strings, so nothing is ever parsed by a
// shell or by sftp's batch language.

const PACKET = {
  init: 1,
  version: 2,
  open: 3,
  close: 4,
  read: 5,
  write: 6,
  lstat: 7,
  opendir: 11,
  readdir: 12,
  remove: 13,
  mkdir: 14,
  rmdir: 15,
  realpath: 16,
  stat: 17,
  rename: 18,
  status: 101,
  handle: 102,
  data: 103,
  name: 104,
  attrs: 105,
} as const;

const STATUS = { ok: 0, eof: 1, noSuchFile: 2, permissionDenied: 3 } as const;

const ATTR = {
  size: 0x1,
  uidgid: 0x2,
  permissions: 0x4,
  acmodtime: 0x8,
  extended: 0x80000000,
} as const;

export const OPEN_FLAGS = {
  read: 0x1,
  write: 0x2,
  create: 0x8,
  truncate: 0x10,
  exclusive: 0x20,
} as const;

// OpenSSH's sftp-server accepts packets up to 256 KiB; replies here are
// bounded the same way so a misbehaving server cannot exhaust memory.
const MAX_PACKET = 256 * 1024 + 1024;
export const CHUNK_SIZE = 32 * 1024;

export interface SftpAttributes {
  readonly size?: number;
  readonly permissions?: number;
  readonly modified?: number;
}

export interface SftpName {
  readonly filename: string;
  readonly attributes: SftpAttributes;
}

export class SftpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "SftpError";
  }
}

class Writer {
  private readonly parts: Buffer[] = [];
  byte(value: number) {
    this.parts.push(Buffer.from([value]));
    return this;
  }
  uint32(value: number) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value >>> 0);
    this.parts.push(buffer);
    return this;
  }
  uint64(value: number) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(value));
    this.parts.push(buffer);
    return this;
  }
  string(value: string | Buffer) {
    const bytes =
      typeof value === "string" ? Buffer.from(value, "utf8") : value;
    this.uint32(bytes.length);
    this.parts.push(bytes);
    return this;
  }
  packet(): Buffer {
    const body = Buffer.concat(this.parts);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    return Buffer.concat([header, body]);
  }
}

class Reader {
  private offset = 0;
  constructor(private readonly buffer: Buffer) {}
  private need(count: number) {
    if (this.offset + count > this.buffer.length)
      throw new SftpError(-1, "Malformed SFTP reply");
  }
  byte() {
    this.need(1);
    return this.buffer[this.offset++]!;
  }
  uint32() {
    this.need(4);
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }
  uint64() {
    this.need(8);
    const value = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return Number(value);
  }
  bytes() {
    const length = this.uint32();
    this.need(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  string() {
    return this.bytes().toString("utf8");
  }
  attributes(): SftpAttributes {
    const flags = this.uint32();
    const result: { size?: number; permissions?: number; modified?: number } =
      {};
    if (flags & ATTR.size) result.size = this.uint64();
    if (flags & ATTR.uidgid) {
      this.uint32();
      this.uint32();
    }
    if (flags & ATTR.permissions) result.permissions = this.uint32();
    if (flags & ATTR.acmodtime) {
      this.uint32();
      result.modified = this.uint32() * 1000;
    }
    if (flags & ATTR.extended) {
      const count = this.uint32();
      for (let index = 0; index < count; index += 1) {
        this.bytes();
        this.bytes();
      }
    }
    return result;
  }
}

type Reply = { readonly type: number; readonly reader: Reader };

export interface SftpClient {
  realpath(remotePath: string): Promise<string>;
  list(directory: string): Promise<SftpName[]>;
  stat(remotePath: string): Promise<SftpAttributes>;
  lstat(remotePath: string): Promise<SftpAttributes>;
  mkdir(remotePath: string): Promise<void>;
  rmdir(remotePath: string): Promise<void>;
  remove(remotePath: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  open(
    remotePath: string,
    flags: number,
    permissions?: number,
  ): Promise<Buffer>;
  read(
    handle: Buffer,
    offset: number,
    length: number,
  ): Promise<Buffer | undefined>;
  write(handle: Buffer, offset: number, data: Buffer): Promise<void>;
  close(handle: Buffer): Promise<void>;
  end(): void;
  readonly closed: Promise<void>;
}

export async function createSftpClient(
  input: Readable,
  output: Writable,
  maxEntries = 10_000,
): Promise<SftpClient> {
  let buffered = Buffer.alloc(0);
  let nextId = 1;
  let failure: Error | undefined;
  const pending = new Map<
    number,
    { resolve: (reply: Reply) => void; reject: (error: Error) => void }
  >();
  let versionWaiter:
    { resolve: () => void; reject: (error: Error) => void } | undefined;
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });

  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    versionWaiter?.reject(error);
    markClosed();
  };
  input.on("data", (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4) {
      const length = buffered.readUInt32BE(0);
      if (length < 1 || length > MAX_PACKET) {
        fail(new SftpError(-1, "Oversized SFTP reply"));
        input.destroy();
        return;
      }
      if (buffered.length < 4 + length) break;
      const reader = new Reader(buffered.subarray(4, 4 + length));
      buffered = buffered.subarray(4 + length);
      try {
        const type = reader.byte();
        if (type === PACKET.version) {
          reader.uint32();
          versionWaiter?.resolve();
          versionWaiter = undefined;
          continue;
        }
        const id = reader.uint32();
        const waiter = pending.get(id);
        pending.delete(id);
        waiter?.resolve({ type, reader });
      } catch (cause) {
        fail(cause as Error);
        return;
      }
    }
  });
  input.on("end", () => fail(new SftpError(-1, "The SFTP connection closed")));
  input.on("error", (cause: Error) => fail(cause));
  output.on("error", (cause: Error) => fail(cause));

  const request = (type: number, body: (writer: Writer) => void) =>
    new Promise<Reply>((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      const id = nextId;
      nextId = (nextId % 0xffffffff) + 1;
      pending.set(id, { resolve, reject });
      const writer = new Writer().byte(type).uint32(id);
      body(writer);
      output.write(writer.packet());
    });
  const status = (reply: Reply) => {
    if (reply.type !== PACKET.status)
      throw new SftpError(-1, "Unexpected SFTP reply");
    const code = reply.reader.uint32();
    const message = reply.reader.string();
    if (code !== STATUS.ok) throw new SftpError(code, message || "Failed");
  };
  const expect = (reply: Reply, type: number) => {
    if (reply.type === type) return reply.reader;
    status(reply);
    throw new SftpError(-1, "Unexpected SFTP reply");
  };

  await new Promise<void>((resolve, reject) => {
    versionWaiter = { resolve, reject };
    output.write(new Writer().byte(PACKET.init).uint32(3).packet());
  });

  const client: SftpClient = {
    async realpath(remotePath) {
      const reader = expect(
        await request(PACKET.realpath, (writer) => writer.string(remotePath)),
        PACKET.name,
      );
      if (reader.uint32() < 1) throw new SftpError(-1, "Empty SFTP reply");
      return reader.string();
    },
    async list(directory) {
      const handle = expect(
        await request(PACKET.opendir, (writer) => writer.string(directory)),
        PACKET.handle,
      ).bytes();
      const names: SftpName[] = [];
      try {
        for (;;) {
          const reply = await request(PACKET.readdir, (writer) =>
            writer.string(handle),
          );
          if (reply.type === PACKET.status) {
            const code = reply.reader.uint32();
            if (code === STATUS.eof) break;
            throw new SftpError(code, reply.reader.string() || "Failed");
          }
          const reader = expect(reply, PACKET.name);
          const count = reader.uint32();
          for (let index = 0; index < count; index += 1) {
            const filename = reader.string();
            reader.string();
            const attributes = reader.attributes();
            if (filename !== "." && filename !== "..")
              names.push({ filename, attributes });
          }
          if (names.length >= maxEntries) break;
        }
      } finally {
        await client.close(handle).catch(() => undefined);
      }
      return names;
    },
    async stat(remotePath) {
      return expect(
        await request(PACKET.stat, (writer) => writer.string(remotePath)),
        PACKET.attrs,
      ).attributes();
    },
    async lstat(remotePath) {
      return expect(
        await request(PACKET.lstat, (writer) => writer.string(remotePath)),
        PACKET.attrs,
      ).attributes();
    },
    async mkdir(remotePath) {
      status(
        await request(PACKET.mkdir, (writer) =>
          writer.string(remotePath).uint32(0),
        ),
      );
    },
    async rmdir(remotePath) {
      status(
        await request(PACKET.rmdir, (writer) => writer.string(remotePath)),
      );
    },
    async remove(remotePath) {
      status(
        await request(PACKET.remove, (writer) => writer.string(remotePath)),
      );
    },
    async rename(from, to) {
      // Version 3 rename fails when the target exists: nothing is replaced.
      status(
        await request(PACKET.rename, (writer) =>
          writer.string(from).string(to),
        ),
      );
    },
    async open(remotePath, flags, permissions) {
      return expect(
        await request(PACKET.open, (writer) => {
          writer.string(remotePath).uint32(flags);
          if (permissions === undefined) writer.uint32(0);
          else writer.uint32(ATTR.permissions).uint32(permissions);
        }),
        PACKET.handle,
      ).bytes();
    },
    async read(handle, offset, length) {
      const reply = await request(PACKET.read, (writer) =>
        writer.string(handle).uint64(offset).uint32(length),
      );
      if (reply.type === PACKET.status) {
        const code = reply.reader.uint32();
        if (code === STATUS.eof) return undefined;
        throw new SftpError(code, reply.reader.string() || "Failed");
      }
      return Buffer.from(expect(reply, PACKET.data).bytes());
    },
    async write(handle, offset, data) {
      status(
        await request(PACKET.write, (writer) =>
          writer.string(handle).uint64(offset).string(data),
        ),
      );
    },
    async close(handle) {
      status(await request(PACKET.close, (writer) => writer.string(handle)));
    },
    end() {
      output.end();
    },
    closed,
  };
  return client;
}

export function isDirectoryMode(permissions: number | undefined): boolean {
  return permissions !== undefined && (permissions & 0o170000) === 0o040000;
}

export function isSymlinkMode(permissions: number | undefined): boolean {
  return permissions !== undefined && (permissions & 0o170000) === 0o120000;
}

export function isRegularMode(permissions: number | undefined): boolean {
  return permissions !== undefined && (permissions & 0o170000) === 0o100000;
}

export function sftpErrorMessage(cause: unknown): string {
  if (cause instanceof SftpError) {
    if (cause.code === STATUS.noSuchFile) return "The item no longer exists.";
    if (cause.code === STATUS.permissionDenied) return "Permission denied.";
    return cause.message.slice(0, 512);
  }
  return cause instanceof Error ? cause.message.slice(0, 512) : "Failed.";
}
