// Fixture-only lexical observation: never alters PTY data or proves provenance.
const QUERY = "\u001b[6n";
const MAX_COORDINATE = 1000; // Matches the Terminal Adapter's bounded grid.
const MAX_OUTPUT = 65536;
const MAX_EVENTS = 1024;

function parseCpr(data) {
  if (typeof data !== "string") return null;
  const match = /^\u001b\[([1-9][0-9]{0,3});([1-9][0-9]{0,3})R$/.exec(data);
  if (!match) return null;
  const row = Number(match[1]);
  const column = Number(match[2]);
  return row <= MAX_COORDINATE && column <= MAX_COORDINATE
    ? { row, column }
    : null;
}

function createWindowsCprTrace() {
  let sequence = 0;
  let outputLength = 0;
  let writeEnd = 0;
  let tail = "";
  let nextRequest = 0;
  let incomplete = false;
  const requests = [];
  const replies = [];
  return {
    output(data) {
      sequence++;
      if (typeof data !== "string") {
        incomplete = true;
        return;
      }
      const combined = tail + data;
      const base = outputLength - tail.length;
      outputLength += data.length;
      if (outputLength > MAX_OUTPUT) incomplete = true;
      let index = 0;
      while ((index = combined.indexOf(QUERY, index)) !== -1) {
        if (requests.length < MAX_EVENTS)
          requests.push({ offset: base + index, sequence });
        else incomplete = true;
        index += QUERY.length;
      }
      tail = combined.slice(-(QUERY.length - 1));
    },
    write(index, data) {
      sequence++;
      if (!Number.isSafeInteger(index) || index !== writeEnd) incomplete = true;
      writeEnd = index + 1;
      if (!parseCpr(data)) return;
      if (replies.length >= MAX_EVENTS) {
        incomplete = true;
        return;
      }
      const requestIndex = nextRequest < requests.length ? nextRequest++ : null;
      replies.push({ index, sequence, requestIndex });
    },
    snapshot() {
      return {
        classification: "syntactic-cpr-observation-not-provenance",
        outputLength,
        writeEnd,
        sequence,
        incomplete,
        requests: requests.map((request) => ({ ...request })),
        replies: replies.map((reply) => ({ ...reply })),
      };
    },
  };
}

// Recheck the bounded, ordered observation against the unchanged raw arrays.
// One earlier lexical query can account for at most one standalone CPR write.
function validateWindowsCprTrace(writes, context) {
  const { output, outputTruncated, captureError, trace } = context ?? {};
  if (
    captureError !== undefined ||
    typeof output !== "string" ||
    outputTruncated !== false ||
    !trace ||
    trace.classification !== "syntactic-cpr-observation-not-provenance" ||
    trace.incomplete !== false ||
    trace.outputLength !== output.length ||
    output.length > MAX_OUTPUT ||
    !Number.isSafeInteger(trace.writeEnd) ||
    trace.writeEnd < 0 ||
    trace.writeEnd > writes.length ||
    !Number.isSafeInteger(trace.sequence) ||
    trace.sequence < trace.writeEnd ||
    !Array.isArray(trace.requests) ||
    !Array.isArray(trace.replies) ||
    trace.requests.length > MAX_EVENTS ||
    trace.replies.length > MAX_EVENTS
  )
    throw Error("CPR observation unavailable or truncated");

  const offsets = [];
  let search = 0;
  while ((search = output.indexOf(QUERY, search)) !== -1) {
    offsets.push(search);
    search += QUERY.length;
  }
  if (offsets.length !== trace.requests.length)
    throw Error("CPR request observation mismatch");
  let previousSequence = 0;
  for (const [index, request] of trace.requests.entries()) {
    if (
      !request ||
      request.offset !== offsets[index] ||
      !Number.isSafeInteger(request.sequence) ||
      request.sequence < previousSequence ||
      request.sequence <= 0 ||
      request.sequence > trace.sequence
    )
      throw Error("CPR request observation mismatch");
    previousSequence = request.sequence;
  }

  const requestSequences = new Set(
    trace.requests.map((request) => request.sequence),
  );
  const queryCallbacks = [...requestSequences];
  // Every write consumes a callback; each distinct query sequence consumes one
  // output callback. An output callback may carry multiple queries. Even
  // output without any query requires at least one output callback.
  const minimumOutputCallbacks =
    queryCallbacks.length || (output.length ? 1 : 0);
  if (trace.sequence - trace.writeEnd < minimumOutputCallbacks)
    throw Error("CPR callback order mismatch");
  const replies = new Map();
  let response = 0;
  let previousReplySequence = 0;
  let previousReplyIndex = -1;
  let queryIndex = 0;
  for (let index = 0; index < trace.writeEnd; index++) {
    const position = parseCpr(writes[index]);
    if (!position) continue;
    const row = trace.replies[response];
    const request = trace.requests[response];
    if (
      !row ||
      row.index !== index ||
      row.requestIndex !== response ||
      !request ||
      !Number.isSafeInteger(row.sequence) ||
      row.sequence <= previousReplySequence ||
      row.sequence <= request.sequence ||
      requestSequences.has(row.sequence) ||
      row.sequence > trace.sequence
    )
      throw Error("Unmatched CPR observation");
    let outputCallbacks = 0;
    while (
      queryIndex < queryCallbacks.length &&
      queryCallbacks[queryIndex] < row.sequence
    ) {
      outputCallbacks++;
      queryIndex++;
    }
    const ordinaryWrites = index - previousReplyIndex - 1;
    if (
      row.sequence - previousReplySequence - 1 <
      ordinaryWrites + outputCallbacks
    )
      throw Error("CPR callback order mismatch");
    replies.set(index, { index, ...position, requestIndex: response });
    previousReplySequence = row.sequence;
    previousReplyIndex = index;
    response++;
  }
  if (response !== trace.replies.length)
    throw Error("CPR reply observation mismatch");
  const remainingWrites = trace.writeEnd - previousReplyIndex - 1;
  const remainingOutputCallbacks = queryCallbacks.length - queryIndex;
  if (
    trace.sequence - previousReplySequence <
    remainingWrites + remainingOutputCallbacks
  )
    throw Error("CPR callback order mismatch");
  return { writeEnd: trace.writeEnd, replies };
}

module.exports = { createWindowsCprTrace, parseCpr, validateWindowsCprTrace };
