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
// Only the harness's phase commands pace output; numeric DA/CPR/cell replies
// contain none of these letters, even when split or coalesced with a command.
process.stdin.on('data',(data)=>{for(const command of data.toString()){
  if(!waiting||command!==(batch===${batches}?'x':batch===0?'g':'n'))continue;
  waiting=false; if(batch===${batches})process.exit(0);else emit();
}});
process.stdin.resume(); process.stdout.write('\\x1b[?25l__OMXTERM_OUTPUT_READY__');
`;
}

export function createOutputSourceObserver(batches = OUTPUT_CHECKPOINTS) {
  const namespace = "__OMXTERM_BATCH_";
  const readyMarker = "__OMXTERM_OUTPUT_READY__";
  const frameBytes = OUTPUT_CHECKPOINT_RECORDS * OUTPUT_RECORD_BYTES + 26 + 24;
  let bytes = 0;
  let records = 0;
  let batch = 0;
  let inBody = false;
  let remainder = "";
  let readyTail = "";
  let ready = false;
  let finalized = false;
  let failure: Error | undefined;
  const fail = (message: string): never => {
    failure = new Error(message);
    throw failure;
  };
  const evidence = () => ({
    bytes,
    records,
    recordBytes: records * OUTPUT_RECORD_BYTES,
    checkpoints: batch,
    endSeen: batch === batches,
    framedBytes: batch * frameBytes,
    // Only ASCII frame/prefix carry is subtracted. Count original UTF-8 chunks,
    // never sliced envelope surrogates (which can change byte accounting).
    envelopeBytes:
      bytes -
      batch * frameBytes -
      (inBody ? 26 + (records - batch * OUTPUT_CHECKPOINT_RECORDS) * 32 : 0) -
      remainder.length,
    bufferedCodeUnits: remainder.length,
    finalized,
  });
  return {
    observe(data: string) {
      if (failure) throw failure;
      if (finalized) fail("Source output observed after finalization");
      bytes += Buffer.byteLength(data);
      const readiness = readyTail + data;
      ready ||= readiness.includes(readyMarker);
      readyTail = ready ? "" : readiness.slice(-(readyMarker.length - 1));
      remainder += data;
      while (true) {
        if (!inBody) {
          const from = remainder.indexOf(namespace);
          if (from < 0) {
            // Outside frames, retain only a possible reserved namespace prefix.
            let keep = Math.min(remainder.length, namespace.length - 1);
            while (keep > 0 && !namespace.startsWith(remainder.slice(-keep)))
              keep--;
            remainder = keep ? remainder.slice(-keep) : "";
            return;
          }
          remainder = remainder.slice(from);
          const begin = outputCheckpointMarker(batch);
          if (
            batch >= batches ||
            !begin.startsWith(remainder.slice(0, begin.length))
          )
            fail(`Source output checkpoint ${batch} reserved framing`);
          if (remainder.length < begin.length) return;
          remainder = remainder.slice(begin.length);
          inBody = true;
        }
        const limit = (batch + 1) * OUTPUT_CHECKPOINT_RECORDS;
        while (records < limit) {
          const record = outputRecord(records);
          if (!record.startsWith(remainder.slice(0, OUTPUT_RECORD_BYTES)))
            fail(`Source output stress order at ${records}`);
          if (remainder.length < OUTPUT_RECORD_BYTES) return;
          remainder = remainder.slice(OUTPUT_RECORD_BYTES);
          records++;
        }
        const end = outputCheckpointMarker(batch, true);
        if (!end.startsWith(remainder.slice(0, end.length)))
          fail(`Source output checkpoint ${batch} framing`);
        if (remainder.length < end.length) return;
        remainder = remainder.slice(end.length);
        batch++;
        inBody = false;
      }
    },
    ready: () => ready,
    checkpoints: () => batch,
    evidence,
    finalize() {
      if (failure) throw failure;
      if (inBody || remainder.length || batch !== batches)
        fail(`Source output incomplete framing at checkpoint ${batch}`);
      const result = evidence();
      if (result.framedBytes + result.envelopeBytes !== bytes)
        fail("Source output transport accounting differs");
      finalized = true;
      return evidence();
    },
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
