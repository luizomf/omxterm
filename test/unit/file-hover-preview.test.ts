import { describe, expect, it } from "vitest";
import { resolvePrintedPath } from "../../src/renderer/files/file-hover-preview";
import { fileTokenAtOffset } from "../../src/terminal-surface/visible-links";

const token = (text: string, at: string) =>
  fileTokenAtOffset(text, text.indexOf(at))?.url;

describe("file names under the pointer", () => {
  it("finds ls entries, quoted names and paths", () => {
    const line = "foto.png  'Minha Pasta'  notas.txt  build/  run.sh*";
    expect(token(line, "oto")).toBe("foto.png");
    expect(token(line, "Pasta")).toBe("Minha Pasta");
    expect(token(line, "notas")).toBe("notas.txt");
    expect(token(line, "build")).toBe("build");
    expect(token(line, "run")).toBe("run.sh");
    expect(token("see /etc/hosts:", "hosts")).toBe("/etc/hosts");
    expect(fileTokenAtOffset(line, 8)).toBeUndefined();
    expect(token("open https://example.org now", "example")).toBeUndefined();
  });

  it("resolves a printed name against the pane's folder", () => {
    const home = { home: "/home/me", platform: "linux" };
    expect(resolvePrintedPath("notas.txt", "/tmp/x", home)).toBe(
      "/tmp/x/notas.txt",
    );
    expect(resolvePrintedPath("./a.png", "/tmp/x/", home)).toBe("/tmp/x/a.png");
    expect(resolvePrintedPath("/etc/hosts", null, home)).toBe("/etc/hosts");
    expect(resolvePrintedPath("~/doc.pdf", null, home)).toBe(
      "/home/me/doc.pdf",
    );
    expect(resolvePrintedPath("~other/x", "/tmp", home)).toBeUndefined();
    expect(resolvePrintedPath("a.txt", null, home)).toBeUndefined();
    expect(
      resolvePrintedPath("a.txt", "C:\\Users\\me", {
        home: "C:\\Users\\me",
        platform: "win32",
      }),
    ).toBe("C:\\Users\\me\\a.txt");
  });
});
