export type SkillId = "fencing" | "gunnery" | "navigation" | "medicine" | "charm";
export type CaptainSkills = Record<SkillId, number>;

export type CaptainProfile = {
  nationality: string;   // faction key: "spain"|"england"|"france"|"netherlands"|"pirates"
  skills: CaptainSkills;
  startAge: number;      // default 20
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

export function createDefaultCaptainProfile(): CaptainProfile {
  return {
    nationality: "england",
    skills: createDefaultSkills(),
    startAge: 20,
  };
}

export function calculateAge(gameDay: number, startAge: number): number {
  return startAge + Math.floor((gameDay - 1) / 365.25);
}
