import { execFile } from "node:child_process";
import { createApplicationDocumentStore } from "./application-data";
import { findExecutable } from "./executable-lookup";

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacementDisplay {
  readonly bounds: Rectangle;
  readonly workArea: Rectangle;
}

// A window's normal bounds on one display, relative to that display's
// top-left corner, and whether it was maximized.
export interface RememberedPlacement extends Rectangle {
  readonly maximized: boolean;
}

// window-placement.json: the last size and position on each display.
export interface WindowPlacementDocument {
  readonly displays: Readonly<Record<string, RememberedPlacement>>;
}

export interface WindowPlacementScreen {
  getAllDisplays(): readonly PlacementDisplay[];
  getCursorScreenPoint(): { readonly x: number; readonly y: number };
  getDisplayNearestPoint(point: {
    readonly x: number;
    readonly y: number;
  }): PlacementDisplay;
  getDisplayMatching(rectangle: Rectangle): PlacementDisplay;
}

export interface PlacedWindow {
  getNormalBounds(): Rectangle;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  isDestroyed(): boolean;
  on(
    event: "move" | "resize" | "maximize" | "unmaximize",
    listener: () => void,
  ): void;
  once(event: "close" | "ready-to-show", listener: () => void): void;
  maximize(): void;
}

const MAX_DISPLAYS = 32;
const MAX_COORDINATE = 100_000;
const SAVE_DELAY_MS = 500;
const CASCADE_PX = 32;
const LOOKUP_TIMEOUT_MS = 800;

// Displays are told apart by their geometry: it is stable while the monitor
// layout is, and the same on every platform.
export function displayKey(display: PlacementDisplay): string {
  const { x, y, width, height } = display.bounds;
  return `${width}x${height}+${x}+${y}`;
}

const isCoordinate = (value: unknown, minimum: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= MAX_COORDINATE;

export function validateWindowPlacementDocument(
  value: unknown,
): WindowPlacementDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("window placement must be an object");
  const displays = (value as Record<string, unknown>).displays;
  if (
    typeof displays !== "object" ||
    displays === null ||
    Array.isArray(displays) ||
    Object.keys(displays).length > MAX_DISPLAYS
  )
    throw new TypeError("window placement displays are malformed");
  for (const [key, entry] of Object.entries(displays)) {
    const record = entry as Record<string, unknown>;
    if (
      !/^\d{1,6}x\d{1,6}\+-?\d{1,6}\+-?\d{1,6}$/u.test(key) ||
      typeof entry !== "object" ||
      entry === null ||
      !isCoordinate(record.x, -MAX_COORDINATE) ||
      !isCoordinate(record.y, -MAX_COORDINATE) ||
      !isCoordinate(record.width, 1) ||
      !isCoordinate(record.height, 1) ||
      typeof record.maximized !== "boolean"
    )
      throw new TypeError("window placement entry is malformed");
  }
  return { displays: displays as WindowPlacementDocument["displays"] };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

// Where a new window goes on a display: the remembered bounds, else the
// default size centered; always inside the work area, and stepped down and
// right while another window already sits at that exact spot.
export function placeWindow(options: {
  readonly display: PlacementDisplay;
  readonly remembered: RememberedPlacement | undefined;
  readonly defaultSize: { readonly width: number; readonly height: number };
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly occupied: readonly Rectangle[];
}): RememberedPlacement {
  const { display, remembered, defaultSize, minimumSize } = options;
  const area = display.workArea;
  const width = clamp(
    remembered?.width ?? defaultSize.width,
    minimumSize.width,
    area.width,
  );
  const height = clamp(
    remembered?.height ?? defaultSize.height,
    minimumSize.height,
    area.height,
  );
  let x = remembered
    ? display.bounds.x + remembered.x
    : area.x + Math.round((area.width - width) / 2);
  let y = remembered
    ? display.bounds.y + remembered.y
    : area.y + Math.round((area.height - height) / 2);
  const fit = () => {
    x = clamp(x, area.x, area.x + area.width - width);
    y = clamp(y, area.y, area.y + area.height - height);
  };
  fit();
  for (let step = 0; step < 10; step++) {
    if (!options.occupied.some((other) => other.x === x && other.y === y))
      break;
    x += CASCADE_PX;
    y += CASCADE_PX;
    if (x + width > area.x + area.width || y + height > area.y + area.height) {
      x = area.x;
      y = area.y;
      break;
    }
  }
  fit();
  return { x, y, width, height, maximized: remembered?.maximized ?? false };
}

const run = (file: string, args: readonly string[]) =>
  new Promise<string | undefined>((resolve) => {
    execFile(
      file,
      args,
      { timeout: LOOKUP_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });

// `xrandr --listmonitors` lines: " 0: +*DP-1 3440/800x1440/334+3440+0  DP-1".
export function parseMonitorGeometry(
  listing: string,
  name: string,
): Rectangle | undefined {
  for (const line of listing.split("\n")) {
    const match =
      /^\s*\d+:\s+[+*]*(\S+)\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)/u.exec(
        line,
      );
    if (match?.[1] === name)
      return {
        width: Number(match[2]),
        height: Number(match[3]),
        x: Number(match[4]),
        y: Number(match[5]),
      };
  }
  return undefined;
}

// Under a Wayland session the X11 pointer position goes stale while the
// pointer is over native Wayland surfaces (a panel launcher, for example),
// so on KDE Plasma the compositor names the active monitor instead.
async function activeKdeMonitor(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<Rectangle | undefined> {
  if (
    !environment.WAYLAND_DISPLAY ||
    !/KDE/iu.test(environment.XDG_CURRENT_DESKTOP ?? "")
  )
    return undefined;
  const dbusSend = findExecutable("dbus-send", environment, "linux");
  const xrandr = findExecutable("xrandr", environment, "linux");
  if (!dbusSend || !xrandr) return undefined;
  const reply = await run(dbusSend, [
    "--session",
    "--print-reply=literal",
    "--dest=org.kde.KWin",
    "/KWin",
    "org.kde.KWin.activeOutputName",
  ]);
  const name = reply?.trim();
  if (!name || !/^[\w.-]{1,64}$/u.test(name)) return undefined;
  const listing = await run(xrandr, ["--listmonitors"]);
  return listing ? parseMonitorGeometry(listing, name) : undefined;
}

export function createWindowPlacement(options: {
  readonly directory: string;
  readonly screen: () => WindowPlacementScreen;
  readonly platform: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly onWindows: () => readonly PlacedWindow[];
}) {
  const store = createApplicationDocumentStore<WindowPlacementDocument>(
    {
      fileName: "window-placement.json",
      version: 1,
      empty: () => ({ displays: {} }),
      validate: validateWindowPlacementDocument,
    },
    { directory: options.directory },
  );
  let document: WindowPlacementDocument = { displays: {} };
  let target: PlacementDisplay | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void store.save(document).catch(() => {});
    }, SAVE_DELAY_MS);
  };
  const remember = (window: PlacedWindow) => {
    if (window.isDestroyed() || window.isFullScreen()) return;
    const bounds = window.getNormalBounds();
    const display = options.screen().getDisplayMatching(bounds);
    document = {
      displays: {
        ...document.displays,
        [displayKey(display)]: {
          x: Math.round(bounds.x - display.bounds.x),
          y: Math.round(bounds.y - display.bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          maximized: window.isMaximized(),
        },
      },
    };
    persist();
  };

  return {
    async load() {
      document = (await store.load()).value;
    },
    // Finds the display the user is working on, before a window opens.
    async prepare() {
      const screen = options.screen();
      const monitor =
        options.platform === "linux"
          ? await activeKdeMonitor(options.environment).catch(() => undefined)
          : undefined;
      target = monitor
        ? screen.getDisplayMatching(monitor)
        : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    },
    // Bounds for the next window, on the prepared display.
    next(
      defaultSize: { readonly width: number; readonly height: number },
      minimumSize: { readonly width: number; readonly height: number },
    ): RememberedPlacement {
      const screen = options.screen();
      const display =
        target ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      return placeWindow({
        display,
        remembered: document.displays[displayKey(display)],
        defaultSize,
        minimumSize,
        occupied: options
          .onWindows()
          .filter((window) => !window.isDestroyed())
          .map((window) => window.getNormalBounds()),
      });
    },
    // Remembers where the window is whenever it moves, resizes or closes,
    // and restores a remembered maximized state when it first shows.
    track(window: PlacedWindow, placement: RememberedPlacement) {
      let shown = false;
      const changed = () => {
        if (shown) remember(window);
      };
      window.once("ready-to-show", () => {
        if (placement.maximized) window.maximize();
        shown = true;
      });
      for (const event of ["move", "resize", "maximize", "unmaximize"] as const)
        window.on(event, changed);
      window.once("close", () => remember(window));
    },
    // The final layout is written synchronously while the application exits.
    flush() {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = undefined;
      try {
        store.saveSync(document);
      } catch {
        // The previous placement file stays.
      }
    },
  };
}

export type WindowPlacement = ReturnType<typeof createWindowPlacement>;
