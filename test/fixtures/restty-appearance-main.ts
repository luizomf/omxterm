export function resttyAppearanceMainSource(
  expectedColors: readonly string[],
  resultPrefix: string,
): string {
  return (
    `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
for (const name of ["userData", "sessionData"]) {
  const directory = path.join(__dirname, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const expectedColors = ${JSON.stringify(expectedColors)};
const palette = expectedColors.map(color => ({
  color,
  r: Number.parseInt(color.slice(1, 3), 16),
  g: Number.parseInt(color.slice(3, 5), 16),
  bl: Number.parseInt(color.slice(5, 7), 16),
}));
const countColors = (bitmap) => {
  const counts = Object.fromEntries(expectedColors.map((color) => [color, 0]));
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const a = bitmap[offset], b = bitmap[offset + 1], c = bitmap[offset + 2];
    for (const { color, r, g, bl } of palette) {
      const near = (left, right) => Math.abs(left - right) <= 3;
      if ((near(a, r) && near(b, g) && near(c, bl)) || (near(a, bl) && near(b, g) && near(c, r))) counts[color] += 1;
    }
  }
  return counts;
};
async function waitForResult(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript("globalThis.__omxtermResttyAppearanceResult ?? null", true);
    if (result) return result;
    const error = await window.webContents.executeJavaScript('document.body.dataset.fixtureError ?? null', true);
    if (error) throw new Error(error);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty appearance fixture timed out");
}
let fixtureWindow;
let firstCapture;
let lastCapture;
const samples = [];
const artifactDirectory = process.env.OMXTERM_RESTTY_APPEARANCE_ARTIFACT_DIRECTORY;
const persistCaptures = (error) => {
  const stagingDirectory = path.join(__dirname, 'captures', path.basename(artifactDirectory));
  fs.mkdirSync(stagingDirectory, { recursive: true });
  if (firstCapture) fs.writeFileSync(path.join(stagingDirectory, 'first.png'), firstCapture.image.toPNG());
  if (lastCapture) fs.writeFileSync(path.join(stagingDirectory, 'last.png'), lastCapture.image.toPNG());
  fs.writeFileSync(path.join(stagingDirectory, 'state.json'), JSON.stringify({
    error: error ? String(error && error.stack ? error.stack : error) : null,
    requestedDPR: process.env.OMXTERM_RESTTY_APPEARANCE_REQUESTED_DPR,
    deferFrames: process.env.OMXTERM_RESTTY_APPEARANCE_DEFER_FRAME === '1',
    gateFrames: process.env.OMXTERM_RESTTY_APPEARANCE_GATE_FRAMES === '1',
    samples,
  }, null, 2) + '\\n');
  if (error || process.env.OMXTERM_RESTTY_APPEARANCE_GATE_FRAMES === '1'
      || process.env.OMXTERM_RESTTY_APPEARANCE_EVIDENCE_PATH
      || process.env.OMXTERM_RESTTY_APPEARANCE_SCREENSHOT_PATH) {
    fs.cpSync(stagingDirectory, artifactDirectory, { recursive: true });
    process.stderr.write('Synthetic capture artifacts: ' + artifactDirectory + '\\n');
  }
};
const beforeDeadline = async (operation, deadline) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Selection capture readiness deadline exceeded');
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Selection capture readiness deadline exceeded')), remaining);
      }),
    ]);
  } finally { clearTimeout(timer); }
};
const selectionState = (window, deadline) => beforeDeadline(
  () => window.webContents.executeJavaScript('globalThis.__omxtermSelectionState()', true), deadline,
);
async function captureSample(window, phase, deadline) {
  const sample = { phase, captureStartedAt: Date.now(), before: await selectionState(window, deadline) };
  samples.push(sample);
  if (phase !== 'failure' && !sample.before.exactCopy)
    throw new Error('Exact synthetic selection was lost during capture readiness');
  const image = await beforeDeadline(() => window.webContents.capturePage(), deadline);
  const captured = { image, sample };
  firstCapture ??= captured;
  lastCapture = captured;
  sample.captureCompletedAt = Date.now();
  sample.counts = countColors(image.toBitmap());
  sample.after = await selectionState(window, deadline);
  return captured;
}
function assertSelection(captured) {
  if (!captured.sample.before.exactCopy || !captured.sample.after.exactCopy)
    throw new Error('Exact synthetic selection was lost during capture readiness');
}
function colorsReady(captured) {
  return expectedColors.every(color => captured.sample.counts[color] > 0)
    && captured.sample.counts['#201012'] > captured.sample.counts['#90105a'];
}
async function captureReady(window, first, phase, duration = 3000) {
  const deadline = Date.now() + duration;
  let captured = first;
  for (;;) {
    assertSelection(captured);
    if (Date.now() >= deadline) throw new Error('Selection capture readiness deadline exceeded');
    // RAF completion alone does not establish compositor presentation. Only a
    // captured bitmap satisfying the unchanged color assertions is ready.
    if (colorsReady(captured)) return captured;
    await beforeDeadline(() => window.webContents.executeJavaScript('globalThis.__omxtermSelectionFrame()', true), deadline);
    captured = await captureSample(window, phase, deadline);
  }
}
` + appearanceRunSource(resultPrefix)
  );
}

function appearanceRunSource(resultPrefix: string): string {
  return `app.whenReady().then(async () => {
  const window = fixtureWindow = new BrowserWindow({
    width: 800,
    height: 500,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  await window.loadFile(path.join(__dirname, "index.html"), {
    query: {
      deferFrames: String(process.env.OMXTERM_RESTTY_APPEARANCE_DEFER_FRAME === '1'),
      gateFrames: String(process.env.OMXTERM_RESTTY_APPEARANCE_GATE_FRAMES === '1'),
    },
  });
  window.showInactive();
  let result = await waitForResult(window);
  let bounds = await window.webContents.executeJavaScript("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()", true);
  const cellWidth = result.live.cellWidth / result.devicePixelRatio;
  const cellHeight = result.live.cellHeight / result.devicePixelRatio;
  const x = Math.round(bounds.x + cellWidth * 0.5);
  const y = Math.round(bounds.y + cellHeight * 2.5);
  const selection = await require('./selection.cjs').exerciseAppearanceSelection(window,
    { x, y, cellWidth }, process.env.OMXTERM_RESTTY_APPEARANCE_MIXED_POINTER === '1');
  const first = await captureSample(window, 'first-after-copy-and-two-frames', Date.now() + 3000);
  assertSelection(first);
  const controlled = process.env.OMXTERM_RESTTY_APPEARANCE_GATE_FRAMES === '1';
  let heldDeadlineRejected = false;
  if (controlled) {
    if (!selection.beforeFrame || !selection.afterFrame || !first.sample.after.gateHeld
        || first.sample.after.heldCallbacks.length === 0 || first.sample.after.frameCount !== 2
        || first.sample.counts['#314159'] !== 0)
      throw new Error('Controlled gate did not reproduce capture-before-readiness rejection');
    // Reuse this live setup for the permanently held negative control. The
    // same readiness path must reject on its deadline, never on selection loss.
    try { await captureReady(window, first, 'permanently-held', 1000); }
    catch (error) {
      if (error.message !== 'Selection capture readiness deadline exceeded') throw error;
      heldDeadlineRejected = true;
    }
    if (!heldDeadlineRejected) throw new Error('Permanently held frames incorrectly became capture-ready');
    const heldSamples = samples.filter(sample => sample.phase === 'permanently-held');
    if (!heldSamples.some(sample => sample.after)
        || heldSamples.some(sample => sample.counts && sample.counts['#314159'] !== 0))
      throw new Error('Held-frame deadline control lacked an unpainted captured frame');
    const heldState = await selectionState(window, Date.now() + 3000);
    if (!heldState.exactCopy || !heldState.gateHeld || heldState.heldCallbacks.length === 0)
      throw new Error('Controlled selection or gate was lost before release');
    await window.webContents.executeJavaScript('globalThis.__omxtermReleaseSelectionFrames()', true);
  }
  const ready = await captureReady(window, first, controlled ? 'released' : 'readiness');
  // Stage evidence before later font remounts/captures, including if a child is
  // terminated before it can report those assertions to the parent.
  persistCaptures();
  const image = ready.image;
  if (process.env.OMXTERM_RESTTY_APPEARANCE_SCREENSHOT_PATH)
    fs.writeFileSync(process.env.OMXTERM_RESTTY_APPEARANCE_SCREENSHOT_PATH, image.toPNG());
  const captureInk = async (row) => {
    const region = await window.webContents.capturePage({
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y + (result.live.cellHeight / result.devicePixelRatio) * (row - 1)),
      width: Math.ceil((result.live.cellWidth / result.devicePixelRatio) * 8),
      height: Math.ceil(result.live.cellHeight / result.devicePixelRatio),
    });
    const bitmap = region.toBitmap();
    let ink = 0;
    for (let offset = 0; offset < bitmap.length; offset += 4)
      if (Math.max(bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]) > 40) ink += 1;
    return { ink, bitmap };
  };
  const [regular, bold, firaCoverage, dejaVuCoverage, missing] = await Promise.all(
    [4, 5, 6, 7, 8].map(captureInk),
  );
  const preferences = window.webContents.getLastWebPreferences();
  const complete = {
    ...result,
    colorCounts: ready.sample.counts,
    selection,
    ...(controlled ? { controlledReadiness: {
      firstSelectionPixels: first.sample.counts['#314159'],
      firstExactCopy: first.sample.before.exactCopy && first.sample.after.exactCopy,
      firstFrameCount: first.sample.after.frameCount,
      heldCallbacks: first.sample.after.heldCallbacks.length,
      heldDeadlineRejected,
      heldCaptures: samples.filter(sample => sample.phase === 'permanently-held' && sample.after).length,
      releasedCallbacks: ready.sample.after.releasedCallbacks,
      completedCallbacks: ready.sample.after.releasedFrameTimes.length,
      finalExactCopy: ready.sample.before.exactCopy && ready.sample.after.exactCopy,
      artifactDirectory: path.join('.scratch', path.basename(artifactDirectory)),
    } } : {}),
    fontRendering: {
      regularInk: regular.ink,
      boldInk: bold.ink,
      firaCoverageInk: firaCoverage.ink,
      dejaVuCoverageInk: dejaVuCoverage.ink,
      firaDiffersFromMissing: !firaCoverage.bitmap.equals(missing.bitmap),
      dejaVuDiffersFromMissing: !dejaVuCoverage.bitmap.equals(missing.bitmap),
    },
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  await window.webContents.executeJavaScript('globalThis.__omxtermRenderConfiguredFont(false)', true);
  result = await waitForResult(window);
  bounds = await window.webContents.executeJavaScript("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()", true);
  const configuredFrameDeferred = result.deferredOutputFrame;
  const configuredRegular = await captureInk(4);
  const configuredBold = await captureInk(5);
  await window.webContents.executeJavaScript('globalThis.__omxtermRenderConfiguredFont(true)', true);
  result = await waitForResult(window);
  const referenceRegular = await captureInk(4);
  const referenceBold = await captureInk(5);
  complete.configuredFont = {
    regularInk: configuredRegular.ink,
    deferredFrame: configuredFrameDeferred,
    preservesConfiguredRendering: configuredRegular.bitmap.equals(referenceRegular.bitmap) && configuredBold.bitmap.equals(referenceBold.bitmap),
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(complete) + "\\n");
  window.destroy();
  app.exit(0);
}).catch(async (error) => {
  // Persist synthetic-only evidence before Electron exits and the parent removes
  // the temporary profile, even when optional diagnostics were not requested.
  try {
    if (fixtureWindow && !fixtureWindow.isDestroyed()) {
      try { await captureSample(fixtureWindow, 'failure', Date.now() + 3000); }
      catch (captureError) {
        samples.push({ phase: 'failure-observation', error: String(captureError) });
        // State observation can be unavailable (e.g. renderer setup failed), but
        // still preserve the first/last available synthetic page image.
        try {
          const image = await beforeDeadline(() => fixtureWindow.webContents.capturePage(), Date.now() + 3000);
          const sample = { phase: 'failure-image-only', capturedAt: Date.now(), counts: countColors(image.toBitmap()) };
          samples.push(sample);
          firstCapture ??= { image, sample };
          lastCapture = { image, sample };
        } catch (imageError) { samples.push({ phase: 'failure-image-unavailable', error: String(imageError) }); }
      }
    }
    persistCaptures(error);
  } catch (artifactError) { process.stderr.write('Capture artifact failure: ' + String(artifactError) + '\\n'); }
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}
