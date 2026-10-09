import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoData } from "../../../lib/demo-data";
import { validateDataset } from "../../../lib/dataset-contract.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.SCOUTING_DATA_MODE ?? "demo";
  if (mode === "demo") return Response.json(demoData, { headers: { "Cache-Control": "no-store" } });
  if (mode !== "local") return Response.json({ error: "Unknown data mode. Use demo or local." }, { status: 500 });
  try {
    const text = await readFile(path.join(process.cwd(), ".local-data", "scouting-data.json"), "utf8");
    if (Buffer.byteLength(text) > 30 * 1024 * 1024) throw new Error("File too large");
    const payload = validateDataset(JSON.parse(text));
    return Response.json({ ...payload, metadata: { ...payload.metadata, data_mode: "local" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Local profiles are unavailable or fail validation. Run an import dry run to review the issues, or select demo mode. Existing files were not changed." }, { status: 503 });
  }
}
