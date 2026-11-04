import { createStore, get, set } from "./vendor/idb-keyval.js";
import { replay } from "./domain.js";
const KEY = "pocket-pause:v1";
export function createPersistence({ read, write, storage, clock = Date.now }) {
  let backend = "memory";
  let lastSavedAt = 0;
  const valid = (value) => {
    if (!value || !Number.isSafeInteger(value.savedAt)) return false;
    try {
      replay(value.journal);
      return true;
    } catch {
      return false;
    }
  };
  return {
    async load() {
      let db = null,
        local = null;
      try {
        db = await read();
        if (db !== undefined) backend = "indexeddb";
      } catch {}
      try {
        const raw = storage?.getItem(KEY);
        local = raw ? JSON.parse(raw) : null;
        if (backend === "memory" && storage) backend = "localstorage";
      } catch {}
      const candidates = [db, local].filter(valid);
      for (const candidate of candidates) {
        lastSavedAt = Math.max(lastSavedAt, candidate.savedAt);
      }
      candidates.sort(
          (a, b) =>
            b.savedAt - a.savedAt ||
            b.journal.events.length - a.journal.events.length,
        );
      return { journal: candidates[0]?.journal || null, backend };
    },
    async save(journal) {
      // Keep the existing wrapper format, but use savedAt as a monotonic save
      // marker after load. Wall clocks can move backwards, and replacements
      // can have fewer events than the backup they supersede.
      const savedAt = Math.max(clock(), lastSavedAt + 1);
      if (!Number.isSafeInteger(savedAt))
        throw Error("保存标记无效，请先导出备份。");
      lastSavedAt = savedAt;
      const wrapper = { savedAt, journal };
      let saved = false;
      try {
        await write(wrapper);
        backend = "indexeddb";
        saved = true;
      } catch {}
      try {
        storage?.setItem(KEY, JSON.stringify(wrapper));
        if (!saved && storage) {
          backend = "localstorage";
          saved = true;
        }
      } catch {}
      if (!saved) backend = "memory";
      return backend;
    },
  };
}
const db = createStore("pocket-pause", "journal");
let local;
try {
  local = globalThis.localStorage;
} catch {}
const instance = createPersistence({
  read: () => get(KEY, db),
  write: (value) => set(KEY, value, db),
  storage: local,
});
export const load = () => instance.load();
export const save = (journal) => instance.save(journal);
