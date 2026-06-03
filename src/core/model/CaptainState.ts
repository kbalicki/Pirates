export type SkillId = "fencing" | "gunnery" | "navigation" | "medicine" | "charm";
export type CaptainSkills = Record<SkillId, number>;

export type CaptainProfile = {
  nationality: string;   // faction key: "spain"|"england"|"france"|"netherlands"|"pirates"
  skills: CaptainSkills;
  startAge: number;      // default 20
  /**
   * Crew training level (0..1). Reflects the experience of the crew
   * under this captain's command. Grows daily at sea (+0.0005/day),
   * jumps on combat victories (+0.02/win), and is diluted when fresh
   * untrained recruits join (weighted average against value 0).
   * Affects cannon reload speed in combat.
   */
  training: number;
};

export const SKILL_IDS: SkillId[] = ["fencing", "gunnery", "navigation", "medicine", "charm"];
export const SKILL_DEFAULT = 5;
export const SKILL_MIN = 1;
export const SKILL_MAX = 10;
export const SKILL_BONUS_POINTS = 10;

export function createDefaultSkills(): CaptainSkills {
  return {
    fencing: SKILL_DEFAULT,
    gunnery: SKILL_DEFAULT,
    navigation: SKILL_DEFAULT,
    medicine: SKILL_DEFAULT,
    charm: SKILL_DEFAULT,
  };
}

export const TRAINING_DEFAULT = 0.3;
export const TRAINING_PER_DAY_AT_SEA = 0.0005;
export const TRAINING_PER_WIN = 0.02;

export function createDefaultCaptainProfile(): CaptainProfile {
  return {
    nationality: "england",
    skills: createDefaultSkills(),
    startAge: 20,
    training: TRAINING_DEFAULT,
  };
}

/**
 * Weighted-average dilution when fresh recruits join the crew.
 * Recruits start at training=0 (untrained); existing crew keeps its level.
 */
export function diluteTraining(currentTraining: number, currentCrew: number, recruits: number): number {
  if (recruits <= 0) return currentTraining;
  if (currentCrew + recruits <= 0) return 0;
  return (currentTraining * currentCrew) / (currentCrew + recruits);
}

export function calculateAge(gameDay: number, startAge: number): number {
  return startAge + Math.floor((gameDay - 1) / 365.25);
}
