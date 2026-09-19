import type { TerminalTabs } from "../../src/renderer/terminal-tabs";

export function exerciseHiddenImages(options: {
  tabs: TerminalTabs;
  canvas: HTMLCanvasElement;
  output(data: string): boolean;
  counts(): Record<string, number>;
}) {
  const { tabs, canvas, output, counts } = options;
  const select = (position: number) =>
    tabs.handleCommand({ action: "select", position });
  const source = document.createElement("canvas");
  source.width = 8;
  source.height = 8;
  const context = source.getContext("2d")!;
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 8, 8);
  const png = source.toDataURL("image/png").split(",")[1]!;
  const image = `\u001b_Ga=T,f=100,q=2,c=4,r=3,C=0,i=316;${png}\u001b\\`;
  const raw =
    "\u001b[5;10H\u001b_Ga=T,t=d,f=32,s=1,v=1,c=2,r=2,m=1,q=2\u001b\\\u001b_Gm=1;AP8A/w==\u001b\\\u001b_Gm=0\u001b\\";
  const pixels = () => {
    const gl = canvas.getContext("webgl2")!;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    let red = 0;
    let green = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (
        data[offset] === 255 &&
        data[offset + 1] === 0 &&
        data[offset + 2] === 0
      )
        red += 1;
      if (
        data[offset] === 0 &&
        data[offset + 1] === 255 &&
        data[offset + 2] === 0
      )
        green += 1;
    }
    return { red, green };
  };
  select(2);
  output("\u001bc\u001b[?25l" + image + raw);
  select(1);
  const retained = pixels();
  select(2);
  output("\u001b[10;1Hhidden text after images");
  select(1);
  const retainedAgain = pixels();
  const cases = [
    {
      name: "image-id",
      enter: "",
      remove: "\u001b_Ga=d,d=I,i=316,q=2\u001b\\",
    },
    { name: "all-images", enter: "", remove: "\u001b_Ga=d,d=A,q=2\u001b\\" },
    {
      name: "all-placements",
      enter: "",
      remove: "\u001b_Ga=d,d=a,q=2\u001b\\",
    },
    { name: "reset", enter: "", remove: "\u001bc" },
    { name: "alternate-exit", enter: "\u001b[?1049h", remove: "\u001b[?1049l" },
  ];
  const deleted = cases.map(({ name, enter, remove }) => {
    output("\u001bc" + enter + "\u001b[?25l" + image);
    select(1);
    const visible = pixels();
    select(2);
    const before = counts();
    const acked = output(remove);
    const after = counts();
    select(1);
    return {
      name,
      acked,
      visible,
      revealed: pixels(),
      hiddenClears: (after.clear ?? 0) - (before.clear ?? 0),
      releasedTextures:
        (after.deleteTexture ?? 0) - (before.deleteTexture ?? 0),
    };
  });
  output("\u001bc\u001b[?25l" + image);
  select(1);
  const before = counts();
  select(2);
  tabs.handleCommand({ action: "close-session", sessionId: "s1" });
  const after = counts();
  return {
    retained,
    retainedAgain,
    deleted,
    disposal: {
      releasedTextures:
        (after.deleteTexture ?? 0) - (before.deleteTexture ?? 0),
      hiddenClears: (after.clear ?? 0) - (before.clear ?? 0),
      detached: !canvas.isConnected,
    },
  };
}
