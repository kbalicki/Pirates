/**
 * QuestRegistry — one place that knows what quests exist right now.
 *
 * `advanceQuests` needs a `QuestDef` for every entry in the log, and until
 * v0.14.0 the only caller built that map inline from the treasure maps it
 * happened to be holding (`MainMapScene.digForTreasure`). With a second source
 * of quests that stops working: a dig would be fed a registry with no family
 * quest in it, and a rescue would be fed one with no treasure hunts, so each
 * event could only ever move the quests its own caller knew about.
 *
 * Everything that is a quest instance rather than a hand-authored constant is
 * rebuilt here from what the log already stores:
 *
 *   treasure_*      from the `TreasureMap` in the entry's own data
 *   family_search   from the `FamilyChain` in the entry's own data
 *   defense_*       from the `DefenseContract` in the entry's own data
 *   cargo_*         from the `CargoContract` in the entry's own data
 *   raid_*          from the `RaidCommission` in the entry's own data
 *   relief_*        from the `ReliefCommission` in the entry's own data
 *   QUESTS          hand-authored definitions, if there ever are any
 */

import type { WorldState } from "../model/WorldState.ts";
import type { QuestRegistry } from "./QuestSystem.ts";
import { QUESTS } from "../data/quests.ts";
import { treasureQuest, type TreasureMap } from "./TreasureSystem.ts";
import { familyQuest, FAMILY_QUEST_ID, type FamilyChain } from "./FamilyQuestSystem.ts";
import { defenseQuest, DEFENSE_QUEST_PREFIX, type DefenseContract } from "./DefenseContractSystem.ts";
import { cargoQuest, CARGO_QUEST_PREFIX, type CargoContract } from "./CargoContractSystem.ts";
import {
  raidQuest,
  RAID_QUEST_PREFIX,
  reliefQuest,
  RELIEF_QUEST_PREFIX,
  type RaidCommission,
  type ReliefCommission,
} from "./InformantSystem.ts";

/**
 * Every definition the world can currently act on.
 *
 * Completed entries are included on purpose: `advanceQuests` skips them
 * itself, and leaving them in keeps the registry a faithful picture of the log
 * rather than a filtered view that a caller might mistake for one.
 */
export function buildQuestRegistry(world: WorldState): QuestRegistry {
  const registry: QuestRegistry = { ...QUESTS };

  for (const runtime of world.player.questLog) {
    const id = runtime.questId as string;

    if (id.startsWith("treasure_")) {
      const map = runtime.data.map as TreasureMap | undefined;
      if (map) registry[id] = treasureQuest(map);
      continue;
    }

    if (id.startsWith(CARGO_QUEST_PREFIX)) {
      const contract = runtime.data.contract as CargoContract | undefined;
      if (contract) registry[id] = cargoQuest(contract);
      continue;
    }

    if (id.startsWith(RAID_QUEST_PREFIX)) {
      const commission = runtime.data.commission as RaidCommission | undefined;
      if (commission) registry[id] = raidQuest(commission);
      continue;
    }

    if (id.startsWith(RELIEF_QUEST_PREFIX)) {
      const commission = runtime.data.commission as ReliefCommission | undefined;
      if (commission) registry[id] = reliefQuest(commission);
      continue;
    }

    if (id.startsWith(DEFENSE_QUEST_PREFIX)) {
      const contract = runtime.data.contract as DefenseContract | undefined;
      if (contract) registry[id] = defenseQuest(contract);
      continue;
    }

    if (id === FAMILY_QUEST_ID) {
      const chain = runtime.data.chain as FamilyChain | undefined;
      if (chain) registry[id] = familyQuest(chain, world.captain?.nationality ?? "england");
    }
  }

  return registry;
}
