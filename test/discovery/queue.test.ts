/**
 * "Cards never stack; a queue holds them until the player is ready." (GDD.)
 *
 * Taken literally, which is the point: a card dropped for arriving second is
 * a discovery that silently did not happen, and that is the same defect the
 * segment test exists to prevent one layer down.
 */
import { describe, expect, it } from "vitest";
import { CardQueue, DEFAULT_CARD_QUEUE } from "../../engine/src/discovery/queue.js";

describe("the card queue", () => {
  it("shows one card and holds the rest", () => {
    const q = new CardQueue();
    q.offer(["a", "b", "c"]);
    const state = q.update(0);
    expect(state.showing).toBe("a");
    expect(state.waiting).toBe(2);
  });

  it("waits out the cooldown before the next one, however impatient the caller", () => {
    const q = new CardQueue({ holdS: 12, cooldownS: 2 });
    q.offer(["a", "b"]);
    q.update(0);
    q.dismiss();
    expect(q.update(0.5).showing).toBeNull();
    expect(q.update(1.9).showing).toBeNull();
    expect(q.update(2).showing).toBe("b");
  });

  it("puts an ignored card away on its own, and only then starts the cooldown", () => {
    const q = new CardQueue({ holdS: 12, cooldownS: 2 });
    q.offer(["a", "b"]);
    q.update(0);
    expect(q.update(11.9).showing).toBe("a");
    // Dismissed at 12, so the next is due at 14 rather than immediately.
    expect(q.update(12).showing).toBeNull();
    expect(q.update(13.9).showing).toBeNull();
    expect(q.update(14).showing).toBe("b");
  });

  it("keeps the order they were flown into", () => {
    const q = new CardQueue({ holdS: 1, cooldownS: 0 });
    q.offer(["first", "second", "third"]);
    const seen: string[] = [];
    for (let t = 0; t <= 4; t++) {
      const s = q.update(t);
      if (s.showing !== null && seen[seen.length - 1] !== s.showing) seen.push(s.showing);
      q.dismiss();
    }
    expect(seen).toEqual(["first", "second", "third"]);
  });

  it("never queues the same card twice, including the one on screen", () => {
    const q = new CardQueue();
    q.offer(["a"]);
    q.update(0);
    q.offer(["a", "b", "b"]);
    expect(q.update(0).waiting).toBe(1);
  });

  it("is idle when there is nothing to say", () => {
    const q = new CardQueue();
    expect(q.idle).toBe(true);
    q.offer(["a"]);
    expect(q.idle).toBe(false);
    q.update(0);
    q.dismiss();
    expect(q.idle).toBe(true);
  });

  it("holds a card about as long as its one-liner takes to read", () => {
    // The GDD caps a one-liner at 25 words; twelve seconds is about that at a
    // normal pace with room to look up. A default, not a finding.
    expect(DEFAULT_CARD_QUEUE.holdS).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_CARD_QUEUE.cooldownS).toBeGreaterThan(0);
  });
});
