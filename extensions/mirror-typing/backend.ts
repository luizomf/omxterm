// Core handles the declared capability for this actual view. The backend
// receives no keyboard payloads and keeps no setup or persistent state.
export function activate() {
  return {
    async invoke() {
      return { ok: false, error: "invalid-request" };
    },
  };
}
