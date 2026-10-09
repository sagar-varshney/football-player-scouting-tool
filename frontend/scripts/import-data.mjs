import { readFile, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareDatasets, inspectImport, validateDataset } from "../lib/dataset-contract.mjs";
export { validateDataset } from "../lib/dataset-contract.mjs";

async function atomicJson(destination, value) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 }); await rename(temporary, destination); }
  finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export async function importDataset(inputPath, { directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.local-data"), dryRun = false, reportPath } = {}) {
  const input = await readFile(path.resolve(inputPath), "utf8");
  if (Buffer.byteLength(input) > 30 * 1024 * 1024) throw new Error("Dataset exceeds 30 MB.");
  const parsed = JSON.parse(input), validation = inspectImport(parsed);
  const data = validateDataset(parsed);
  const destination = path.join(directory, "scouting-data.json");
  if (reportPath && [path.resolve(destination), path.resolve(inputPath)].includes(path.resolve(reportPath))) throw new Error("Report path cannot overwrite the input or active dataset.");
  let previous = null;
  try { previous = JSON.parse(await readFile(destination, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Existing dataset could not be read; it was left untouched. Resolve it before importing."); }
  const comparison = previous ? compareDatasets(previous, data) : null;
  const report = { schemaVersion: 1, validation, comparison, note: "Read-only assessment of the proposed import, not proof that an import was applied. Contains changed data values; retain/share only within source permissions. No prior dataset is archived automatically." };
  if (reportPath) await atomicJson(path.resolve(reportPath), report);
  if (!dryRun) { await mkdir(directory, { recursive: true }); await atomicJson(destination, data); }
  return { data, report, applied: !dryRun };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), inputPath = args.shift(); let dryRun = false, reportPath;
    if (!inputPath || inputPath.startsWith("--")) throw new Error("Usage: npm run import-data -- /path/data.json [--dry-run] [--report /path/report.json]");
    while (args.length) {
      const option = args.shift();
      if (option === "--dry-run" && !dryRun) dryRun = true;
      else if (option === "--report" && !reportPath && args[0] && !args[0].startsWith("--")) reportPath = args.shift();
      else throw new Error(`Unknown, repeated or incomplete option: ${option}`);
    }
    const result = await importDataset(inputPath, { dryRun, reportPath });
    console.log(JSON.stringify(result.report, null, 2));
    console.log(result.applied ? `Imported ${result.data.players.length} profiles atomically. Start with SCOUTING_DATA_MODE=local.` : "Dry run complete. Active dataset and source file unchanged.");
  } catch (error) { console.error(error.message); if (error.report) console.error(JSON.stringify(error.report, null, 2)); process.exitCode = 1; }
}
