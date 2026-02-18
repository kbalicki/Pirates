import type { SaveAdapter } from "./SaveAdapter.ts";
import type { SaveMeta, SavePayload } from "./SaveSchema.ts";
import type { SaveSlotId } from "../core/model/ids.ts";

const DB_VERSION = 1;
const STORE_NAME = "saves";

export class LocalSaveAdapter implements SaveAdapter {
  private readonly dbName: string;

  constructor(userId: string) {
    this.dbName = `pirates_chronicles_${userId}`;
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "meta.slotId" });
        }
      };
    });
  }

  async list(): Promise<SaveMeta[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const payloads = request.result as SavePayload[];
        resolve(payloads.map((p) => p.meta));
      };
    });
  }

  async save(payload: SavePayload): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(payload);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async load(slotId: SaveSlotId): Promise<SavePayload | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(slotId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async remove(slotId: SaveSlotId): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(slotId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
