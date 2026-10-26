import type { BrowserWindow } from "electron";
import {
  recordResttyHostPhase as recordPhase,
  recordOutputRefitProgress,
  recordOutputRefitBoundary,
  type OutputRefitProgress,
} from "./restty-host-phases";

// Keep the ordinary producer unchanged. This control pauses its identical
// checkpoint bytes at an insertion boundary until the real host refit finishes.
export function outputRefitProducer(checkpoints: number): string {
  return `
const records=4096; let batch=0, remainder='', command='', phase='start';
if(process.stdin.isTTY) process.stdin.setRawMode(true);
const checkpoint=()=> '__OMXTERM_BATCH_'+String(batch).padStart(2,'0')+'_BEGIN__'+Array.from({length:records},(_,i)=>String(batch*records+i).padStart(8,'0')+':'+'x'.repeat(23)).join('')+'__OMXTERM_BATCH_'+String(batch).padStart(2,'0')+'_END__';
process.stdin.on('data',(data)=>{
 for(const key of data.toString()) {
   if(phase==='start') {
     if(key==='g'){command='';phase='cut';}
   } else if(phase==='cut') {
     if(/[0-9]/.test(key))command+=key;
     else if(key===';' && command) {
       const cut=Number(command), text=checkpoint();
       if(cut<65536 || cut>=text.length)throw new Error('Invalid refit prefix');
       remainder=text.slice(cut);process.stdout.write(text.slice(0,cut));phase='refit';
     } else {command='';phase='start';}
   } else if(phase==='refit' && key==='r') {
     process.stdout.write(remainder);remainder='';batch++;phase='next';
   } else if(phase==='next') {
     if(batch===${checkpoints} && key==='x') {
       phase='exit';process.stdout.write('',()=>process.exit(0));
     } else if(batch<${checkpoints} && key==='n') {
       process.stdout.write(checkpoint());batch++;
     }
   }
 }
});
process.stdin.resume(); process.stdout.write('\\x1b[?25l__OMXTERM_OUTPUT_READY__');
`;
}

// Native startup bytes remain in the original source/ACK totals. Measure the
// acknowledged baseline before starting the producer's identical ASCII prefix.
export function createOutputRefitPrefix({
  prefixUnits,
  readProgress,
}: {
  readonly prefixUnits: number;
  readonly readProgress: () => {
    readonly sourceBytes: number;
    readonly cumulativeAck: number;
    readonly pendingBytes: number;
  };
}) {
  const baselineBytes = readProgress().sourceBytes;
  return {
    ready() {
      const progress = readProgress();
      return (
        progress.sourceBytes === baselineBytes + prefixUnits &&
        progress.cumulativeAck === progress.sourceBytes &&
        progress.pendingBytes === 0
      );
    },
    evidence: () => ({
      baselineBytes,
      prefixUnits,
      expectedSourceBytes: baselineBytes + prefixUnits,
      ...readProgress(),
    }),
  };
}

export async function prepareOutputRefit({
  window,
  sizes,
  readProgress,
  waitFor,
  beforeRefit,
}: {
  readonly window: BrowserWindow;
  readonly sizes: readonly { cols: number; rows: number }[];
  readonly readProgress: () => OutputRefitProgress;
  readonly beforeRefit?: (
    onReturn: (cols: number, rows: number, requestCount: number) => void,
  ) => void;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const original = sizes.at(-1)!;
  recordPhase("refit-layout", "begin");
  const layout = (await window.webContents.executeJavaScript(
    `(() => {
      const surface = document.querySelector('.restty-terminal-surface');
      return {width:surface.getBoundingClientRect().width, maxWidth:surface.style.maxWidth};
    })()`,
    true,
  )) as { width: number; maxWidth: string };
  recordPhase("refit-layout", "complete");
  const setWidth = async (width: string) => {
    await window.webContents.executeJavaScript(
      `(() => {
        const surface = document.querySelector('.restty-terminal-surface');
        // The producer's ordinary exit may already have removed its tab.
        if (surface) surface.style.maxWidth = ${JSON.stringify(width)};
      })()`,
      true,
    );
  };
  const restore = () => setWidth(layout.maxWidth);
  try {
    recordPhase("refit-calibration", "begin");
    await setWidth(`${layout.width - 50}px`);
    await waitFor(
      () => sizes.at(-1)!.cols < original.cols,
      "controlled output refit calibration",
    );
    recordPhase("refit-calibration", "complete");
    const refitted = sizes.at(-1)!;
    if (refitted.cols < 20 || refitted.rows !== original.rows)
      throw new Error(
        "Output width refit needs at least 20 columns and unchanged rows",
      );
    recordPhase("refit-restoration", "begin");
    await restore();
    await waitFor(
      () => sizes.at(-1)!.cols === original.cols,
      "controlled output refit restoration",
    );
    recordPhase("refit-restoration", "complete");
    // READY has 24 printable units (plus six cursor-hide control units).
    // Choose a prefix above high water, exactly at the old right edge, but not
    // at the new right edge. Grid requests are observed, not native success or
    // proof of parser cursor placement in the presence of transport envelope.
    let visibleUnits = Math.ceil((65_536 + 24) / original.cols) * original.cols;
    if (visibleUnits % refitted.cols === 0) visibleUnits += original.cols;
    if (visibleUnits % refitted.cols === 0)
      throw new Error(
        "Output refit cannot distinguish the old and new right edges",
      );
    const prefixUnits = visibleUnits - 24;
    recordPhase("refit-baseline-ack", "begin");
    await waitFor(() => {
      const progress = readProgress();
      return (
        progress.cumulativeAck === progress.sourceBytes &&
        progress.pendingBytes === 0
      );
    }, "row-end prefix acknowledged native baseline");
    recordPhase("refit-baseline-ack", "complete");
    const prefix = createOutputRefitPrefix({ prefixUnits, readProgress });
    const trace = (
      phase: "baseline" | "prefix-enter" | "prefix-ready" | "prefix-failure",
    ) => recordOutputRefitProgress(phase, readProgress(), prefix.evidence());
    trace("baseline");
    return {
      original,
      refitted,
      prefixUnits,
      restore,
      async refit() {
        trace("prefix-enter");
        recordPhase("refit-prefix-ack", "begin");
        try {
          await waitFor(
            prefix.ready,
            "row-end prefix complete original output acknowledgement",
          );
        } catch (error) {
          trace("prefix-failure");
          throw error;
        }
        recordPhase("refit-prefix-ack", "complete");
        const prefixAcknowledgement = prefix.evidence();
        trace("prefix-ready");
        const count = sizes.length;
        recordPhase("refit-native-grid", "begin");
        let firstReturn:
          | {
              returnedCols: number;
              returnedRows: number;
              returnedRequestCount: number;
            }
          | undefined;
        let gridAfterReturn = true;
        beforeRefit?.((returnedCols, returnedRows, returnedRequestCount) => {
          if (firstReturn) return;
          firstReturn = { returnedCols, returnedRows, returnedRequestCount };
          try {
            const latest = sizes.at(-1)!;
            recordPhase("refit-resize-call", "complete", undefined, {
              ...firstReturn,
              countBefore: count,
              expectedCols: refitted.cols,
              expectedRows: original.rows,
              requestCount: sizes.length,
              latestRequestedCols: latest.cols,
              latestRequestedRows: latest.rows,
            });
          } catch {
            /* Publish the return before any fallible snapshot/write. */
          }
        });
        const boundary = (
          phase: Parameters<typeof recordOutputRefitBoundary>[0],
          result?: Parameters<typeof recordOutputRefitBoundary>[2],
        ) => {
          try {
            const latest = sizes.at(-1);
            if (!latest) return;
            recordOutputRefitBoundary(
              phase,
              {
                countBefore: count,
                requestCount: sizes.length,
                expectedCols: refitted.cols,
                expectedRows: original.rows,
                latestRequestedCols: latest.cols,
                latestRequestedRows: latest.rows,
                ...(firstReturn
                  ? { returnedRequestCount: firstReturn.returnedRequestCount }
                  : {}),
              },
              result,
            );
          } catch {
            /* Snapshot failure cannot change the awaited operation. */
          }
        };
        boundary("width-enter");
        try {
          await setWidth(`${layout.width - 50}px`);
        } catch (error) {
          boundary("width-settled", "rejected");
          throw error;
        }
        boundary("width-settled", "fulfilled");
        await waitFor(() => {
          const ready =
            sizes.length > count &&
            sizes.at(-1)!.cols === refitted.cols &&
            sizes.at(-1)!.rows === original.rows;
          if (firstReturn && gridAfterReturn) {
            gridAfterReturn = false;
            boundary("grid-after-resize-return", ready);
          }
          return ready;
        }, "controlled output Surface grid and PTY resize request");
        recordPhase("refit-native-grid", "complete");
        return prefixAcknowledgement;
      },
    };
  } catch (error) {
    await restore();
    throw error;
  }
}
