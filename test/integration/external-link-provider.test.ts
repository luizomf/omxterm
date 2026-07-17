// @vitest-environment jsdom
import { Terminal, type ILink, type ILinkProvider } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import { isValidExternalLink } from "../../src/main/terminal-ipc-controller";
import {
  ignoreOscLinks,
  registerVisibleWebLinks,
} from "../../src/terminal-surface/visible-web-links";

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

function providerLinks(provider: ILinkProvider, line = 1): Promise<ILink[]> {
  return new Promise((resolve) =>
    provider.provideLinks(line, (value) => resolve(value ?? [])),
  );
}

async function linksFor(
  data: string,
  cols = 120,
  activate = vi.fn(),
): Promise<{ links: ILink[]; activate: ReturnType<typeof vi.fn> }> {
  const terminal = new Terminal({ cols, rows: 8 });
  let provider: ILinkProvider | undefined;
  terminal.registerLinkProvider = vi.fn((value) => {
    provider = value;
    return { dispose: vi.fn() };
  });
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

  it("opens a provider-owned URL longer than 2,048 characters across soft wraps unchanged", async () => {
    const url = `https://example.test/${"a".repeat(2_100)}`;
    const opener = vi.fn();
    const activate = vi.fn((value: string) => {
      if (isValidExternalLink(value)) opener(value);
    });
    const { links } = await linksFor(url, 80, activate);
    const link = links[0]!;

    expect(link.text).toBe(url);
    expect(() =>
      link.activate(
        new MouseEvent("click", { button: 0, metaKey: true }),
        link.text,
      ),
    ).not.toThrow();

    expect(activate).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledWith(url);
  });

  it.each([
    ["ST", "\u001b]8;;https://hidden.test/path\u001b\\", "\u001b]8;;\u001b\\"],
    ["BEL", "\u001b]8;;https://hidden.test/path\u0007", "\u001b]8;;\u0007"],
  ])(
    "removes the native OSC 8 provider overlap for split %s controls while preserving the visible URL provider",
    async (_variant, start, end) => {
      const terminal = new Terminal({ cols: 120, rows: 8 });
      const ignoredOscLinks = ignoreOscLinks(terminal);
      const activate = vi.fn();
      const webLinks = registerVisibleWebLinks(terminal, activate);
      await write(terminal, start.slice(0, -1));
      await write(terminal, `${start.slice(-1)}https://visible`);
      await write(terminal, ".test/path");
      await write(terminal, end.slice(0, -1));
      await write(terminal, end.slice(-1));

      const providers = (
        terminal as unknown as {
          _core: {
            _linkProviderService: { linkProviders: ILinkProvider[] };
          };
        }
      )._core._linkProviderService.linkProviders;
      expect(providers).toHaveLength(2);
      expect(await providerLinks(providers[0]!)).toEqual([]);
      const visibleLinks = await providerLinks(providers[1]!);
      expect(visibleLinks.map((link) => link.text)).toEqual([
        "https://visible.test/path",
      ]);

      const visibleLink = visibleLinks[0]!;
      visibleLink.activate(
        new MouseEvent("click", { button: 0, metaKey: true }),
        visibleLink.text,
      );
      expect(activate).toHaveBeenCalledOnce();
      expect(activate).toHaveBeenCalledWith("https://visible.test/path");

      webLinks.dispose();
      ignoredOscLinks.dispose();
      terminal.dispose();
    },
  );

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
