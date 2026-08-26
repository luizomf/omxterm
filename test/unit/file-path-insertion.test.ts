import { describe, expect, it, vi } from "vitest";
import {
  MAX_INSERTED_PATH_LENGTH,
  MAX_INSERTED_PATHS,
  formatFilePathInsertion,
  readClipboardPathInsertion,
  type NativeClipboardReader,
} from "../../src/shared/file-path-insertion";

function clipboard(
  text: string,
  formats: Record<string, Buffer | string> = {},
  advertisedFormats: string[] = Object.keys(formats),
): NativeClipboardReader {
  return {
    readText: vi.fn(() => text),
    availableFormats: vi.fn(() => advertisedFormats),
    readBuffer: vi.fn((format: string) => {
      const value = formats[format];
      return Buffer.isBuffer(value) ? value : Buffer.from(value ?? "", "utf8");
    }),
  };
}

describe("file path insertion", () => {
  it("quotes Unix paths as POSIX shell tokens at a fresh token boundary", () => {
    expect(
      formatFilePathInsertion(
        ["/tmp/A B/$x & y/O'Brien", "/home/例示/\nfile"],
        "darwin",
      ),
    ).toBe("'/tmp/A B/$x & y/O'\\''Brien' '/home/例示/\nfile'");
    expect(formatFilePathInsertion(["/tmp/a`$(touch nope)"], "linux")).toBe(
      "'/tmp/a`$(touch nope)'",
    );
  });

  it("uses the approved Windows PowerShell 5.1 token encoding", () => {
    const quotes = "'\u2018\u2019\u201a\u201b";
    expect(
      formatFilePathInsertion(
        [`C:\\A B\\O${quotes} $100% & notes.txt`, "\\\\server\\share\\日本語"],
        "win32",
      ),
    ).toBe(
      "'C:\\A B\\O''‘‘’’‚‚‛‛ $100% & notes.txt' '\\\\server\\share\\日本語'",
    );
  });

  it("rejects every malformed or over-bound list without partial insertion", () => {
    expect(formatFilePathInsertion(["/ok", "relative"], "linux")).toBe("");
    expect(formatFilePathInsertion(["C:relative"], "win32")).toBe("");
    expect(formatFilePathInsertion(["/has\0nul"], "darwin")).toBe("");
    expect(
      formatFilePathInsertion(
        [`/${"x".repeat(MAX_INSERTED_PATH_LENGTH)}`],
        "linux",
      ),
    ).toBe("");
    expect(
      formatFilePathInsertion(
        Array.from({ length: 33 }, () => `/${"x".repeat(32_767)}`),
        "linux",
      ),
    ).toBe("");
    expect(
      formatFilePathInsertion(
        Array.from({ length: MAX_INSERTED_PATHS + 1 }, () => "/tmp/a"),
        "linux",
      ),
    ).toBe("");
  });

  it("keeps every non-empty plain-text paste unchanged, including whitespace", () => {
    for (const text of ["plain $text", "   ", "\n"]) {
      const source = clipboard(text, {
        "x-special/gnome-copied-files": "copy\nfile:///tmp/ignored",
      });
      expect(readClipboardPathInsertion(source, "linux")).toBe(text);
      expect(source.availableFormats).not.toHaveBeenCalled();
      expect(source.readBuffer).not.toHaveBeenCalled();
    }
  });

  it("parses GNOME copied files and the standard Linux URI-list fallback", () => {
    expect(
      readClipboardPathInsertion(
        clipboard("", {
          "x-special/gnome-copied-files":
            "copy\nfile:///home/%E4%BE%8B%E7%A4%BA/A%20B\nfile:///tmp/O%27Brien\n",
          "text/uri-list": "file:///ignored",
        }),
        "linux",
      ),
    ).toBe("'/home/例示/A B' '/tmp/O'\\''Brien'");
    expect(
      readClipboardPathInsertion(
        clipboard("", {
          "text/uri-list":
            "# file-manager selection\r\n\r\nfile:///tmp/a%20b\r\nfile:///tmp/%E6%97%A5%E6%9C%AC\r\n",
        }),
        "linux",
      ),
    ).toBe("'/tmp/a b' '/tmp/日本'");
  });

  it("parses the macOS filename plist and public file URL fallback", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><array>
<string>/Users/例示/A &amp; B</string><string>/tmp/O&apos;Brien</string>
</array></plist>`;
    expect(
      readClipboardPathInsertion(
        clipboard(
          "",
          {
            NSFilenamesPboardType: plist,
            "public.file-url": "file:///ignored",
          },
          ["text/uri-list"],
        ),
        "darwin",
      ),
    ).toBe("'/Users/例示/A & B' '/tmp/O'\\''Brien'");
    expect(
      readClipboardPathInsertion(
        clipboard("", { "public.file-url": "file:///Users/me/A%20B" }),
        "darwin",
      ),
    ).toBe("'/Users/me/A B'");
  });

  it("reads the supported Windows FileNameW representation without guessing lists", () => {
    const source = clipboard(
      "",
      {
        FileNameW: Buffer.from("C:\\Users\\例示\\A B & O'Brien\0", "utf16le"),
      },
      ["text/uri-list"],
    );
    expect(readClipboardPathInsertion(source, "win32")).toBe(
      "'C:\\Users\\例示\\A B & O''Brien'",
    );
  });

  it("rejects malformed native lists and arbitrary URLs without partial insertion", () => {
    for (const [platform, source] of [
      [
        "linux",
        clipboard("", {
          "x-special/gnome-copied-files":
            "copy\nfile:///tmp/ok\nhttps://example.test/not-a-file",
        }),
      ],
      ["linux", clipboard("", { "text/uri-list": "file:///tmp/%2Fetc" })],
      [
        "darwin",
        clipboard("", {
          NSFilenamesPboardType:
            '<plist version="1.0"><array><string>/ok</string><data>bad</data></array></plist>',
        }),
      ],
      [
        "darwin",
        clipboard("", {
          NSFilenamesPboardType:
            '<plist version="1.0"><array><string>/bad&AMP;</string></array></plist>',
        }),
      ],
      [
        "darwin",
        clipboard("", {
          NSFilenamesPboardType:
            '<plist version="1.0"><array><string>/bad&#1;</string></array></plist>',
        }),
      ],
      [
        "win32",
        clipboard("", {
          FileNameW: Buffer.from("C:\\ok\0D:\\hidden\0", "utf16le"),
        }),
      ],
      [
        "win32",
        clipboard("", {
          FileNameW: Buffer.from("C:\\unterminated", "utf16le"),
        }),
      ],
    ] as const)
      expect(readClipboardPathInsertion(source, platform)).toBe("");
  });
});
