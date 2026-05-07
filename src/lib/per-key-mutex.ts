// ─── Per-key serialization (SL-14) ───────────────────────────────────────────
// FIFO mutex keyed by arbitrary string. Only one caller at a time per key;
// new callers queue behind the previous one's promise. Used by the Telegram
// transport to serialize inbound messages per user — without this, two
// near-simultaneous webhook hits race on `getOrCreateJarvisConversation` and
// each create a fresh conversation, with the second's update to
// `telegramLinks.activeConversationId` orphaning the first's user turn.
//
// In-memory only. Single-container deploy → single-process → no cross-node
// coordination needed. If we ever scale out, this needs a Redis-backed
// equivalent.

const tails = new Map<string, Promise<unknown>>();

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  // Chain after previous regardless of success/failure so a thrown call
  // doesn't poison subsequent callers.
  const current = previous.catch(() => undefined).then(fn);
  tails.set(key, current);
  try {
    return await current;
  } finally {
    // Clean up if we're still the latest holder, so the Map doesn't grow
    // unbounded as users come and go.
    if (tails.get(key) === current) tails.delete(key);
  }
}
