import type { BrowserWindow } from "electron";

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

export async function prepareOutputRefit({
  window,
  sizes,
  waitFor,
}: {
  readonly window: BrowserWindow;
  readonly sizes: readonly { cols: number; rows: number }[];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const original = sizes.at(-1)!;
  const layout = (await window.webContents.executeJavaScript(
    `(() => {
      const surface = document.querySelector('.restty-terminal-surface');
      return {width:surface.getBoundingClientRect().width, maxWidth:surface.style.maxWidth};
    })()`,
    true,
  )) as { width: number; maxWidth: string };
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
    await setWidth(`${layout.width - 50}px`);
    await waitFor(
      () => sizes.at(-1)!.cols < original.cols,
      "controlled output refit calibration",
    );
    const refitted = sizes.at(-1)!;
    if (refitted.cols < 20 || refitted.rows !== original.rows)
      throw new Error(
        "Output width refit needs at least 20 columns and unchanged rows",
      );
    await restore();
    await waitFor(
      () => sizes.at(-1)!.cols === original.cols,
      "controlled output refit restoration",
    );
    // READY has 24 printable units (plus six cursor-hide control units).
    // Choose a prefix above high water, exactly at the old right edge, but not
    // at the new right edge. Geometry is observed, never guessed from pixels.
    let visibleUnits = Math.ceil((65_536 + 24) / original.cols) * original.cols;
    if (visibleUnits % refitted.cols === 0) visibleUnits += original.cols;
    if (visibleUnits % refitted.cols === 0)
      throw new Error(
        "Output refit cannot distinguish the old and new right edges",
      );
    const prefixUnits = visibleUnits - 24;
    return {
      original,
      refitted,
      prefixUnits,
      restore,
      async refit() {
        const count = sizes.length;
        await setWidth(`${layout.width - 50}px`);
        await waitFor(
          () =>
            sizes.length > count &&
            sizes.at(-1)!.cols === refitted.cols &&
            sizes.at(-1)!.rows === original.rows,
          "controlled output native Surface and PTY refit",
        );
      },
    };
  } catch (error) {
    await restore();
    throw error;
  }
}
