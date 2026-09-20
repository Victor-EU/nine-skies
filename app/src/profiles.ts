/**
 * Where a profile is kept. (Build plan, workstream D: IndexedDB, versioned
 * schema, three local profiles.)
 *
 * IndexedDB rather than `localStorage` for one reason that matters now and
 * one that matters later: writes do not block the frame, and the journal that
 * arrives in phase 2 is the part of this that gets big. The shape it stores
 * is `Profile` exactly - no adapter, no columns - because a save is read by a
 * later version of this game than the one that wrote it, and every
 * transformation between the file and the type is somewhere a shape can
 * quietly half-survive (`readProfile` is the one gate).
 *
 * A browser that refuses storage - private windows do - gets an in-memory
 * store instead, so the game runs and the HUD says the profile is not being
 * kept. Failing loudly in the console and silently in the game is how a
 * player loses an evening of flying.
 */
import { readProfile, type Profile } from "../../engine/src/save/profile.js";

const DB_NAME = "nine-skies";
const DB_VERSION = 1;
const STORE = "profiles";

export interface ProfileStore {
  readonly kept: boolean;
  read(id: string): Promise<Profile | null>;
  write(profile: Profile): Promise<void>;
  list(): Promise<Profile[]>;
}

function memoryStore(): ProfileStore {
  const held = new Map<string, Profile>();
  return {
    kept: false,
    async read(id) {
      return held.get(id) ?? null;
    },
    async write(profile) {
      held.set(profile.id, profile);
    },
    async list() {
      return [...held.values()];
    },
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openProfiles(): Promise<ProfileStore> {
  if (typeof indexedDB === "undefined") return memoryStore();
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE))
          open.result.createObjectStore(STORE, { keyPath: "id" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error("blocked"));
    });
  } catch {
    return memoryStore();
  }

  return {
    kept: true,
    async read(id) {
      const tx = db.transaction(STORE, "readonly");
      return readProfile(await request(tx.objectStore(STORE).get(id)));
    },
    async write(profile) {
      const tx = db.transaction(STORE, "readwrite");
      await request(tx.objectStore(STORE).put(profile));
    },
    async list() {
      const tx = db.transaction(STORE, "readonly");
      const raw = await request(tx.objectStore(STORE).getAll());
      return raw
        .map((entry) => readProfile(entry))
        .filter((p): p is Profile => p !== null);
    },
  };
}
