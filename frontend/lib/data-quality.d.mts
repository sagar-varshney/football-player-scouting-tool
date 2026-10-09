export type QualityIssue = { severity: "error" | "warning"; code: string; message: string; rows: number[]; field?: string };
export function inspectDataset(players: Array<Record<string, unknown>>, features: string[]): { profiles: number; errors: number; warnings: number; issues: QualityIssue[]; truncated: boolean };
