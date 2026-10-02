export const OUTPUT_CHECKPOINT_RECORDS = 4_096;
export const OUTPUT_RECORD_BYTES = 32;
export const OUTPUT_CHECKPOINTS = 16;

export function outputRecord(index: number): string {
  return `${String(index).padStart(8, "0")}:${"x".repeat(23)}`;
}

export function outputCheckpointMarker(batch: number, end = false): string {
  return `__OMXTERM_BATCH_${String(batch).padStart(2, "0")}_${end ? "END" : "BEGIN"}__`;
}

export function outputCheckpointText(batch: number): string {
  return (
    outputCheckpointMarker(batch) +
    Array.from({ length: OUTPUT_CHECKPOINT_RECORDS }, (_, offset) =>
      outputRecord(batch * OUTPUT_CHECKPOINT_RECORDS + offset),
    ).join("") +
    outputCheckpointMarker(batch, true)
  );
}

export function outputCheckpointProducer(batches = OUTPUT_CHECKPOINTS): string {
  return `
const records=${OUTPUT_CHECKPOINT_RECORDS}; let batch=0, index=0, waiting=true;
if(process.stdin.isTTY) process.stdin.setRawMode(true);
const marker=(end)=>'__OMXTERM_BATCH_'+String(batch).padStart(2,'0')+'_'+(end?'END':'BEGIN')+'__';
const emit=()=>{
  if(index===0) process.stdout.write(marker(false));
  while(index<records){const n=batch*records+index++; if(!process.stdout.write(String(n).padStart(8,'0')+':'+'x'.repeat(23))){process.stdout.once('drain',emit); return;}}
  process.stdout.write(marker(true)); batch++; index=0; waiting=true;
};
process.stdin.on('data',()=>{if(!waiting)return; waiting=false; if(batch===${batches})process.exit(0);else emit();});
process.stdin.resume(); process.stdout.write('\\x1b[?25l__OMXTERM_OUTPUT_READY__');
`;
}

export function createOutputSourceObserver(batches = OUTPUT_CHECKPOINTS) {
  let bytes = 0;
  let records = 0;
  let batch = 0;
  let inBody = false;
  let remainder = "";
  let ready = false;
  return {
    observe(data: string) {
      bytes += Buffer.byteLength(data);
      remainder += data;
      ready ||= remainder.includes("__OMXTERM_OUTPUT_READY__");
      while (batch < batches) {
        if (!inBody) {
          const marker = outputCheckpointMarker(batch);
          const from = remainder.indexOf(marker);
          if (from < 0) {
            remainder = remainder.slice(-Math.max(marker.length, 24));
            return;
          }
          remainder = remainder.slice(from + marker.length);
          inBody = true;
        }
        const limit = (batch + 1) * OUTPUT_CHECKPOINT_RECORDS;
        while (records < limit && remainder.length >= OUTPUT_RECORD_BYTES) {
          if (remainder.slice(0, OUTPUT_RECORD_BYTES) !== outputRecord(records))
            throw new Error(`Source output stress order at ${records}`);
          remainder = remainder.slice(OUTPUT_RECORD_BYTES);
          records++;
        }
        if (records < limit) return;
        const end = outputCheckpointMarker(batch, true);
        if (remainder.length < end.length) return;
        if (!remainder.startsWith(end))
          throw new Error(`Source output checkpoint ${batch} framing`);
        remainder = remainder.slice(end.length);
        batch++;
        inBody = false;
      }
    },
    ready: () => ready,
    checkpoints: () => batch,
    evidence: () => ({
      bytes,
      records,
      recordBytes: records * OUTPUT_RECORD_BYTES,
      checkpoints: batch,
      endSeen: batch === batches,
      remainderCodeUnits: remainder.length,
    }),
  };
}

// Called only with an actual Select All/Copy result, never the source stream.
export function assertOutputCheckpoint(text: string, batch: number) {
  const begin = outputCheckpointMarker(batch);
  const end = outputCheckpointMarker(batch, true);
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  const failure = (reason: string) =>
    new Error(
      `Destination checkpoint ${batch} ${reason} (END present: ${to >= 0})`,
    );
  if (from < 0) throw failure("missing BEGIN");
  if (to < from + begin.length) throw failure("missing ordered END");
  if (
    text.indexOf(begin, from + begin.length) >= 0 ||
    text.indexOf(end, to + end.length) >= 0
  )
    throw failure("duplicate framing");
  const body = text.slice(from + begin.length, to);
  if (body.length !== OUTPUT_CHECKPOINT_RECORDS * OUTPUT_RECORD_BYTES)
    throw failure(`record length ${body.length}`);
  const first = batch * OUTPUT_CHECKPOINT_RECORDS;
  for (let offset = 0; offset < OUTPUT_CHECKPOINT_RECORDS; offset++) {
    const index = first + offset;
    if (
      body.slice(
        offset * OUTPUT_RECORD_BYTES,
        (offset + 1) * OUTPUT_RECORD_BYTES,
      ) !== outputRecord(index)
    )
      throw failure(`order at ${index}`);
  }
  return {
    batch,
    first,
    last: first + OUTPUT_CHECKPOINT_RECORDS - 1,
    records: OUTPUT_CHECKPOINT_RECORDS,
    recordBytes: body.length,
    endSeen: true,
  };
}
