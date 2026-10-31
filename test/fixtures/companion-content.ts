import { vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
  HostedContentPresentation,
} from "../../src/shared/extension-view";
import { snippetsWindow } from "./snippets-window";

export const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function fixture() {
  const opens = new Set<(descriptor: HostedContentDescriptor) => void>();
  const retired = new Set<(id: string) => void>();
  const focuses = new Set<(id: string | null) => void>();
  const dismissals = new Set<(id: string) => void>();
  const focus = (id: string | null) => {
    for (const listener of focuses) listener(id);
  };
  const bridge: HostedContentBridge = {
    onOpen(listener) {
      opens.add(listener);
      return () => {
        opens.delete(listener);
      };
    },
    onRetired(listener) {
      retired.add(listener);
      return () => {
        retired.delete(listener);
      };
    },
    onFailure: () => () => {},
    onDismissPanel(listener) {
      dismissals.add(listener);
      return () => {
        dismissals.delete(listener);
      };
    },
    onFocus(listener) {
      focuses.add(listener);
      return () => {
        focuses.delete(listener);
      };
    },
    present: vi.fn(async (request: HostedContentPresentation) => {
      if (request.focus === true) focus(request.id);
      if (request.focus === "core" || request.id === null) focus(null);
      return true;
    }),
    close: vi.fn(async () => {}),
  };
  const sshPane = vi.fn();
  const f = await snippetsWindow({ hostedContent: bridge, sshPane });
  return {
    ...f,
    bridge,
    sshPane,
    focus,
    open(id = "files", panel = true, toggle = false) {
      for (const listener of opens)
        listener({
          id,
          title: id,
          ...(toggle ? { toggle: true as const } : {}),
          ...(panel ? { presentation: "panel" as const } : {}),
        });
    },
    dismiss(id: string) {
      for (const listener of dismissals) listener(id);
    },
    retire(id: string) {
      for (const listener of retired) listener(id);
    },
    tool(title: string) {
      return [
        ...f.root.querySelectorAll<HTMLButtonElement>(
          ".auxiliary-tools button",
        ),
      ].find((button) => button.textContent === title)!;
    },
  };
}
