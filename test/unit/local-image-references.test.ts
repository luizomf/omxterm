import { describe, expect, it, vi } from "vitest";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import { requestVisibleLink } from "../../src/terminal-surface/restty-visible-links";
import { loadLocalImageRequest } from "../../src/main/local-image";
import type {
  LocalImageData,
  LocalImageRequest,
} from "../../src/shared/local-image";

const image: LocalImageData = {
  name: "image.png",
  mime: "image/png",
  width: 1,
  height: 1,
  data: new Uint8Array([1]),
};
const request = (path: string) =>
  ({ source: "path-reference", path }) as LocalImageRequest;

it.each([
  "/tmp/image.png:1",
  "~/image.png",
  "~/image.png:1",
  "~",
  "'~/image.png'",
  "'/tmp/image.png'",
  "'/tmp/an image.png'",
  '"C:\\images\\an image.jpg":12:3',
  "../image.png",
  "./an/image.jpg",
  "images/image.webp",
  "image.png",
  "'../an image.png'",
  "'an image.png'",
  '"images/an image.jpg"',
  "'.\\image.png'",
  "'.\\..\\image.png'",
])(
  "recognizes the complete reference and routes %s only on activation",
  (reference) => {
    const text = `read ${reference} next`;
    for (let offset = 5; offset < 5 + reference.length; offset++)
      expect(visibleLinkAtOffset(text, offset)).toEqual({
        url: reference,
        start: 5,
        end: 5 + reference.length,
      });
    const local = vi.fn();
    const external = vi.fn();
    requestVisibleLink(reference, {
      onLocalImageActivation: local,
      onExternalLink: external,
    } as Parameters<typeof requestVisibleLink>[1]);
    expect(local).toHaveBeenCalledExactlyOnceWith(request(reference));
    expect(external).not.toHaveBeenCalled();
  },
);

it.each([
  "'../image.png'",
  "~/image.png",
  "'/tmp/an image.png'",
  "../image.png",
])("refuses clipped %s", (reference) => {
  expect(visibleLinkAtOffset(reference, 2, true)).toBeUndefined();
  expect(visibleLinkAtOffset(reference, 2, false, true)).toBeUndefined();
});

it.each([
  "'../image.png",
  "'../image.png'junk",
  "~other/image.png",
  "VAR=../image.png",
  "(../image.png)",
  "//server/image.png",
  "\\\\server\\image.png",
  "C:relative.png",
])("does not recognize ambiguous %s", (text) => {
  expect(
    visibleLinkAtOffset(
      text,
      text.indexOf("image") >= 0 ? text.indexOf("image") : 0,
    ),
  ).toBeUndefined();
});

describe.each([
  ["linux", "/home/test", "/chosen/base", "/chosen/image.png"],
  ["win32", "C:\\Users\\test", "D:\\chosen\\base", "D:\\chosen\\image.png"],
] as const)(
  "%s explicit reference resolution",
  (platform, homeDirectory, base, resolved) => {
    function options() {
      return {
        platform,
        homeDirectory,
        chooseFile: vi.fn(async () => null),
        chooseDirectory: vi.fn(async () => base as string | null),
        read: vi.fn(async () => image),
      };
    }
    it("chooses a base for each relative activation, never home implicitly", async () => {
      const ports = options();
      await expect(
        loadLocalImageRequest(request("../image.png"), ports),
      ).resolves.toBe(image);
      expect(ports.chooseDirectory).toHaveBeenCalledExactlyOnceWith(
        homeDirectory,
      );
      expect(ports.read).toHaveBeenCalledExactlyOnceWith(resolved);
      await loadLocalImageRequest(request("../image.png"), ports);
      expect(ports.chooseDirectory).toHaveBeenCalledTimes(2);
    });
    it("treats cancellation as inert and never reads", async () => {
      const ports = options();
      ports.chooseDirectory.mockResolvedValue(null);
      await expect(
        loadLocalImageRequest(request("../image.png"), ports),
      ).resolves.toBeNull();
      expect(ports.read).not.toHaveBeenCalled();
    });
    it("expands only local home, including quoted spaces, without a picker", async () => {
      const ports = options();
      await loadLocalImageRequest(request("'~/an image.png'"), ports);
      expect(ports.read).toHaveBeenCalledExactlyOnceWith(
        `${homeDirectory}${platform === "win32" ? "\\" : "/"}an image.png`,
      );
      expect(ports.chooseDirectory).not.toHaveBeenCalled();
    });
    it("makes late directory selection inert after owner cancellation", async () => {
      const ports = options();
      const abort = new AbortController();
      let finish: ((value: string) => void) | undefined;
      ports.chooseDirectory.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = loadLocalImageRequest(request("../image.png"), {
        ...ports,
        abortSignal: abort.signal,
      }).catch((error) => error as Error);
      abort.abort();
      finish?.(base);
      const failure = await pending;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/superseded/);
      expect(ports.read).not.toHaveBeenCalled();
    });
  },
);

it("preserves literal unquoted absolute suffix targets, falling back only for ENOENT", async () => {
  const read = vi.fn(async () => image);
  const ports = {
    platform: "linux" as const,
    homeDirectory: "/home/test",
    chooseFile: async () => null,
    chooseDirectory: vi.fn(async () => null),
    read,
  };
  await loadLocalImageRequest(request("/tmp/image.png:12:3"), ports);
  expect(read).toHaveBeenCalledExactlyOnceWith("/tmp/image.png:12:3");
  read.mockClear();
  read.mockRejectedValueOnce(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );
  await loadLocalImageRequest(request("/tmp/image.png:12:3"), ports);
  expect(read.mock.calls).toEqual([
    ["/tmp/image.png:12:3"],
    ["/tmp/image.png"],
  ]);
  read.mockClear();
  read.mockRejectedValueOnce(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  await expect(
    loadLocalImageRequest(request("/tmp/image.png:12:3"), ports),
  ).rejects.toThrow("denied");
  expect(read).toHaveBeenCalledTimes(1);
});

it("does not guess a location from three trailing numeric components", async () => {
  const read = vi.fn(async () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  });
  await expect(
    loadLocalImageRequest(request("/tmp/image.png:1:2:3"), {
      platform: "linux",
      chooseFile: async () => null,
      read,
    }),
  ).rejects.toThrow("missing");
  expect(read).toHaveBeenCalledExactlyOnceWith("/tmp/image.png:1:2:3");
});

it("quotes disambiguate literal suffix versus a suffix outside quotes", async () => {
  const read = vi.fn(async () => image);
  const ports = {
    platform: "linux" as const,
    chooseFile: async () => null,
    read,
  };
  await loadLocalImageRequest(request("'/tmp/image.png:1'"), ports);
  await loadLocalImageRequest(request("'/tmp/image.png':1"), ports);
  expect(read.mock.calls).toEqual([["/tmp/image.png:1"], ["/tmp/image.png"]]);
});

it.each([
  "//server/a.png",
  "\\\\server\\a.png",
  "C:relative.png",
  "/rooted.png",
  "~other/a.png",
  "../C:/a.png",
])(
  "rejects ambiguous Windows reference %s before picker/read",
  async (value) => {
    const chooseDirectory = vi.fn();
    const read = vi.fn();
    await expect(
      loadLocalImageRequest(request(value), {
        platform: "win32",
        homeDirectory: "C:\\Users\\test",
        chooseFile: async () => null,
        chooseDirectory,
        read,
      }),
    ).rejects.toThrow();
    expect(chooseDirectory).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  },
);
