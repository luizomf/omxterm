// @vitest-environment jsdom
import { Terminal, type ILink, type ILinkProvider } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import {
  ignoredOscLinkHandler,
  registerVisibleWebLinks,
} from "../../src/terminal-surface/visible-web-links";

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

async function linksFor(
  data: string,
  cols = 120,
): Promise<{ links: ILink[]; activate: ReturnType<typeof vi.fn> }> {
  const terminal = new Terminal({ cols, rows: 8 });
  let provider: ILinkProvider | undefined;
  terminal.registerLinkProvider = vi.fn((value) => {
    provider = value;
    return { dispose: vi.fn() };
  });
  const activate = vi.fn();
  registerVisibleWebLinks(terminal, activate);
  await write(terminal, data);
  const links = await new Promise<ILink[]>((resolve) =>
    provider!.provideLinks(1, (value) => resolve(value ?? [])),
  );
  terminal.dispose();
  return { links, activate };
}

describe("pinned @xterm/addon-web-links 0.12.0 visible span contract", () => {
  it.each([
    ["See https://example.test/path, now", "https://example.test/path"],
    ["[http://one.test/a]", "http://one.test/a"],
    ["(https://example.test/a(b)c)", "https://example.test/a"],
  ])("owns punctuation and bracket span for %s", async (data, expected) => {
    const { links } = await linksFor(data);
    expect(links.map((link) => link.text)).toEqual([expected]);
  });

  it("finds multiple nearby URLs and a URL across a soft wrap", async () => {
    const nearby = await linksFor("http://one.test/a https://two.test/b");
    expect(nearby.links.map((link) => link.text)).toEqual([
      "http://one.test/a",
      "https://two.test/b",
    ]);
    const wrapped = await linksFor("prefix https://example.test/wrapped", 18);
    expect(wrapped.links.map((link) => link.text)).toEqual([
      "https://example.test/wrapped",
    ]);
  });

  it("ignores OSC 8 metadata while matching its visible literal URL across split writes", async () => {
    const terminal = new Terminal({ cols: 120, rows: 8 });
    let provider: ILinkProvider | undefined;
    terminal.registerLinkProvider = vi.fn((value) => {
      provider = value;
      return { dispose: vi.fn() };
    });
    const activate = vi.fn();
    registerVisibleWebLinks(terminal, activate);
    await write(terminal, "\u001b]8;;file:///hidden\u001b\\https://visible");
    await write(terminal, ".test/path\u001b]8;;\u001b\\");
    const links = await new Promise<ILink[]>((resolve) =>
      provider!.provideLinks(1, (value) => resolve(value ?? [])),
    );
    expect(links.map((link) => link.text)).toEqual([
      "https://visible.test/path",
    ]);
    const open = vi.spyOn(window, "open");
    expect(() =>
      ignoredOscLinkHandler.activate(
        new MouseEvent("click", { metaKey: true }),
        "file:///hidden",
        links[0]!.range,
      ),
    ).not.toThrow();
    expect(open).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    open.mockRestore();
    terminal.dispose();
  });

  it("requires a primary-button Cmd+click and forwards the provider string unchanged once per gesture", async () => {
    const { links, activate } = await linksFor("https://example.test/a");
    const link = links[0]!;
    link.activate(new MouseEvent("click", { button: 0 }), link.text);
    link.activate(
      new MouseEvent("click", { button: 0, metaKey: true }),
      link.text,
    );
    link.activate(
      new MouseEvent("click", { button: 0, metaKey: true }),
      link.text,
    );
    link.activate(
      new MouseEvent("click", { button: 1, metaKey: true }),
      link.text,
    );
    expect(activate.mock.calls).toEqual([
      ["https://example.test/a"],
      ["https://example.test/a"],
    ]);
  });

  it("does not expose uppercase protocols as visible links", async () => {
    const { links } = await linksFor(
      "HTTP://upper.test HTTPS://upper.test http://lower.test",
    );
    expect(links.map((link) => link.text)).toEqual(["http://lower.test"]);
  });
});
