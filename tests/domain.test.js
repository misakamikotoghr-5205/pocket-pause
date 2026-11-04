import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyJournal,
  append,
  replay,
  totals,
  parseMoney,
  parseBackup,
  remainingForWish,
  demoJournal,
} from "../domain.js";
import { createPersistence } from "../persistence.js";
const t = 1800000000000,
  H = 3600000;
const wish = {
  type: "wish",
  id: "w",
  at: t,
  title: "一盏灯",
  amount_fen: 1990,
  cooldown_hours: 1,
};
const resolve = {
  type: "resolve",
  id: "r",
  at: t + H,
  wish_id: "w",
  choice: "release",
  note: "明天再看",
};
const paid = {
  type: "deposit",
  id: "d",
  at: t + H + 1,
  wish_id: "w",
  amount_fen: 500,
  note: "手动日记",
};
const make = (...events) =>
  events.reduce((journal, event) => append(journal, event), emptyJournal());
test("money parsing is exact cents and rejects exponent, negative, boolean and excessive precision", () => {
  assert.equal(parseMoney("19.90"), 1990);
  assert.equal(parseMoney("0.01"), 1);
  for (const value of ["1e3", "1.001", "-2", "NaN", "0", "1000001", true])
    assert.throws(() => parseMoney(value));
});
test("release intent never increases the reported deposit ledger", () => {
  const state = replay(make(wish, resolve));
  const result = totals(state, t + H);
  assert.equal(result.avoided_fen, 1990);
  assert.equal(result.reported_fen, 0);
  assert.equal(result.progress, 0);
});
test("release becomes available at the exact deadline and cannot be backdated", () => {
  assert.throws(() => make(wish, { ...resolve, at: t + H - 1 }));
  assert.equal(replay(make(wish, resolve)).wishes[0].status, "release");
});
test("buying is respected without calling it a saving", () => {
  const state = replay(make(wish, { ...resolve, choice: "buy" }));
  const result = totals(state, t + H);
  assert.equal(result.bought, 1);
  assert.equal(result.avoided_fen, 0);
  assert.equal(result.reported_fen, 0);
});
test("partial deposits allocate only their own amount and cannot double-count the wish", () => {
  let journal = make(wish, resolve, paid);
  assert.equal(remainingForWish(replay(journal), "w"), 1490);
  assert.throws(() =>
    append(journal, { ...paid, id: "d2", at: t + H + 2, amount_fen: 1491 }),
  );
  journal = append(journal, {
    ...paid,
    id: "d3",
    at: t + H + 3,
    amount_fen: 1490,
  });
  assert.equal(remainingForWish(replay(journal), "w"), 0);
  assert.equal(totals(replay(journal), t + H).reported_fen, 1990);
});
test("unreviewed or purchased wishes cannot be linked to a deposit", () => {
  assert.throws(() => make(wish, { ...paid, at: t + 1 }));
  assert.throws(() => make(wish, { ...resolve, choice: "buy" }, paid));
});
test("a reversal preserves original record, releases allocation, and cannot be repeated", () => {
  let journal = make(wish, resolve, paid);
  journal = append(journal, {
    type: "reverse",
    id: "undo",
    at: t + H + 2,
    deposit_id: "d",
  });
  const state = replay(journal);
  assert.equal(state.deposits.length, 1);
  assert.equal(state.deposits[0].reversed, true);
  assert.equal(remainingForWish(state, "w"), 1990);
  assert.equal(totals(state, t + H).reported_fen, 0);
  assert.throws(() =>
    append(journal, {
      type: "reverse",
      id: "undo2",
      at: t + H + 3,
      deposit_id: "d",
    }),
  );
});
test("independent deposits are explicit manual journal entries", () => {
  const journal = make({ ...paid, wish_id: null, at: t });
  assert.equal(totals(replay(journal), t).reported_fen, 500);
  assert.equal(totals(replay(journal), t).avoided_fen, 0);
});
test("invalid, duplicate, unknown and out-of-order imported events are rejected", () => {
  for (const events of [
    [wish, wish],
    [wish, { ...resolve, at: t - 1 }],
    [{ ...wish, amount_fen: Infinity }],
    [{ ...wish, bank_transfer: true }],
    [{ type: "autopay", id: "p", at: t }],
    [null],
  ])
    assert.throws(() => replay({ schema: 1, events }));
  assert.throws(() => parseBackup("{broken"));
  assert.throws(() => parseBackup("x".repeat(1000001)));
});
test("too many events and incompatible backup schemas fail without partial state", () => {
  assert.throws(() => replay({ schema: 2, events: [] }));
  assert.throws(() => replay({ schema: 1, events: Array(1001).fill(wish) }));
});
test("append is immutable and export/import reproduces totals", () => {
  const original = make(wish);
  const frozen = JSON.stringify(original);
  const next = append(original, resolve);
  assert.equal(JSON.stringify(original), frozen);
  assert.deepEqual(replay(parseBackup(JSON.stringify(next))), replay(next));
});
test("demo includes a real ready state and keeps fictional deposit distinct from avoided amount", () => {
  const state = replay(demoJournal(t));
  const result = totals(state, t);
  assert.equal(result.waiting, 1);
  assert.equal(result.ready, 1);
  assert.equal(result.avoided_fen, 6900);
  assert.equal(result.reported_fen, 2000);
});
test("goal changes retain records and clamp progress instead of inventing excess savings", () => {
  const journal = make(
    { ...paid, wish_id: null, at: t },
    { type: "goal", id: "g", at: t + 1, name: "小旅行", target_fen: 100 },
  );
  assert.equal(totals(replay(journal), t + 1).progress, 1);
  assert.equal(totals(replay(journal), t + 1).reported_fen, 500);
});
function storage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
}
test("newer fallback copy wins over stale IndexedDB after an interrupted write", async () => {
  const old = { savedAt: t, journal: make(wish) },
    recent = { savedAt: t + 1, journal: make(wish, resolve) };
  const persistence = createPersistence({
    read: async () => old,
    write: async () => {},
    storage: storage(JSON.stringify(recent)),
  });
  assert.deepEqual((await persistence.load()).journal, recent.journal);
});
test("database failure falls back to local storage and survives a fresh instance", async () => {
  const local = storage();
  const persistence = createPersistence({
    read: async () => {
      throw Error("blocked");
    },
    write: async () => {
      throw Error("blocked");
    },
    storage: local,
    clock: () => t,
  });
  assert.equal(await persistence.save(make(wish)), "localstorage");
  const next = createPersistence({
    read: async () => undefined,
    write: async () => {},
    storage: local,
  });
  assert.deepEqual((await next.load()).journal, make(wish));
});
test("both blocked storage backends return memory mode while preserving caller state", async () => {
  const blocked = () => {
    throw Error("quota");
  };
  const persistence = createPersistence({
    read: blocked,
    write: blocked,
    storage: { getItem: blocked, setItem: blocked },
  });
  assert.equal((await persistence.load()).backend, "memory");
  assert.equal(await persistence.save(make(wish)), "memory");
});

test("a corrupt newer database copy cannot hide a valid local backup", async () => {
  const recent = { savedAt: t + 2, journal: { schema: 1, events: null } };
  const valid = { savedAt: t, journal: make(wish) };
  const persistence = createPersistence({
    read: async () => recent,
    write: async () => {},
    storage: storage(JSON.stringify(valid)),
  });
  assert.deepEqual((await persistence.load()).journal, valid.journal);
});
