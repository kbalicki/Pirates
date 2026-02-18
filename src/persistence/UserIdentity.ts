const USER_ID_KEY = "pc_user_id";

/**
 * Get or create a persistent browser identity.
 *
 * On first visit a v4 UUID is generated and stored in localStorage.
 * All subsequent calls return the same value.
 */
export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}
