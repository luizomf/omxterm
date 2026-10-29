import type { HostedContentBridge } from "../shared/extension-view";
import { setPageNotice } from "./application-page";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

// Native content identity and its DOM allocation, independent of tab ownership.
export interface HostedContentSlot {
  readonly id: string;
  readonly slot: HTMLElement;
  readonly removed: boolean;
}

// One owner per window, shared by all native content adapters. Revisions order
// native work; selection identities fence DOM activation and overlay restoration.
export function createHostedContentPresentation(
  parent: HTMLElement,
  bridge:
    | Pick<HostedContentBridge, "present" | "close" | "onFailure" | "onFocus">
    | undefined,
  language: RendererLanguage = englishLanguage,
) {
  const page = parent.ownerDocument.defaultView!;
  let selected: HostedContentSlot | undefined;
  let selectionIdentity: object | undefined;
  let revision = 0;
  let generation = 0;
  let selectionRevision = 0;
  let focused: string | null = null;
  let nativePossible = false;
  let blocked = false;
  let pendingOverlay = false;
  let disposed = false;
  let scheduled = false;
  let transitioning = false;
  let failed = false;
  let overlayGeneration = -1;
  let restoreSuppressed = false;
  const notice = parent.ownerDocument.createElement("div");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  parent.before(notice);
  const fail = () => {
    if (disposed) return;
    failed = true;
    setPageNotice(notice, {
      text: language.t("hosted.failure"),
      severity: "error",
    });
  };
  const removeLanguage = language.bind(() => {
    if (failed) notice.textContent = language.t("hosted.failure");
  });
  const present = async (
    target: HostedContentSlot | undefined,
    focus: boolean | "core" = false,
  ) => {
    if (!bridge) return true;
    const bounds = target?.slot.getBoundingClientRect();
    if (target) nativePossible = true;
    const request = ++revision;
    try {
      const accepted = await bridge.present({
        id: target?.id ?? null,
        revision: request,
        bounds: bounds
          ? {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }
          : { x: 0, y: 0, width: 0, height: 0 },
        focus,
      });
      if (request === revision) {
        if (!accepted) fail();
        else if (!target) {
          nativePossible = false;
          focused = null;
        } else if (focus === "core") focused = null;
      }
      return accepted;
    } catch {
      if (request === revision) fail();
      return false;
    }
  };
  const show = (focus: boolean | "core" = false) => {
    if (
      !disposed &&
      !failed &&
      !transitioning &&
      !restoreSuppressed &&
      !blocked &&
      !pendingOverlay &&
      selected &&
      !selected.removed
    )
      void present(selected, focus);
  };
  const layout = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    page.requestAnimationFrame(() => {
      scheduled = false;
      show();
    });
  };
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(layout);
  page.addEventListener("resize", layout);
  const removeFailure = bridge?.onFailure(fail);
  const removeFocus = bridge?.onFocus?.((id) => {
    focused = id;
  });
  return {
    // identity also identifies DOM-only selections, which have no native slot.
    select(
      target: HostedContentSlot | undefined,
      activate: (focusAllowed?: boolean) => void,
      identity?: object,
      focus: boolean | "core" = true,
    ) {
      if (disposed) return;
      if (selectionIdentity !== identity || selected !== target)
        generation += 1;
      selectionIdentity = identity;
      const current = ++selectionRevision;
      const retained =
        nativePossible &&
        selected === target &&
        !!target &&
        !blocked &&
        !pendingOverlay &&
        !failed &&
        !restoreSuppressed;
      transitioning = true;
      if (!blocked) restoreSuppressed = false;
      if (selected?.slot !== target?.slot) {
        if (selected) observer?.unobserve(selected.slot);
        if (target) observer?.observe(target.slot);
      }
      selected = target;
      const finish = (shown = false, focusAllowed = true) => {
        if (disposed || current !== selectionRevision) return;
        transitioning = false;
        activate(focusAllowed);
        if (!shown) show(focus);
      };
      if (retained) {
        if (focus === false) finish(true);
        else
          void present(target, focus).then((ok) => {
            if (ok) finish(true, ok === true);
          });
      } else if (nativePossible) {
        void present(undefined).then((ok) => {
          if (ok) finish();
        });
      } else finish();
    },
    focus: () => show(true),
    isBlocked: () => blocked || pendingOverlay,
    ownsFocus: (id?: string) =>
      !disposed &&
      !blocked &&
      !pendingOverlay &&
      !!selected &&
      !selected.removed &&
      focused === selected.id &&
      (id === undefined || focused === id),
    setBlocked(value: boolean) {
      if (disposed) return;
      const changed = blocked !== value;
      blocked = value;
      if (value && changed) overlayGeneration = generation;
      if (!value && changed && overlayGeneration !== generation)
        restoreSuppressed = true;
      if (value) pendingOverlay = false;
      if (!changed) return;
      if (value && nativePossible) void present(undefined);
      else show();
    },
    openOverlay(open: () => void) {
      if (disposed || pendingOverlay || transitioning) return;
      if (!nativePossible) {
        open();
        return;
      }
      pendingOverlay = true;
      const current = generation;
      void present(undefined).then((ok) => {
        if (disposed) return;
        if (current !== generation) {
          pendingOverlay = false;
          show();
          return;
        }
        if (!ok) return;
        open();
        pendingOverlay = false;
        show();
      });
    },
    forget(target: HostedContentSlot) {
      observer?.unobserve(target.slot);
    },
    close(id: string, remove: () => void) {
      if (disposed) return;
      void bridge?.close(id).then(() => {
        if (!disposed) remove();
      }, fail);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      selectionRevision += 1;
      removeFocus?.();
      removeFailure?.();
      observer?.disconnect();
      page.removeEventListener("resize", layout);
      notice.remove();
      removeLanguage();
      if (nativePossible) void present(undefined);
    },
  };
}
