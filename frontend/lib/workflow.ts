import type { RecruitmentBrief } from "./recruitment";

export const searchPresets = [
  { id: "creative", name: "Create chances", description: "Find players who supply chances and assists.", metrics: ["key_passes_p90", "xa_p90", "xg_p90"] },
  { id: "scoring", name: "Carry a goal threat", description: "Focus on shots, expected goals and scoring.", metrics: ["xg_p90", "shots_p90", "goals_p90"] },
  { id: "link", name: "Connect the attack", description: "Look for involvement and buildup contributions.", metrics: ["xg_buildup_p90", "xg_chain_p90", "key_passes_p90"] },
] as const;

export function presetBrief(brief: RecruitmentBrief, presetId: string, features: string[]): RecruitmentBrief {
  const preset = searchPresets.find(p => p.id === presetId);
  if (!preset) return brief;
  const metrics = preset.metrics.filter(f => features.includes(f));
  if (!metrics.length) return brief;
  return { ...brief, name: `${preset.name} · ${brief.position.toLowerCase()}`, rules: metrics.map((feature, i) => ({ feature, minimum: i ? 60 : 75, unit: "percentile", required: i === 0, weight: i ? 30 : 40 })) };
}

export function requirementLabel(label: string, met: boolean, unknown: boolean) {
  return `${label}: ${unknown ? "Unknown" : met ? "Met" : "Missed"}`;
}
