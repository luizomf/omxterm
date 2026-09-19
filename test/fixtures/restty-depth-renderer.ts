import { createTerminalTabs } from "../../src/renderer/terminal-tabs";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { hiddenFixtureSession } from "./restty-hidden-session";
import { instrumentHiddenWebGL } from "./restty-hidden-presentation";

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Reuse the hidden-rendering Adapter and production tabs; no paused renderer.
export async function depthRenderingFixture() {
  const root = document.querySelector<HTMLElement>("#terminal-tabs")!;
  root.replaceChildren();
  const strip = document.createElement("div");
  root.parentElement!.before(strip);
  const calls = instrumentHiddenWebGL();
  const sessions: ReturnType<typeof hiddenFixtureSession>[] = [];
  const tabs = createTerminalTabs(
    { strip, container: root },
    {
      mount: mountResttyTerminalSurface,
      surfaceOptions: {
        appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      createAdapter() {
        const session = hiddenFixtureSession(`depth-${sessions.length}`);
        sessions.push(session);
        return session.adapter;
      },
    },
  );
  await tabs.ready;
  return {
    async phase(count: number) {
      while (root.children.length < count) {
        tabs.handleCommand({ action: "new" });
        while (!sessions.at(-1)!.state.ready) await frame();
      }
      while (root.children.length > count)
        tabs.handleCommand({ action: "close" });
      const surfaces = [];
      for (let index = 0; index < count; index += 1) {
        tabs.handleCommand({ action: "select", position: index + 1 });
        sessions[index]!.output(
          "\u001bc\u001b[?25h\u001b[2 q" +
            "depth public text 0123456789\r\n".repeat(120),
        );
        await frame();
        // Selection forces a current draw, then reads it in the same task.
        tabs.handleCommand({ action: "select", position: index + 1 });
        const canvas = root.querySelectorAll("canvas")[index]!;
        const gl = canvas.getContext("webgl2")!;
        const pixels = new Uint8Array(
          gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
        );
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        let foregroundPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4)
          if (
            pixels[offset]! > 100 &&
            pixels[offset + 1]! > 100 &&
            pixels[offset + 2]! > 100
          )
            foregroundPixels += 1;
        const pixelSha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        const renderError = gl.getError();
        const depthAttachmentType = gl.getFramebufferAttachmentParameter(
          gl.FRAMEBUFFER,
          gl.DEPTH,
          gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
        ) as number;
        // Asking for component size on NONE is INVALID_OPERATION in WebGL2.
        const depthAttachmentBits =
          depthAttachmentType === gl.NONE
            ? null
            : (gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.DEPTH,
                gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
              ) as number);
        surfaces.push({
          renderError,
          attributes: gl.getContextAttributes(),
          depthBits: gl.getParameter(gl.DEPTH_BITS) as number,
          depthTest: gl.isEnabled(gl.DEPTH_TEST),
          framebufferIsDefault:
            gl.getParameter(gl.FRAMEBUFFER_BINDING) === null,
          depthAttachmentType,
          depthAttachmentBits,
          glError: gl.getError(),
          renderer: debug
            ? (gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string)
            : null,
          width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight,
          dpr: devicePixelRatio,
          foregroundPixels,
          pixelSha256,
          calls: { ...calls.get(canvas) },
        });
      }
      return {
        count,
        surfaces,
        closed: sessions.map((session) => session.state.closed),
      };
    },
    dispose() {
      tabs.dispose();
      strip.remove();
    },
  };
}
