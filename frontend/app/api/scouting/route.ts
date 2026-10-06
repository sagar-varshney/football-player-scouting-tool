import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoData } from "../../../lib/demo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.SCOUTING_DATA_MODE ?? "demo";
  if (mode === "demo") return Response.json(demoData, { headers: { "Cache-Control": "no-store" } });
  if (mode !== "local") return Response.json({ error: "Unknown data mode. Use demo or local." }, { status: 500 });
  try {
    const payload = JSON.parse(await readFile(path.join(process.cwd(), ".local-data", "scouting-data.json"), "utf8"));
    return Response.json({ ...payload, metadata: { ...payload.metadata, data_mode: "local" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Local profiles are unavailable. Import a compatible dataset or select demo mode." }, { status: 503 });
  }
}
