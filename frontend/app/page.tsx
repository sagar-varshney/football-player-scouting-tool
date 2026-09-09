"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

type Feature =
  | "goals_p90"
  | "xg_p90"
  | "assists_p90"
  | "xa_p90"
  | "shots_p90"
  | "key_passes_p90"
  | "pass_accuracy_pct"
  | "dribbles_p90"
  | "tackles_interceptions_p90"
  | "clearances_p90"
  | "progressive_passes_p90";

type Player = {
  player_id: number;
  player_name: string;
  position: string;
  age: number;
  club: string;
  season?: string;
  cluster: number;
  archetype: string;
} & Record<Feature, number> &
  Record<`scaled_${Feature}`, number> &
  Record<`pct_${Feature}`, number>;

type Payload = {
  metadata: {
    row_count: number;
    positions: string[];
    clubs: string[];
    seasons?: string[];
    features: Feature[];
    data_note: string;
  };
  players: Player[];
  cluster_profiles: Array<{ archetype: string } & Record<Feature, number>>;
};

type Match = Player & {
  similarity: number;
  similarityPct: number;
  overlap: number;
};

const metricLabels: Record<Feature, string> = {
  goals_p90: "Goals",
  xg_p90: "xG",
  assists_p90: "Assists",
  xa_p90: "xA",
  shots_p90: "Shots",
  key_passes_p90: "Key Passes",
  pass_accuracy_pct: "Pass Accuracy",
  dribbles_p90: "Dribbles",
  tackles_interceptions_p90: "Tkl + Int",
  clearances_p90: "Clearances",
  progressive_passes_p90: "Progressive Passes",
};

const compactLabels: Record<Feature, string> = {
  goals_p90: "Goals",
  xg_p90: "xG",
  assists_p90: "Ast",
  xa_p90: "xA",
  shots_p90: "Shots",
  key_passes_p90: "KeyP",
  pass_accuracy_pct: "Pass%",
  dribbles_p90: "Drib",
  tackles_interceptions_p90: "DefAct",
  clearances_p90: "Clr",
  progressive_passes_p90: "ProgP",
};

const radarMetrics: Feature[] = [
  "goals_p90",
  "xg_p90",
  "shots_p90",
  "assists_p90",
  "xa_p90",
  "key_passes_p90",
  "dribbles_p90",
  "progressive_passes_p90",
  "pass_accuracy_pct",
  "tackles_interceptions_p90",
  "clearances_p90",
];

const clusterColors = ["#42c95a", "#245a7b", "#c48a28", "#b64b3d", "#5e5aa7", "#607066"];

function playerKey(player: Player) {
  return `${player.player_name}__${player.club}__${player.position}__${player.season ?? "single"}`;
}

function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
  return dot / ((magA || 1) * (magB || 1));
}

function scaledVector(player: Player, features: Feature[]) {
  return features.map((feature) => player[`scaled_${feature}`]);
}

function metricOverlap(target: Player, candidate: Player, features: Feature[]) {
  return (
    features.reduce((sum, feature) => {
      const denominator = Math.abs(target[feature]) || 1;
      const gap = Math.min(Math.abs(candidate[feature] - target[feature]) / denominator, 1);
      return sum + (1 - gap) * 100;
    }, 0) / features.length
  );
}

function findMatches(players: Player[], target: Player, topN: number, features: Feature[]) {
  const targetVector = scaledVector(target, features);
  return players
    .filter((player) => playerKey(player) !== playerKey(target))
    .filter((player) => player.position === target.position)
    .map((player) => {
      const similarity = cosineSimilarity(targetVector, scaledVector(player, features));
      return {
        ...player,
        similarity,
        similarityPct: similarity * 100,
        overlap: metricOverlap(target, player, features),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

function numberFormat(value: number, digits = 2) {
  return Number(value).toFixed(digits);
}

function loading() {
  return (
    <main className="loading-shell">
      <div className="loading-panel">Loading scouting model...</div>
    </main>
  );
}

export default function Page() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [position, setPosition] = useState("Winger");
  const [season, setSeason] = useState("Latest");
  const [targetKey, setTargetKey] = useState("");
  const [topN, setTopN] = useState(5);
  const [compareKey, setCompareKey] = useState("");
  const [xMetric, setXMetric] = useState<Feature>("dribbles_p90");
  const [yMetric, setYMetric] = useState<Feature>("key_passes_p90");
  const [shortlist, setShortlist] = useState<string[]>([]);

  useEffect(() => {
    fetch("/scouting-data.json")
      .then((response) => response.json())
      .then((data: Payload) => setPayload(data));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("player-scouting-shortlist");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) setShortlist(parsed.filter((item) => typeof item === "string"));
    } catch {
      window.localStorage.removeItem("player-scouting-shortlist");
    }
  }, []);

  const seasons = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.players.map((player) => player.season).filter(Boolean) as string[])).sort();
  }, [payload]);

  const selectedSeason = season === "Latest" ? seasons.at(-1) : season;
  const positions = payload ? payload.metadata.positions : [];

  const candidatePlayers = useMemo(() => {
    if (!payload) return [];
    return payload.players
      .filter((player) => player.position === position)
      .filter((player) => !selectedSeason || player.season === selectedSeason)
      .slice()
      .sort((a, b) => a.player_name.localeCompare(b.player_name));
  }, [payload, position, selectedSeason]);

  const target = useMemo(() => {
    if (!payload) return null;
    return (
      candidatePlayers.find((player) => playerKey(player) === targetKey) ||
      candidatePlayers.find((player) => player.player_name === "Bukayo Saka") ||
      candidatePlayers[0] ||
      null
    );
  }, [payload, candidatePlayers, targetKey]);

  useEffect(() => {
    if (target && playerKey(target) !== targetKey) setTargetKey(playerKey(target));
  }, [target, targetKey]);

  useEffect(() => {
    if (!target) return;
    if (target.position === "Defender") {
      setXMetric("tackles_interceptions_p90");
      setYMetric("clearances_p90");
    } else if (target.position === "Winger") {
      setXMetric("dribbles_p90");
      setYMetric("key_passes_p90");
    } else if (target.position === "Midfielder") {
      setXMetric("progressive_passes_p90");
      setYMetric("key_passes_p90");
    } else {
      setXMetric("goals_p90");
      setYMetric("shots_p90");
    }
  }, [target?.player_id]);

  const pool = useMemo(() => {
    if (!payload || !target) return [];
    return payload.players.filter((player) => player.position === target.position && (!selectedSeason || player.season === selectedSeason));
  }, [payload, target, selectedSeason]);

  const matches = useMemo(() => {
    if (!payload || !target) return [];
    return findMatches(pool, target, topN, payload.metadata.features);
  }, [payload, pool, target, topN]);

  useEffect(() => {
    if (matches.length) setCompareKey(playerKey(matches[0]));
  }, [target?.player_id, topN, selectedSeason]);

  if (!payload || !target) return loading();

  const comparePlayer = matches.find((match) => playerKey(match) === compareKey) || matches[0];
  const comparedPlayers = [target, ...matches];
  const matchKeys = new Set(matches.map(playerKey));
  const clubs = new Set(payload.players.map((player) => player.club));
  const isShortlisted = shortlist.includes(playerKey(target));

  const radarData = radarMetrics.map((feature) => ({
    metric: compactLabels[feature],
    target: target[`pct_${feature}`],
    compare: comparePlayer?.[`pct_${feature}`] ?? 0,
  }));

  const strongestSignals = payload.metadata.features
    .map((feature) => ({ feature, value: target[`pct_${feature}`] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  const metricData = comparedPlayers.map((player) => ({
    ...player,
    key: playerKey(player),
    x: player[xMetric],
    y: player[yMetric],
    fill: playerKey(player) === playerKey(target) ? "#101914" : clusterColors[player.cluster % clusterColors.length],
    size: playerKey(player) === playerKey(target) ? 210 : 130,
  }));

  const differenceData = payload.metadata.features.map((feature) => ({
    metric: compactLabels[feature],
    gap: comparePlayer ? Math.abs(target[`pct_${feature}`] - comparePlayer[`pct_${feature}`]) : 0,
  }));

  function toggleShortlist(player: Player) {
    const key = playerKey(player);
    const next = shortlist.includes(key) ? shortlist.filter((item) => item !== key) : [key, ...shortlist].slice(0, 12);
    setShortlist(next);
    window.localStorage.setItem("player-scouting-shortlist", JSON.stringify(next));
  }

  const shortlistPlayers = shortlist
    .map((key) => payload.players.find((player) => playerKey(player) === key))
    .filter(Boolean) as Player[];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand-lockup">
          <div className="brand-mark">ST</div>
          <div>
            <strong>Scouting Tool</strong>
            <span>Premier League similarity lab</span>
          </div>
        </div>
        <div className="dataset-strip">
          <span>{payload.metadata.row_count} season rows</span>
          <span>{clubs.size} clubs</span>
          <span>{payload.metadata.features.length} metrics</span>
        </div>
      </header>

      <main className="workspace">
        <section className="workflow-panel">
          <div className="workflow-heading">
            <span className="section-label">Scouting Workflow</span>
            <h1>Search, explain, compare, shortlist.</h1>
          </div>
          <div className="workflow-controls">
            <label>
              <span>1. Search position</span>
              <select value={position} onChange={(event) => setPosition(event.target.value)}>
                {positions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>2. Select season</span>
              <select value={season} onChange={(event) => setSeason(event.target.value)}>
                <option value="Latest">Latest season</option>
                {seasons.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>3. Search player</span>
              <select value={playerKey(target)} onChange={(event) => setTargetKey(event.target.value)}>
                {candidatePlayers.map((player) => (
                  <option key={playerKey(player)} value={playerKey(player)}>
                    {player.player_name} · {player.club}
                  </option>
                ))}
              </select>
            </label>
            <div className="control-group">
              <span>4. Find similar players</span>
              <div className="segment-row">
                {[3, 5, 10].map((value) => (
                  <button key={value} className={topN === value ? "active" : ""} onClick={() => setTopN(value)}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="hero">
          <div className="hero-content">
            <span className="kicker">Premier League Recruitment Intelligence</span>
            <h2>{target.player_name}</h2>
            <p>
              {target.club} · {target.position} · {target.season ?? "current sample"} · age {target.age}. The workspace
              now focuses on scout decisions: explain the match, compare the profile, then shortlist the player.
            </p>
            <div className="hero-pills">
              <span>{target.archetype}</span>
              <span>Cluster {target.cluster}</span>
              <span>{matches[0]?.player_name ?? "No match"} closest</span>
              <span>{matches[0]?.similarityPct.toFixed(1) ?? "0.0"}% top similarity</span>
            </div>
          </div>
          <button className="shortlist-action" onClick={() => toggleShortlist(target)}>
            {isShortlisted ? "Remove from Shortlist" : "Shortlist Player"}
          </button>
        </section>

        <section className="kpi-grid">
          <Kpi label="Goals /90" value={numberFormat(target.goals_p90)} detail={`xG ${numberFormat(target.xg_p90)}`} />
          <Kpi label="Assists /90" value={numberFormat(target.assists_p90)} detail={`xA ${numberFormat(target.xa_p90)}`} />
          <Kpi label="Creation" value={numberFormat(target.key_passes_p90)} detail="key passes /90" />
          <Kpi label="Ball Carrying" value={numberFormat(target.dribbles_p90)} detail="dribbles /90" />
          <Kpi label="Defensive Work" value={numberFormat(target.tackles_interceptions_p90)} detail="tackles + interceptions" />
        </section>

        <section className="analysis-card">
          <span className="section-label">Explain Why</span>
          <h2>Why these players match</h2>
          <p>
            {target.player_name} profiles as a {target.archetype}. The strongest percentile signals are{" "}
            {strongestSignals.map((signal) => metricLabels[signal.feature]).join(", ")}. The model compares scaled
            per-90 profiles inside the {target.position.toLowerCase()} pool for {selectedSeason ?? "the selected season"}.
            The closest match is {matches[0]?.player_name} at {matches[0]?.similarityPct.toFixed(1)}% similarity.
          </p>
        </section>

        <section>
          <span className="section-label">Find Similar Players</span>
          <div className="match-strip">
            {matches.slice(0, 5).map((match) => (
              <article key={playerKey(match)} className="match-card" onClick={() => setTargetKey(playerKey(match))}>
                <strong>{match.player_name}</strong>
                <span>
                  {match.club} · {match.season}
                </span>
                <span>{match.archetype}</span>
                <b>{match.similarityPct.toFixed(1)}% match</b>
              </article>
            ))}
          </div>
        </section>

        <section className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Club</th>
                <th>Season</th>
                <th>Role</th>
                <th>Similarity</th>
                <th>Overlap</th>
                <th>Goals</th>
                <th>Ast</th>
                <th>KeyP</th>
                <th>Drib</th>
                <th>DefAct</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={playerKey(match)}>
                  <td onClick={() => setTargetKey(playerKey(match))}>
                    <strong>{match.player_name}</strong>
                    <span>{match.position}</span>
                  </td>
                  <td>{match.club}</td>
                  <td>{match.season}</td>
                  <td>{match.archetype}</td>
                  <td>
                    <b className="score-pill">{match.similarityPct.toFixed(1)}%</b>
                  </td>
                  <td>{match.overlap.toFixed(1)}%</td>
                  <td>{numberFormat(match.goals_p90)}</td>
                  <td>{numberFormat(match.assists_p90)}</td>
                  <td>{numberFormat(match.key_passes_p90)}</td>
                  <td>{numberFormat(match.dribbles_p90)}</td>
                  <td>{numberFormat(match.tackles_interceptions_p90)}</td>
                  <td>
                    <button className="mini-action" onClick={() => toggleShortlist(match)}>
                      {shortlist.includes(playerKey(match)) ? "Saved" : "Shortlist"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="compare-layout">
          <article className="viz-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Compare</span>
                <h2>Radar Profile</h2>
              </div>
              <select value={comparePlayer ? playerKey(comparePlayer) : ""} onChange={(event) => setCompareKey(event.target.value)}>
                {matches.map((match) => (
                  <option key={playerKey(match)} value={playerKey(match)}>
                    {match.player_name} ({match.similarityPct.toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={430}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#cfd8d3" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#526358", fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#7c8a81", fontSize: 10 }} />
                  <Radar name={target.player_name} dataKey="target" stroke="#42c95a" fill="#42c95a" fillOpacity={0.3} />
                  <Radar name={comparePlayer?.player_name} dataKey="compare" stroke="#245a7b" fill="#245a7b" fillOpacity={0.16} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="viz-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Explain Difference</span>
                <h2>Percentile Gap</h2>
              </div>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={430}>
                <BarChart data={differenceData} layout="vertical" margin={{ left: 28, right: 24, top: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8e0da" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#526358", fontSize: 11 }} />
                  <YAxis dataKey="metric" type="category" tick={{ fill: "#526358", fontSize: 11 }} width={72} />
                  <Tooltip />
                  <Bar dataKey="gap" fill="#42c95a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="visual-grid single">
          <article className="viz-panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Metric Map</span>
                <h2>Only Target + Compared Players</h2>
              </div>
            </div>
            <div className="metric-controls">
              <select value={xMetric} onChange={(event) => setXMetric(event.target.value as Feature)}>
                {payload.metadata.features.map((feature) => (
                  <option key={feature} value={feature}>
                    X · {metricLabels[feature]}
                  </option>
                ))}
              </select>
              <select value={yMetric} onChange={(event) => setYMetric(event.target.value as Feature)}>
                {payload.metadata.features.map((feature) => (
                  <option key={feature} value={feature}>
                    Y · {metricLabels[feature]}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={430}>
                <ScatterChart>
                  <XAxis dataKey="x" name={metricLabels[xMetric]} tick={{ fill: "#526358", fontSize: 11 }} />
                  <YAxis dataKey="y" name={metricLabels[yMetric]} tick={{ fill: "#526358", fontSize: 11 }} />
                  <ZAxis dataKey="size" range={[80, 210]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<PlayerTooltip />} />
                  <Scatter data={metricData} shape={<ClusterDot targetKey={playerKey(target)} matchKeys={matchKeys} />} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="shortlist-panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Shortlist</span>
              <h2>Saved targets</h2>
            </div>
            <button
              className="mini-action"
              onClick={() => {
                setShortlist([]);
                window.localStorage.removeItem("player-scouting-shortlist");
              }}
            >
              Clear
            </button>
          </div>
          <div className="shortlist-grid">
            {shortlistPlayers.length ? (
              shortlistPlayers.map((player) => (
                <article key={playerKey(player)} onClick={() => setTargetKey(playerKey(player))}>
                  <strong>{player.player_name}</strong>
                  <span>
                    {player.club} · {player.position} · {player.season}
                  </span>
                  <b>{player.archetype}</b>
                </article>
              ))
            ) : (
              <p>No players shortlisted yet.</p>
            )}
          </div>
        </section>

        <details className="raw-panel">
          <summary>Target player raw metrics</summary>
          <div className="raw-grid">
            {payload.metadata.features.map((feature) => (
              <div key={feature}>
                <span>{metricLabels[feature]}</span>
                <strong>{numberFormat(target[feature])}</strong>
              </div>
            ))}
          </div>
        </details>

        <p className="data-note">{payload.metadata.data_note}</p>
      </main>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PlayerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Player }> }) {
  if (!active || !payload?.length) return null;
  const player = payload[0].payload;
  return (
    <div className="tooltip-card">
      <strong>{player.player_name}</strong>
      <span>
        {player.club} · {player.position} · {player.season}
      </span>
      <span>{player.archetype}</span>
    </div>
  );
}

function ClusterDot(props: any) {
  const { cx, cy, payload, targetKey, matchKeys } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  const key = playerKey(payload);
  const isTarget = key === targetKey;
  const isMatch = matchKeys.has(key);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isTarget ? 10 : 7}
      fill={payload.fill}
      stroke={isTarget ? "#101914" : isMatch ? "#ffffff" : "none"}
      strokeWidth={isTarget || isMatch ? 3 : 0}
      opacity={isTarget || isMatch ? 1 : 0.78}
    />
  );
}
