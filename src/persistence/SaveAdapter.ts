import type { SaveMeta, SavePayload } from "./SaveSchema.ts";
import type { SaveSlotId } from "../core/model/ids.ts";

/**
 * Abstraction for save data storage.
 *
 * Implementations may use IndexedDB (local), a REST API (remote),
 * or any other persistence mechanism.
 */
export interface SaveAdapter {
  list(): Promise<SaveMeta[]>;
  save(payload: SavePayload): Promise<void>;
  load(slotId: SaveSlotId): Promise<SavePayload | null>;
  remove(slotId: SaveSlotId): Promise<void>;
}
