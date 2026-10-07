import type { ScoutPlayer } from "../lib/recruitment";

export function FictionalContext({ player }: { player: ScoutPlayer }) {
  if (player.source_provider !== "synthetic" || player.context_source !== "synthetic") return null;
  return <section className="fictional-context" aria-label="Simulated player context">
    <strong>Fictional player details · {player.season}</strong>
    <dl>
      <div><dt>Age</dt><dd>{player.age}</dd></div>
      <div><dt>Nationality</dt><dd>{player.nationality}</dd></div>
      <div><dt>Preferred foot</dt><dd>{player.preferred_foot}</dd></div>
      <div><dt>Shirt number</dt><dd>{player.shirt_number}</dd></div>
      <div><dt>Positions</dt><dd>{player.primary_position} / {player.secondary_position}</dd></div>
      <div><dt>Example availability</dt><dd>{player.current_status}</dd></div>
    </dl>
    <small>All details are simulated, including availability—not verified squad or medical information. These fields do not affect statistical scores.</small>
  </section>;
}
