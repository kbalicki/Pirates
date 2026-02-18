import type { WorldState, GameEventEntry } from "../model/WorldState.ts";

const MAX_LOG_ENTRIES = 200;

export function addLogEntry(
  world: WorldState,
  key: string,
  vars?: Record<string, string | number>,
): WorldState {
  const entry: GameEventEntry = {
    day: world.time.day,
    hour: world.time.hour,
    minute: world.time.minute,
    key,
    vars,
  };

  const newLog = [...world.eventLog, entry];
  const trimmed =
    newLog.length > MAX_LOG_ENTRIES
      ? newLog.slice(newLog.length - MAX_LOG_ENTRIES)
      : newLog;

  return { ...world, eventLog: trimmed };
}

export function getRecentEvents(
  world: WorldState,
  count: number,
): GameEventEntry[] {
  return world.eventLog.slice(-count);
}

export function getEventsForDay(
  world: WorldState,
  day: number,
): GameEventEntry[] {
  return world.eventLog.filter((e) => e.day === day);
}
