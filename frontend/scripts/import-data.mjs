import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateDataset(data) {
  const features = data?.metadata?.features;
  const allowed = ["goals_p90", "xg_p90", "assists_p90", "xa_p90", "shots_p90", "key_passes_p90", "xg_chain_p90", "xg_buildup_p90"];
  if (!Array.isArray(features) || !features.length || features.some(f => !allowed.includes(f)) || new Set(features).size !== features.length) throw new Error("Provide unique supported per-90 features.");
  if (!Array.isArray(data.players) || data.players.length < 2 || data.players.length > 50000) throw new Error("Provide between 2 and 50,000 profiles.");
  const seen = new Set();
  for (const player of data.players) {
    if (!Number.isSafeInteger(player.player_id) || !["Forward", "Winger", "Midfielder", "Defender"].includes(player.position)) throw new Error("Invalid player ID or position.");
    for (const field of ["player_name", "club", "season", "archetype"]) if (typeof player[field] !== "string" || !player[field].trim()) throw new Error(`Missing ${field}.`);
    if (!Number.isInteger(player.cluster) || player.cluster < 0 || player.cluster > 4 || !Number.isFinite(player.minutes) || player.minutes < 0) throw new Error("Invalid cluster or minutes.");
    for (const feature of features) if (typeof player[feature] !== "number" || !Number.isFinite(player[feature]) || player[feature] < 0) throw new Error(`Invalid ${feature}.`);
    const key = `${player.player_id}-${player.season}-${player.club}-${player.position}`;
    if (seen.has(key)) throw new Error("Duplicate profile identity.");
    seen.add(key);
  }
  if (!Array.isArray(data.cluster_profiles)) throw new Error("Missing cluster_profiles array.");
  return { ...data, metadata: { ...data.metadata, row_count: data.players.length, positions: [...new Set(data.players.map(p => p.position))], clubs: [...new Set(data.players.map(p => p.club))], seasons: [...new Set(data.players.map(p => p.season))], data_mode: "local" } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: npm run import-data -- /absolute/path/to/scouting-data.json");
    const input = await readFile(path.resolve(process.argv[2]), "utf8");
    if (Buffer.byteLength(input) > 30 * 1024 * 1024) throw new Error("Dataset exceeds 30 MB.");
    const data = validateDataset(JSON.parse(input));
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.local-data");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "scouting-data.json"), JSON.stringify(data));
    console.log(`Imported ${data.players.length} profiles into private local storage. Start with SCOUTING_DATA_MODE=local.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
