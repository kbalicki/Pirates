/** Check if debug mode is enabled (stored in localStorage). */
export function isDebugMode(): boolean {
  try {
    return localStorage.getItem("pc_debug") === "1";
  } catch {
    return false;
  }
}

/** Set debug mode on/off. */
export function setDebugMode(on: boolean): void {
  try {
    localStorage.setItem("pc_debug", on ? "1" : "0");
  } catch {
    // localStorage unavailable
  }
}
