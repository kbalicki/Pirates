import type { SaveMeta, SavePayload } from "./SaveSchema.ts";
import type { SaveSlotId } from "../core/model/ids.ts";
import type { SaveAdapter } from "./SaveAdapter.ts";
import { LocalSaveAdapter } from "./LocalSaveAdapter.ts";
import { getUserId } from "./UserIdentity.ts";

// ---- Legacy migration ----

const LEGACY_DB_NAME = "pirates_chronicles";
const LEGACY_STORE = "saves";
const MIGRATION_FLAG = "pc_legacy_saves_migrated";

/**
 * One-time migration: copy saves from the old unscoped DB
 * into the current user's per-user DB.
 */
async function migrateLegacySaves(adapter: SaveAdapter): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    const legacyPayloads = await readLegacyDB();
    for (const payload of legacyPayloads) {
      await adapter.save(payload);
    }
  } catch {
    // Old DB may not exist — that is fine
  }

  localStorage.setItem(MIGRATION_FLAG, "true");
}

function readLegacyDB(): Promise<SavePayload[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(LEGACY_STORE, "readonly");
      const store = tx.objectStore(LEGACY_STORE);
      const getAll = store.getAll();
      getAll.onerror = () => { db.close(); reject(getAll.error); };
      getAll.onsuccess = () => { db.close(); resolve(getAll.result as SavePayload[]); };
    };
    request.onupgradeneeded = () => {
      // DB doesn't exist yet — abort to avoid creating an empty store
      request.transaction?.abort();
    };
  });
}

// ---- Adapter singleton ----

let currentAdapter: SaveAdapter | null = null;
let migrationDone = false;

function getAdapter(): SaveAdapter {
  if (!currentAdapter) {
    const userId = getUserId();
    currentAdapter = new LocalSaveAdapter(userId);
  }
  return currentAdapter;
}

async function ensureMigrated(): Promise<void> {
  if (!migrationDone) {
    await migrateLegacySaves(getAdapter());
    migrationDone = true;
  }
}

/**
 * Replace the active save adapter (e.g. switch to RemoteSaveAdapter).
 */
export function setAdapter(adapter: SaveAdapter): void {
  currentAdapter = adapter;
  migrationDone = false;
}

// ---- Public API (unchanged signatures) ----

export async function listSaves(): Promise<SaveMeta[]> {
  await ensureMigrated();
  return getAdapter().list();
}

export async function saveGame(payload: SavePayload): Promise<void> {
  await ensureMigrated();
  return getAdapter().save(payload);
}

export async function loadGame(slotId: SaveSlotId): Promise<SavePayload | null> {
  await ensureMigrated();
  return getAdapter().load(slotId);
}

export async function removeSave(slotId: SaveSlotId): Promise<void> {
  await ensureMigrated();
  return getAdapter().remove(slotId);
}
