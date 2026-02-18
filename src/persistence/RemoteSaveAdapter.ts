import type { SaveAdapter } from "./SaveAdapter.ts";
import type { SaveMeta, SavePayload } from "./SaveSchema.ts";
import type { SaveSlotId } from "../core/model/ids.ts";

/**
 * Save adapter that persists game data to a remote server via REST API.
 *
 * Expected API endpoints:
 *   GET    /api/saves             -> SaveMeta[]
 *   POST   /api/saves             -> void
 *   GET    /api/saves/:slotId     -> SavePayload
 *   DELETE /api/saves/:slotId     -> void
 *
 * The server identifies the user from the X-User-Id header.
 */
export class RemoteSaveAdapter implements SaveAdapter {
  private baseUrl: string;
  private userId: string;

  constructor(baseUrl: string, userId: string) {
    this.baseUrl = baseUrl;
    this.userId = userId;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-User-Id": this.userId,
    };
  }

  async list(): Promise<SaveMeta[]> {
    const res = await fetch(`${this.baseUrl}/api/saves`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Failed to list saves: ${res.status}`);
    return res.json() as Promise<SaveMeta[]>;
  }

  async save(payload: SavePayload): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/saves`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to save game: ${res.status}`);
  }

  async load(slotId: SaveSlotId): Promise<SavePayload | null> {
    const res = await fetch(
      `${this.baseUrl}/api/saves/${encodeURIComponent(slotId)}`,
      { method: "GET", headers: this.headers },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load save: ${res.status}`);
    return res.json() as Promise<SavePayload>;
  }

  async remove(slotId: SaveSlotId): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/saves/${encodeURIComponent(slotId)}`,
      { method: "DELETE", headers: this.headers },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete save: ${res.status}`);
    }
  }
}
