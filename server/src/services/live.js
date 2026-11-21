import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

// The live feed: every solve, first blood, leaderboard move and freeze
// is recorded here in order, newest last, and broadcast to anyone
// listening — the scoreboard page polls this, and the socket layer pushes
// it out live. The log is capped so a long event never grows without
// bound. It also holds the freeze state: while the board is frozen the
// public standings stay at the snapshot taken when the freeze went on.
export const MAX_LIVE_EVENTS = 100;

export function createLiveFeed() {
  const emitter = new EventEmitter();
  const events = [];
  let frozen = false;
  let snapshot = null;
  let frozenAt = null;

  const feed = {
    record(event) {
      const entry = {
        id: randomUUID(),
        at: event.at || new Date(),
        ...event,
      };
      events.push(entry);
      if (events.length > MAX_LIVE_EVENTS) events.shift();
      emitter.emit("event", entry);
      emitter.emit(entry.type, entry);
      return entry;
    },
    recent(limit = 50) {
      return events.slice(-limit);
    },
    on(type, listener) {
      emitter.on(type, listener);
      return () => emitter.off(type, listener);
    },
    isFrozen() {
      return frozen;
    },
    getSnapshot() {
      return snapshot;
    },
    getFrozenAt() {
      return frozenAt;
    },
    freeze(board) {
      frozen = true;
      // A plain copy, so later solves can't move the frozen board.
      snapshot = JSON.parse(JSON.stringify(board));
      frozenAt = new Date();
      return feed.record({ type: "freeze", frozen: true, at: frozenAt });
    },
    unfreeze() {
      frozen = false;
      snapshot = null;
      frozenAt = null;
      return feed.record({ type: "freeze", frozen: false, at: new Date() });
    },
  };
  return feed;
}
