"use client";

import { useEffect, useMemo, useState } from "react";
import {
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

type Feature = string;

type Player = {
  player_id: number;
  provider_player_id?: number;
  player_name: string;
  position: string;
  age?: number;
  club: string;
  season?: string;
  minutes?: number;
  matches?: number;
  source_provider?: string;
  cluster: number;
  archetype: string;
  [key: string]: number | string | undefined;
};

type Payload = {
  metadata: {
    row_count: number;
    positions: string[];
    clubs: string[];
    seasons?: string[];
    features: Feature[];
    source_provider?: string;
    data_note: string;
  };
  players: Player[];
  cluster_profiles: Array<{ archetype: string } & Record<Feature, number>>;
};

type Match = Player & {
  similarity: number;
  similarityPct: number;
  overlap: number;
  sampleScore: number;
  sampleLabel: string;
  finishingScore: number;
  creationScore: number;
  involvementScore: number;
  sharedStrengthsLabel: string;
};

type PercentileLookup = Record<string, Record<Feature, number>>;

type Shot = {
  season: string;
  x: number;
  y: number;
  xg: number;
  result: string;
  minute: number;
  situation: string;
  shot_type: string;
};

type ShotPayload = {
  player_id: number;
  player_name: string;
  source: string;
  coordinate_note: string;
  shots: Shot[];
};

type EventLabPlayer = { player_id: number; player_name: string; teams: string[]; actions: number };
type EventLabManifest = {
  source: string;
  competition: string;
  season: string;
  matches: number;
  players: EventLabPlayer[];
  note: string;
};
type OpenAction = [x: number, y: number, type: string, matchId: number];
type EventLabPayload = EventLabPlayer & {
  competition: string;
  season: string;
  source: string;
  data_label: string;
  actions: OpenAction[];
};

const metricLabels: Record<Feature, string> = {
  goals_p90: "Goals",
  xg_p90: "Expected goals",
  assists_p90: "Assists",
  xa_p90: "Expected assists",
  shots_p90: "Shots",
  key_passes_p90: "Key passes",
  xg_chain_p90: "Move involvement",
  xg_buildup_p90: "Buildup play",
};

const compactLabels: Record<Feature, string> = {
  goals_p90: "Goals",
  xg_p90: "xG",
  assists_p90: "Assists",
  xa_p90: "xA",
  shots_p90: "Shots",
  key_passes_p90: "Key passes",
  xg_chain_p90: "Move inv.",
  xg_buildup_p90: "Buildup",
};

const radarMetrics: Feature[] = [
  "goals_p90",
  "xg_p90",
  "shots_p90",
  "assists_p90",
  "xa_p90",
  "key_passes_p90",
  "xg_chain_p90",
  "xg_buildup_p90",
];

const positionMetricWeights: Record<string, Record<Feature, number>> = {
  Forward: { goals_p90: 1.5, xg_p90: 1.4, shots_p90: 1.2, assists_p90: 0.7, xa_p90: 0.6, key_passes_p90: 0.5, xg_chain_p90: 0.8, xg_buildup_p90: 0.4 },
  Winger: { goals_p90: 1.0, xg_p90: 1.0, shots_p90: 1.1, assists_p90: 1.1, xa_p90: 1.3, key_passes_p90: 1.4, xg_chain_p90: 1.0, xg_buildup_p90: 0.7 },
  Midfielder: { goals_p90: 0.5, xg_p90: 0.6, shots_p90: 0.6, assists_p90: 0.9, xa_p90: 1.3, key_passes_p90: 1.5, xg_chain_p90: 1.3, xg_buildup_p90: 1.4 },
  Defender: { goals_p90: 0.3, xg_p90: 0.4, shots_p90: 0.3, assists_p90: 0.5, xa_p90: 0.8, key_passes_p90: 1.0, xg_chain_p90: 1.3, xg_buildup_p90: 1.6 },
};

const similarityCategories: Record<string, Feature[]> = {
  Finishing: ["goals_p90", "xg_p90", "shots_p90"],
  Creation: ["assists_p90", "xa_p90", "key_passes_p90"],
  Involvement: ["xg_chain_p90", "xg_buildup_p90"],
};

const clusterColors = ["#b8ff3d", "#27d8ff", "#ffcc3d", "#ff4f91", "#9b7bff", "#5ee6a8"];
const targetColor = "#ff2d8d";
const compareColor = "#83e63f";

function playerKey(player: Player) {
  return `${player.player_name}__${player.club}__${player.position}__${player.season ?? "single"}`;
}

function metricValue(player: Player | undefined, feature: Feature) {
  if (!player) return 0;
  const value = player[feature];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function buildCohortPercentiles(players: Player[], features: Feature[]): PercentileLookup {
  const lookup: PercentileLookup = {};
  players.forEach((player) => { lookup[playerKey(player)] = {}; });
  features.forEach((feature) => {
    const sorted = players.map((player) => metricValue(player, feature)).sort((a, b) => a - b);
    players.forEach((player) => {
      const value = metricValue(player, feature);
      const below = sorted.findIndex((item) => item >= value);
      const first = below === -1 ? sorted.length - 1 : below;
      let last = first;
      while (last + 1 < sorted.length && sorted[last + 1] === value) last += 1;
      lookup[playerKey(player)][feature] = sorted.length <= 1 ? 100 : ((first + last) / 2 / (sorted.length - 1)) * 100;
    });
  });
  return lookup;
}

function percentileValue(lookup: PercentileLookup, player: Player | undefined, feature: Feature) {
  if (!player) return 0;
  return lookup[playerKey(player)]?.[feature] ?? metricValue(player, `pct_${feature}`);
}

function featureWeight(position: string, feature: Feature) {
  return positionMetricWeights[position]?.[feature] ?? 1;
}

function metricOverlap(target: Player, candidate: Player, features: Feature[]) {
  const totalWeight = features.reduce((sum, feature) => sum + featureWeight(target.position, feature), 0) || 1;
  return features.reduce((sum, feature) => {
    const targetValue = metricValue(target, feature);
    const candidateValue = metricValue(candidate, feature);
    const denominator = Math.abs(targetValue) || 1;
    const gap = Math.min(Math.abs(candidateValue - targetValue) / denominator, 1);
    return sum + (1 - gap) * 100 * featureWeight(target.position, feature);
  }, 0) / totalWeight;
}

function findMatches(players: Player[], target: Player, topN: number, features: Feature[], percentiles: PercentileLookup) {
  const totalWeight = features.reduce((sum, feature) => sum + featureWeight(target.position, feature), 0) || 1;
  return players
    .filter((player) => playerKey(player) !== playerKey(target) && player.position === target.position)
    .map((player) => {
      const featureFits = features.map((feature) => ({
        feature,
        fit: 100 - Math.abs(percentileValue(percentiles, target, feature) - percentileValue(percentiles, player, feature)),
        weight: featureWeight(target.position, feature),
      }));
      const similarityPct = featureFits.reduce((sum, item) => sum + item.fit * item.weight, 0) / totalWeight;
      const categoryScores = Object.fromEntries(Object.entries(similarityCategories).map(([category, categoryFeatures]) => {
        const available = featureFits.filter((item) => categoryFeatures.includes(item.feature));
        const weight = available.reduce((sum, item) => sum + item.weight, 0) || 1;
        return [category, available.reduce((sum, item) => sum + item.fit * item.weight, 0) / weight];
      }));
      const sharedStrengthsLabel = featureFits.slice().sort((a, b) => (b.fit * b.weight) - (a.fit * a.weight)).slice(0, 2).map((item) => compactLabel(item.feature)).join(" + ");
      const sampleScore = Math.min(100, Math.max(25, (Math.min(Number(target.minutes ?? 0), Number(player.minutes ?? 0)) / 1800) * 100));
      const sampleLabel = sampleScore >= 80 ? "Robust sample" : sampleScore >= 55 ? "Established sample" : "Developing sample";
      return { ...player, similarity: similarityPct / 100, similarityPct, overlap: metricOverlap(target, player, features), sampleScore, sampleLabel, finishingScore: categoryScores.Finishing, creationScore: categoryScores.Creation, involvementScore: categoryScores.Involvement, sharedStrengthsLabel };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

function metricLabel(feature: Feature) {
  return metricLabels[feature] ?? feature.replaceAll("_", " ").replace(" p90", " /90");
}

function compactLabel(feature: Feature) {
  return compactLabels[feature] ?? metricLabel(feature);
}

function numberFormat(value: number | string | undefined, digits = 2) {
  return Number(value).toFixed(digits);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function heatColor(value: number) {
  if (value >= 90) return "#d7ff3f";
  if (value >= 75) return "#83e63f";
  if (value >= 60) return "#2ecf88";
  if (value >= 40) return "#36505a";
  if (value >= 25) return "#743967";
  return "#ca2d72";
}

function heatTextColor(value: number) {
  return value >= 60 ? "#07110b" : "#ffffff";
}

function loading(error?: string) {
  return <main className="loading-shell"><div className="loading-orbit" /><div className="loading-panel">{error || "Preparing your scouting dashboard…"}</div></main>;
}

export default function Page() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [position, setPosition] = useState("Winger");
  const [season, setSeason] = useState("Latest");
  const [targetKey, setTargetKey] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [topN, setTopN] = useState(5);
  const [compareKey, setCompareKey] = useState("");
  const [xMetric, setXMetric] = useState<Feature>("shots_p90");
  const [yMetric, setYMetric] = useState<Feature>("key_passes_p90");
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotStatus, setShotStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [eventManifest, setEventManifest] = useState<EventLabManifest | null>(null);
  const [eventPlayerId, setEventPlayerId] = useState(0);
  const [eventPlayer, setEventPlayer] = useState<EventLabPayload | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    fetch("/scouting-data.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Data request failed (${response.status})`);
        return response.json();
      })
      .then((data: Payload) => setPayload(data))
      .catch(() => setLoadError("We couldn’t load the player profiles. Please refresh and try again."));
  }, []);

  useEffect(() => {
    if (!payload || urlReady) return;
    const requestedKey = new URLSearchParams(window.location.search).get("player");
    const requestedPlayer = requestedKey ? payload.players.find((player) => playerKey(player) === requestedKey) : null;
    if (requestedPlayer) {
      setPosition(requestedPlayer.position);
      setSeason(requestedPlayer.season ?? "Latest");
      setTargetKey(playerKey(requestedPlayer));
    }
    setUrlReady(true);
  }, [payload, urlReady]);

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
      .filter((player) => player.position === position && (!selectedSeason || player.season === selectedSeason))
      .slice()
      .sort((a, b) => a.player_name.localeCompare(b.player_name));
  }, [payload, position, selectedSeason]);

  const visibleCandidatePlayers = useMemo(() => {
    const normalizedQuery = playerQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return candidatePlayers;
    return candidatePlayers.filter((player) => `${player.player_name} ${player.club}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [candidatePlayers, playerQuery]);

  const target = useMemo(() => {
    if (!payload) return null;
    return candidatePlayers.find((player) => playerKey(player) === targetKey) ||
      candidatePlayers.find((player) => player.player_name === "Bukayo Saka") || candidatePlayers[0] || null;
  }, [payload, candidatePlayers, targetKey]);

  useEffect(() => {
    if (target && playerKey(target) !== targetKey) setTargetKey(playerKey(target));
  }, [target, targetKey]);

  useEffect(() => {
    if (!target || !urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", playerKey(target));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setShareCopied(false);
  }, [target, urlReady]);

  useEffect(() => {
    const providerId = Number(target?.provider_player_id);
    const targetSeason = target?.season;
    if (!providerId || !targetSeason) {
      setShots([]);
      setShotStatus("missing");
      return;
    }
    const controller = new AbortController();
    setShots([]);
    setShotStatus("loading");
    fetch(`/shot-data/${providerId}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Shot data request failed (${response.status})`);
        return response.json();
      })
      .then((data: ShotPayload) => {
        setShots(data.shots.filter((shot) => shot.season === targetSeason));
        setShotStatus("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setShots([]);
          setShotStatus("missing");
        }
      });
    return () => controller.abort();
  }, [target?.provider_player_id, target?.season]);

  useEffect(() => {
    fetch("/event-lab/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Event Lab request failed (${response.status})`);
        return response.json();
      })
      .then((data: EventLabManifest) => {
        setEventManifest(data);
        setEventPlayerId(data.players[0]?.player_id ?? 0);
      })
      .catch(() => setEventManifest(null));
  }, []);

  useEffect(() => {
    if (!eventPlayerId) return;
    const controller = new AbortController();
    setEventPlayer(null);
    fetch(`/event-lab/${eventPlayerId}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Event player request failed (${response.status})`);
        return response.json();
      })
      .then((data: EventLabPayload) => setEventPlayer(data))
      .catch((error: Error) => { if (error.name !== "AbortError") setEventPlayer(null); });
    return () => controller.abort();
  }, [eventPlayerId]);

  useEffect(() => {
    if (!target || !payload) return;
    const hasFeature = (feature: Feature) => payload.metadata.features.includes(feature);
    if (target.position === "Forward" && hasFeature("goals_p90") && hasFeature("shots_p90")) {
      setXMetric("goals_p90"); setYMetric("shots_p90");
    } else if (hasFeature("shots_p90") && hasFeature("key_passes_p90")) {
      setXMetric("shots_p90"); setYMetric("key_passes_p90");
    } else {
      setXMetric(payload.metadata.features[0]); setYMetric(payload.metadata.features[1] ?? payload.metadata.features[0]);
    }
  }, [target?.player_id, payload]);

  const pool = useMemo(() => {
    if (!payload || !target) return [];
    return payload.players.filter((player) => player.position === target.position && (!selectedSeason || player.season === selectedSeason));
  }, [payload, target, selectedSeason]);

  const cohortPercentiles = useMemo(() => {
    if (!payload) return {};
    return buildCohortPercentiles(pool, payload.metadata.features);
  }, [payload, pool]);

  const matches = useMemo(() => {
    if (!payload || !target) return [];
    return findMatches(pool, target, topN, payload.metadata.features, cohortPercentiles);
  }, [payload, pool, target, topN, cohortPercentiles]);

  useEffect(() => {
    if (matches.length) setCompareKey(playerKey(matches[0]));
  }, [target?.player_id, topN, selectedSeason]);

  if (!payload || !target) return loading(loadError);

  const comparePlayer = matches.find((match) => playerKey(match) === compareKey) || matches[0];
  const comparedPlayers = [target, ...matches];
  const matchKeys = new Set(matches.map(playerKey));
  const clubs = new Set(payload.players.map((player) => player.club));
  const isShortlisted = shortlist.includes(playerKey(target));
  const visibleRadarMetrics = radarMetrics.filter((feature) => payload.metadata.features.includes(feature));
  const radarData = visibleRadarMetrics.map((feature) => ({
    metric: compactLabel(feature), target: percentileValue(cohortPercentiles, target, feature), compare: percentileValue(cohortPercentiles, comparePlayer, feature),
  }));
  const strongestSignals = payload.metadata.features
    .map((feature) => ({ feature, value: percentileValue(cohortPercentiles, target, feature) }))
    .sort((a, b) => b.value - a.value).slice(0, 4);
  const differenceData = payload.metadata.features.map((feature) => ({
    feature,
    target: percentileValue(cohortPercentiles, target, feature),
    compare: percentileValue(cohortPercentiles, comparePlayer, feature),
    gap: comparePlayer ? Math.abs(percentileValue(cohortPercentiles, target, feature) - percentileValue(cohortPercentiles, comparePlayer, feature)) : 0,
  })).sort((a, b) => b.gap - a.gap);
  const selectedMatch = comparePlayer ? matches.find((match) => playerKey(match) === playerKey(comparePlayer)) : undefined;
  const metricData = comparedPlayers.map((player) => ({
    ...player, key: playerKey(player), x: metricValue(player, xMetric), y: metricValue(player, yMetric),
    fill: playerKey(player) === playerKey(target) ? targetColor : clusterColors[player.cluster % clusterColors.length],
    size: playerKey(player) === playerKey(target) ? 240 : 140,
  }));

  function toggleShortlist(player: Player) {
    const key = playerKey(player);
    const next = shortlist.includes(key) ? shortlist.filter((item) => item !== key) : [key, ...shortlist].slice(0, 12);
    setShortlist(next);
    window.localStorage.setItem("player-scouting-shortlist", JSON.stringify(next));
  }

  async function shareProfile() {
    if (!target) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", playerKey(target));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
    } catch {
      window.prompt("Copy this player profile link", url.toString());
    }
  }

  const shortlistPlayers = shortlist.map((key) => payload.players.find((player) => playerKey(player) === key)).filter(Boolean) as Player[];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <a className="brand-lockup" href="#top" aria-label="Scouting intelligence home">
          <div className="brand-mark"><span>S</span></div>
          <div><strong>SCOUT//LAB</strong><span>Smarter player recruitment</span></div>
        </a>
        <nav className="nav-links" aria-label="Dashboard sections">
          <a href="#similarity">Similar players</a><a href="#heatmaps">Shot map</a><a href="#event-lab">Action map</a><a href="#profiles">Strengths</a><a href="#compare">Compare</a><a href="#shortlist">Shortlist <b>{shortlist.length}</b></a>
        </nav>
        <div className="dataset-status"><i /><span>Ready to scout</span><strong>{payload.metadata.row_count.toLocaleString()} player profiles</strong></div>
      </header>

      <main className="workspace" id="top">
        <section className="workflow-panel">
          <div className="workflow-heading">
            <span className="eyebrow">Discover talent</span>
            <h1>Find the next <em>difference maker.</em></h1>
            <p>Explore Premier League players by playing style, performance and role—then find the right fit for your team.</p>
          </div>
          <div className="workflow-controls">
            <label><span><b>01</b> Position</span><select value={position} onChange={(event) => setPosition(event.target.value)}>{positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span><b>02</b> Season</span><select value={season} onChange={(event) => setSeason(event.target.value)}><option value="Latest">Latest season</option>{seasons.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="player-select"><span><b>03</b> Player to scout</span><div className="player-picker-row"><input type="search" value={playerQuery} placeholder="Search…" aria-label="Search current players" onChange={(event) => setPlayerQuery(event.target.value)} /><select aria-label="Player to scout" value={playerKey(target)} onChange={(event) => { setTargetKey(event.target.value); setPlayerQuery(""); }}>{visibleCandidatePlayers.some((player) => playerKey(player) === playerKey(target)) ? null : <option value={playerKey(target)}>{target.player_name} · {target.club}</option>}{visibleCandidatePlayers.map((player) => <option key={playerKey(player)} value={playerKey(player)}>{player.player_name} · {player.club}</option>)}</select></div></label>
            <div className="control-group"><span><b>04</b> Matches shown</span><div className="segment-row">{[3, 5, 10].map((value) => <button type="button" key={value} className={topN === value ? "active" : ""} onClick={() => setTopN(value)}>{value}</button>)}</div></div>
          </div>
        </section>

        <section className="hero">
          <div className="hero-gridline" />
          <div className="player-orb" aria-hidden="true"><span>{initials(target.player_name)}</span><i>{Math.round(percentileValue(cohortPercentiles, target, "xg_chain_p90"))}</i></div>
          <div className="hero-content">
            <div className="hero-breadcrumb"><span>Scouting focus</span><i />{target.season}</div>
            <h2>{target.player_name}</h2>
            <p className="hero-meta">{target.club} <i /> {target.position} <i /> {target.minutes?.toLocaleString() ?? 0} minutes</p>
            <div className="role-lockup"><span>Playing style</span><strong>{target.archetype}</strong></div>
            <div className="hero-pills"><span><b>{matches[0]?.similarityPct.toFixed(1) ?? "0.0"}%</b> closest match</span><span><b>{pool.length}</b> comparable players</span><span><b>#{target.cluster + 1}</b> style group</span></div>
          </div>
          <div className="hero-actions">
            <button className={`shortlist-action ${isShortlisted ? "saved" : ""}`} onClick={() => toggleShortlist(target)}><span>{isShortlisted ? "✓" : "+"}</span>{isShortlisted ? "Shortlisted" : "Add to shortlist"}</button>
            <a href="#compare" className="compare-action">Compare players <span>↘</span></a>
            <button className="share-action" onClick={shareProfile}>{shareCopied ? "Link copied ✓" : "Share profile"}<span>↗</span></button>
          </div>
        </section>

        <section className="kpi-grid" aria-label="Key player metrics">
          <Kpi label="Goals /90" value={numberFormat(target.goals_p90)} percentile={percentileValue(cohortPercentiles, target, "goals_p90")} detail={`xG ${numberFormat(target.xg_p90)}`} />
          <Kpi label="Assists /90" value={numberFormat(target.assists_p90)} percentile={percentileValue(cohortPercentiles, target, "assists_p90")} detail={`xA ${numberFormat(target.xa_p90)}`} />
          <Kpi label="Key passes /90" value={numberFormat(target.key_passes_p90)} percentile={percentileValue(cohortPercentiles, target, "key_passes_p90")} detail="chances created" />
          <Kpi label="Move involvement" value={numberFormat(target.xg_chain_p90)} percentile={percentileValue(cohortPercentiles, target, "xg_chain_p90")} detail="involvement in scoring moves" />
          <Kpi label="Buildup play" value={numberFormat(target.xg_buildup_p90)} percentile={percentileValue(cohortPercentiles, target, "xg_buildup_p90")} detail="contribution before the final action" />
        </section>

        <section className="analysis-card">
          <div className="analysis-icon">✦</div>
          <div><span className="eyebrow">Scouting summary</span><h2>What makes this player stand out</h2><p>{target.player_name} plays as a <strong>{target.archetype}</strong>. Their strongest qualities are {strongestSignals.map((signal, index) => <span key={signal.feature}>{index ? ", " : ""}{metricLabel(signal.feature)} ({Math.round(signal.value)}th percentile)</span>)}. Every comparison is made against other {target.position.toLowerCase()}s from {selectedSeason} using per-90 performance.</p></div>
          <div className="data-caveat"><span>What’s included</span><p>This profile focuses on attacking and creative performance. Defensive work, pressures, carries and progressive passing will appear when reliable coverage is available.</p></div>
        </section>

        <section id="similarity" className="section-block">
          <SectionHeading eyebrow="Similar players" title="Players who match this profile" aside={`${matches.length} recommendations · same role and season`} />
          <div className="match-strip">
            {matches.slice(0, 5).map((match, index) => (
              <article key={playerKey(match)} className="match-card">
                <button className="match-main" onClick={() => setTargetKey(playerKey(match))} aria-label={`Scout ${match.player_name}`}>
                  <span className="match-rank">0{index + 1}</span><span className="match-avatar">{initials(match.player_name)}</span>
                  <span className="match-copy"><strong>{match.player_name}</strong><small>{match.club} · {match.season}</small></span>
                  <b className="match-score">{match.similarityPct.toFixed(1)}<i>%</i></b>
                </button>
                <MiniHeatStrip player={match} features={payload.metadata.features} percentiles={cohortPercentiles} />
                <div className="match-reasons"><span>{match.sampleLabel}</span><span>{match.sharedStrengthsLabel}</span></div>
                <div className="match-footer"><span>{match.archetype}</span><button onClick={() => { setCompareKey(playerKey(match)); document.getElementById("compare")?.scrollIntoView(); }}>Compare ↘</button></div>
              </article>
            ))}
          </div>
        </section>

        <section className="table-panel">
          <div className="table-titlebar"><div><span className="eyebrow">Full ranking</span><h2>How the matches compare</h2></div><span>Performance shown per 90 minutes</span></div>
          <div className="table-scroll"><table><thead><tr><th>Player</th><th>Playing style</th><th>Match</th><th>Metric fit</th>{payload.metadata.features.map((feature) => <th key={feature}>{compactLabel(feature)}</th>)}<th>Shortlist</th></tr></thead>
            <tbody>{matches.map((match) => <tr key={playerKey(match)}><td onClick={() => setTargetKey(playerKey(match))}><strong>{match.player_name}</strong><span>{match.club} · {match.season}</span></td><td><span className="role-chip">{match.archetype}</span></td><td><b className="score-pill">{match.similarityPct.toFixed(1)}%</b></td><td>{match.overlap.toFixed(1)}%</td>{payload.metadata.features.map((feature) => <td key={feature}>{numberFormat(metricValue(match, feature))}</td>)}<td><button className="mini-action" onClick={() => toggleShortlist(match)}>{shortlist.includes(playerKey(match)) ? "Shortlisted ✓" : "+ Shortlist"}</button></td></tr>)}</tbody>
          </table></div>
        </section>

        <section id="heatmaps" className="section-block">
          <SectionHeading eyebrow="Finishing profile" title="Where this player takes their chances" aside={`${target.player_name} · ${target.season} · every shot shown toward the same goal`} />
          <ShotHeatmap player={target} shots={shots} status={shotStatus} />
        </section>

        <section id="event-lab" className="section-block">
          <SectionHeading eyebrow="Historical action map" title="See where a player influences the game" aside={eventManifest ? `${eventManifest.competition} · ${eventManifest.season} · ${eventManifest.matches} matches` : "Loading player activity…"} />
          <EventLab manifest={eventManifest} player={eventPlayer} selectedId={eventPlayerId} onSelect={setEventPlayerId} />
        </section>

        <section id="profiles" className="section-block">
          <SectionHeading eyebrow="Performance profile" title="See every strength at a glance" aside={`Compare all ${payload.metadata.row_count.toLocaleString()} player-season profiles`} />
          <div className="heatmap-layout">
            <article className="profile-heatmap panel">
              <div className="panel-heading"><div><span className="eyebrow">Key strengths</span><h2>{target.player_name}</h2></div><span className="heatmap-season">{target.season}</span></div>
              <div className="profile-heat-list">{payload.metadata.features.map((feature) => { const percentile = percentileValue(cohortPercentiles, target, feature); return <div className="profile-heat-row" key={feature}><div><strong>{metricLabel(feature)}</strong><span>{numberFormat(metricValue(target, feature))} /90</span></div><div className="heat-track"><i style={{ width: `${percentile}%`, background: heatColor(percentile) }} /></div><b style={{ color: heatColor(percentile) }}>{Math.round(percentile)}</b></div>; })}</div>
              <div className="heat-legend"><span>Lower percentile</span><i /><i /><i /><i /><i /><span>Elite percentile</span></div>
            </article>
            <article className="matrix-heatmap panel">
              <div className="panel-heading"><div><span className="eyebrow">Performance comparison</span><h2>Selected player vs closest matches</h2></div><span className="matrix-note">Percentile among similar players</span></div>
              <div className="heatmap-scroll"><div className="heatmap-grid" style={{ gridTemplateColumns: `minmax(160px, 1.35fr) repeat(${payload.metadata.features.length}, minmax(62px, 1fr))` }}>
                <div className="heat-corner">Player</div>{payload.metadata.features.map((feature) => <div className="heat-column" key={feature}>{compactLabel(feature)}</div>)}
                {comparedPlayers.map((player, rowIndex) => <HeatmapRow key={playerKey(player)} player={player} features={payload.metadata.features} percentiles={cohortPercentiles} target={rowIndex === 0} onSelect={() => setTargetKey(playerKey(player))} />)}
              </div></div>
              <p className="heatmap-disclaimer">Higher scores show where each player ranks strongest against comparable players in the same season.</p>
            </article>
          </div>
        </section>

        <section id="compare" className="section-block">
          <SectionHeading eyebrow="Head-to-head" title="How their strengths compare" aside="Percentile score · 0–100" />
          <article className="radar-panel panel">
            <div className="comparison-picker"><span>Compare with</span><select value={comparePlayer ? playerKey(comparePlayer) : ""} onChange={(event) => setCompareKey(event.target.value)}>{matches.map((match) => <option key={playerKey(match)} value={playerKey(match)}>{match.player_name} · {match.similarityPct.toFixed(1)}% match</option>)}</select></div>
            {selectedMatch && <div className="match-explanation"><div><span>Position-aware match</span><strong>{selectedMatch.similarityPct.toFixed(1)}%</strong><small>Weighted for a {target.position.toLowerCase()} profile</small></div>{[["Finishing", selectedMatch.finishingScore], ["Creation", selectedMatch.creationScore], ["Involvement", selectedMatch.involvementScore]].map(([category, value]) => { const score = Number(value); return <div key={String(category)}><span>{category}</span><strong>{score.toFixed(0)}</strong><i><b style={{ width: `${score}%` }} /></i></div>; })}<div><span>Evidence strength</span><strong>{selectedMatch.sampleScore.toFixed(0)}</strong><small>{selectedMatch.sampleLabel} · {Math.min(Number(target.minutes ?? 0), Number(selectedMatch.minutes ?? 0)).toLocaleString()}+ shared-minute floor</small></div></div>}
            <div className="comparison-table">
              <div className="comparison-metrics-head"><span>Percentiles</span>{visibleRadarMetrics.map((feature) => <b key={feature}>{compactLabel(feature)}</b>)}</div>
              <ComparisonRow player={target} features={visibleRadarMetrics} percentiles={cohortPercentiles} color={targetColor} />
              {comparePlayer && <ComparisonRow player={comparePlayer} features={visibleRadarMetrics} percentiles={cohortPercentiles} color={compareColor} />}
            </div>
            <div className="radar-content">
              <div className="radar-chart-wrap">
                <ResponsiveContainer width="100%" height={570}><RadarChart data={radarData} outerRadius="71%" margin={{ top: 58, right: 88, bottom: 58, left: 88 }}>
                  <PolarGrid gridType="polygon" radialLines stroke="#30423f" strokeOpacity={0.8} polarAngles={[0, 45, 90, 135, 180, 225, 270, 315]} />
                  <PolarAngleAxis dataKey="metric" tick={<RadarTick />} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} tickCount={6} />
                  <Radar name={target.player_name} dataKey="target" stroke={targetColor} strokeWidth={4} fill={targetColor} fillOpacity={0.24} dot={{ r: 5, fill: targetColor, stroke: targetColor }} />
                  <Radar name={comparePlayer?.player_name} dataKey="compare" stroke={compareColor} strokeWidth={4} fill={compareColor} fillOpacity={0.15} dot={{ r: 5, fill: compareColor, stroke: compareColor }} />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart></ResponsiveContainer>
                <div className="radar-legend"><span><i style={{ background: targetColor }} />{target.player_name}</span>{comparePlayer && <span><i style={{ background: compareColor }} />{comparePlayer.player_name}</span>}</div>
              </div>
              <aside className="difference-panel"><span className="eyebrow">Key differences</span><h3>Where the profiles separate</h3><div className="difference-list">{differenceData.slice(0, 5).map((item) => <div key={item.feature} className="difference-row"><div><strong>{metricLabel(item.feature)}</strong><b>{Math.round(item.gap)} pts</b></div><div className="split-track"><i className="target-bar" style={{ width: `${item.target}%` }} /><i className="compare-bar" style={{ width: `${item.compare}%` }} /></div></div>)}</div><div className="comparison-callout"><span>Best overall match</span><strong>{matches[0]?.player_name}</strong><b>{matches[0]?.similarityPct.toFixed(1)}% match</b></div></aside>
            </div>
          </article>
        </section>

        <section className="section-block">
          <SectionHeading eyebrow="Performance map" title="See where each player stands" aside="Selected player and closest matches" />
          <article className="metric-panel panel">
            <div className="metric-controls"><label><span>Compare by</span><select value={xMetric} onChange={(event) => setXMetric(event.target.value as Feature)}>{payload.metadata.features.map((feature) => <option key={feature} value={feature}>{metricLabel(feature)}</option>)}</select></label><label><span>And compare by</span><select value={yMetric} onChange={(event) => setYMetric(event.target.value as Feature)}>{payload.metadata.features.map((feature) => <option key={feature} value={feature}>{metricLabel(feature)}</option>)}</select></label></div>
            <div className="chart-box"><ResponsiveContainer width="100%" height={440}><ScatterChart margin={{ top: 28, right: 32, bottom: 22, left: 12 }}><XAxis dataKey="x" name={metricLabel(xMetric)} tick={{ fill: "#82918e", fontSize: 11 }} axisLine={{ stroke: "#30423f" }} tickLine={false} /><YAxis dataKey="y" name={metricLabel(yMetric)} tick={{ fill: "#82918e", fontSize: 11 }} axisLine={{ stroke: "#30423f" }} tickLine={false} /><ZAxis dataKey="size" range={[90, 240]} /><Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#526763" }} content={<PlayerTooltip />} /><Scatter data={metricData} shape={<ClusterDot targetKey={playerKey(target)} matchKeys={matchKeys} />} /></ScatterChart></ResponsiveContainer></div>
          </article>
        </section>

        <section id="shortlist" className="shortlist-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">Your recruitment list</span><h2>Players to watch</h2></div>{shortlistPlayers.length > 0 && <button className="ghost-action" onClick={() => { setShortlist([]); window.localStorage.removeItem("player-scouting-shortlist"); }}>Clear shortlist</button>}</div>
          <div className="shortlist-grid">{shortlistPlayers.length ? shortlistPlayers.map((player, index) => <article key={playerKey(player)}><button onClick={() => setTargetKey(playerKey(player))}><span className="shortlist-number">0{index + 1}</span><span className="match-avatar">{initials(player.player_name)}</span><span><strong>{player.player_name}</strong><small>{player.club} · {player.position} · {player.season}</small><b>{player.archetype}</b></span></button><MiniHeatStrip player={player} features={payload.metadata.features} percentiles={cohortPercentiles} /></article>) : <div className="empty-shortlist"><span>＋</span><strong>No players shortlisted yet</strong><p>Save a promising match to start building your recruitment list.</p></div>}</div>
        </section>

        <details className="raw-panel panel"><summary>View full performance numbers <span>＋</span></summary><div className="raw-grid">{payload.metadata.features.map((feature) => <div key={feature}><span>{metricLabel(feature)}</span><strong>{numberFormat(target[feature])}</strong><small>per 90 minutes</small></div>)}</div></details>
        <footer className="data-note"><span>SCOUT//LAB · PLAYER INTELLIGENCE</span><p>Compare Premier League players using attacking and creative performance data, measured per 90 minutes for a fairer view.</p><div><b>{clubs.size}</b> clubs represented <i /> <b>{payload.metadata.features.length}</b> performance measures <i /> <b>450+</b> minutes to qualify</div></footer>
      </main>
    </div>
  );
}

function ShotHeatmap({ player, shots, status }: { player: Player; shots: Shot[]; status: "loading" | "ready" | "missing" }) {
  const [mode, setMode] = useState<"density" | "locations">("density");
  const pitch = { x: 25, y: 25, width: 1000, height: 630 };
  const goals = shots.filter((shot) => shot.result === "Goal").length;
  const totalXg = shots.reduce((sum, shot) => sum + shot.xg, 0);
  const boxShots = shots.filter((shot) => shot.x >= 0.83 && shot.y >= 0.21 && shot.y <= 0.79).length;
  const density = useMemo(() => {
    if (!shots.length) return [];
    const columns = 38;
    const rows = 24;
    const sigmaX = 0.07;
    const sigmaY = 0.085;
    const cells: Array<{ x: number; y: number; value: number }> = [];
    let maximum = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = (column + 0.5) / columns;
        const y = (row + 0.5) / rows;
        const value = shots.reduce((sum, shot) => {
          const dx = (x - shot.x) / sigmaX;
          const dy = (y - shot.y) / sigmaY;
          return sum + Math.exp(-0.5 * (dx * dx + dy * dy));
        }, 0);
        maximum = Math.max(maximum, value);
        cells.push({ x, y, value });
      }
    }
    return cells
      .map((cell) => ({ ...cell, value: maximum ? cell.value / maximum : 0 }))
      .filter((cell) => cell.value > 0.055);
  }, [shots]);
  const heatId = `shot-heat-${player.player_id}`;

  function densityColor(value: number) {
    if (value > 0.78) return "#ef233c";
    if (value > 0.54) return "#ff9500";
    if (value > 0.31) return "#ffd21c";
    if (value > 0.16) return "#00d084";
    return "#007f5f";
  }

  return (
    <article className="shotmap-panel panel">
      <div className="shotmap-topline">
        <div>
          <span className="eyebrow">Shot pattern</span>
          <h2>{player.player_name}</h2>
          <p>See the areas this player targets most often—and the quality of those chances.</p>
        </div>
        <div className="shotmap-mode" aria-label="Shot map display mode">
          <button type="button" className={mode === "density" ? "active" : ""} onClick={() => setMode("density")}>Shot map</button>
          <button type="button" className={mode === "locations" ? "active" : ""} onClick={() => setMode("locations")}>Shot locations</button>
        </div>
      </div>
      <div className="shotmap-body">
        <div className="pitch-wrap">
          <svg className="shot-pitch" viewBox="0 0 1050 680" role="img" aria-label={`${player.player_name} ${player.season} shot-location ${mode}`}>
            <defs>
              <clipPath id={`${heatId}-clip`}><rect x="25" y="25" width="1000" height="630" rx="27" /></clipPath>
              <filter id={`${heatId}-blur`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="18" /></filter>
              <filter id={`${heatId}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <linearGradient id={`${heatId}-grass`} x1="0" x2="1"><stop stopColor="#202724" /><stop offset="0.5" stopColor="#272d2a" /><stop offset="1" stopColor="#202724" /></linearGradient>
            </defs>
            <rect x="25" y="25" width="1000" height="630" rx="27" fill={`url(#${heatId}-grass)`} />
            <g className="pitch-lines" fill="none" stroke="#717775" strokeWidth="5">
              <rect x="25" y="25" width="1000" height="630" rx="27" />
              <path d="M525 25V655" />
              <circle cx="525" cy="340" r="82" />
              <circle cx="525" cy="340" r="4" fill="#717775" stroke="none" />
              <path d="M25 177H178V503H25M1025 177H872V503H1025" />
              <path d="M25 252H75V428H25M1025 252H975V428H1025" />
              <path d="M178 262A82 82 0 0 1 178 418M872 262A82 82 0 0 0 872 418" />
              <circle cx="127" cy="340" r="4" fill="#717775" stroke="none" />
              <circle cx="923" cy="340" r="4" fill="#717775" stroke="none" />
            </g>
            <g clipPath={`url(#${heatId}-clip)`}>
              {status === "ready" && mode === "density" && (
                <g filter={`url(#${heatId}-blur)`} style={{ mixBlendMode: "screen" }}>
                  {density.map((cell, index) => (
                    <rect
                      key={index}
                      x={pitch.x + cell.x * pitch.width - 20}
                      y={pitch.y + cell.y * pitch.height - 20}
                      width="40"
                      height="40"
                      rx="20"
                      fill={densityColor(cell.value)}
                      opacity={Math.min(0.98, 0.22 + cell.value * 0.76)}
                    />
                  ))}
                </g>
              )}
              {status === "ready" && mode === "locations" && shots.map((shot, index) => {
                const isGoal = shot.result === "Goal";
                const radius = 6 + Math.sqrt(Math.max(shot.xg, 0.01)) * 12;
                return <circle key={index} cx={pitch.x + shot.x * pitch.width} cy={pitch.y + shot.y * pitch.height} r={radius} fill={isGoal ? "#ef233c" : "#ffd21c"} fillOpacity={isGoal ? 0.94 : 0.62} stroke={isGoal ? "#ffffff" : "#1d2321"} strokeWidth={isGoal ? 3 : 1.5}><title>{`${shot.minute}' · ${shot.result} · ${shot.xg.toFixed(2)} xG · ${shot.situation}`}</title></circle>;
              })}
            </g>
            <g className="attack-arrow" transform="translate(493 4)"><path d="M0 0h24l17 21-17 21H0l17-21z" /><path d="M28 0h12l17 21-17 21H28l17-21z" /></g>
          </svg>
          {status === "loading" && <div className="pitch-state"><i />Loading this player’s shots…</div>}
          {status !== "loading" && shots.length === 0 && <div className="pitch-state"><strong>No shots to display</strong><span>No attempts were recorded for this player and season.</span></div>}
          {mode === "density" ? <div className="density-legend"><span>Fewer shots</span><i /><i /><i /><i /><i /><span>More shots</span></div> : <div className="shot-legend"><span><i />Attempt</span><span><i />Goal</span><b>Larger marker = higher xG</b></div>}
        </div>
        <aside className="shotmap-insights">
          <div className="shotmap-stat hero-stat"><span>Total shots</span><strong>{status === "loading" ? "—" : shots.length}</strong><small>all recorded attempts</small></div>
          <div className="shotmap-stat"><span>Goals</span><strong>{status === "loading" ? "—" : goals}</strong><small>{shots.length ? `${((goals / shots.length) * 100).toFixed(1)}% conversion` : "conversion"}</small></div>
          <div className="shotmap-stat"><span>Total xG</span><strong>{status === "loading" ? "—" : totalXg.toFixed(2)}</strong><small>{shots.length ? `${(totalXg / shots.length).toFixed(2)} per shot` : "quality per attempt"}</small></div>
          <div className="shotmap-stat"><span>Inside box</span><strong>{status === "loading" ? "—" : boxShots}</strong><small>{shots.length ? `${Math.round((boxShots / shots.length) * 100)}% of attempts` : "shot selection"}</small></div>
          <div className="shotmap-source"><span>About this view</span><p>This map shows <strong>shot locations</strong> rather than every touch, helping you assess chance location and shot selection with confidence.</p></div>
        </aside>
      </div>
    </article>
  );
}

function buildDensitySurface(points: Array<{ x: number; y: number }>, columns = 38, rows = 24) {
  if (!points.length) return [];
  const cells: Array<{ x: number; y: number; value: number }> = [];
  let maximum = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) / columns;
      const y = (row + 0.5) / rows;
      const value = points.reduce((sum, point) => {
        const dx = (x - point.x) / 0.068;
        const dy = (y - point.y) / 0.082;
        return sum + Math.exp(-0.5 * (dx * dx + dy * dy));
      }, 0);
      maximum = Math.max(maximum, value);
      cells.push({ x, y, value });
    }
  }
  return cells.map((cell) => ({ ...cell, value: maximum ? cell.value / maximum : 0 })).filter((cell) => cell.value > 0.05);
}

function surfaceColor(value: number) {
  if (value > 0.78) return "#ef233c";
  if (value > 0.54) return "#ff9500";
  if (value > 0.31) return "#ffd21c";
  if (value > 0.16) return "#00d084";
  return "#007f5f";
}

function EventLab({ manifest, player, selectedId, onSelect }: { manifest: EventLabManifest | null; player: EventLabPayload | null; selectedId: number; onSelect: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const actions = player?.actions ?? [];
  const density = useMemo(() => buildDensitySurface(actions.map((action) => ({ x: action[0], y: action[1] }))), [actions]);
  const matches = new Set(actions.map((action) => action[3])).size;
  const passes = actions.filter((action) => action[2] === "Pass").length;
  const carries = actions.filter((action) => action[2] === "Carry").length;
  const shots = actions.filter((action) => action[2] === "Shot").length;
  const heatId = `event-heat-${selectedId || "loading"}`;
  const filteredPlayers = useMemo(() => {
    const players = manifest?.players ?? [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return players;
    return players.filter((item) => `${item.player_name} ${item.teams.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [manifest, query]);
  useEffect(() => {
    if (query.trim() && filteredPlayers.length && !filteredPlayers.some((item) => item.player_id === selectedId)) {
      onSelect(filteredPlayers[0].player_id);
    }
  }, [filteredPlayers, onSelect, query, selectedId]);
  const selectedManifestPlayer = manifest?.players.find((item) => item.player_id === selectedId);
  const pickerPlayers = selectedManifestPlayer && !filteredPlayers.some((item) => item.player_id === selectedId)
    ? [selectedManifestPlayer, ...filteredPlayers]
    : filteredPlayers;

  return (
    <article className="event-lab-panel panel">
      <div className="event-lab-toolbar">
        <div><span className="eyebrow">Player activity</span><h2>{player?.player_name ?? "Loading player activity…"}</h2><p>{player ? `${player.teams.join(" / ")} · ${player.season}` : "Preparing the season view"}</p></div>
        <div className="event-player-picker"><label><span>Find a historical player</span><input className="event-search" type="search" value={query} placeholder="Search player or club…" onChange={(event) => setQuery(event.target.value)} /></label><label><span>{filteredPlayers.length.toLocaleString()} players found</span><select value={selectedId || ""} disabled={!manifest || !pickerPlayers.length} onChange={(event) => onSelect(Number(event.target.value))}>{pickerPlayers.map((item) => <option key={item.player_id} value={item.player_id}>{item.player_name} · {item.teams.join(" / ")} · {item.actions} actions</option>)}</select></label></div>
      </div>
      <div className="event-lab-body">
        <div className="event-pitch-wrap">
          <svg className="event-pitch" viewBox="0 0 1050 680" role="img" aria-label={`${player?.player_name ?? "Player"} recorded action heatmap`}>
            <defs>
              <clipPath id={`${heatId}-clip`}><rect x="25" y="25" width="1000" height="630" rx="27" /></clipPath>
              <filter id={`${heatId}-blur`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="18" /></filter>
              <linearGradient id={`${heatId}-grass`} x1="0" x2="1"><stop stopColor="#202724" /><stop offset="0.5" stopColor="#272d2a" /><stop offset="1" stopColor="#202724" /></linearGradient>
            </defs>
            <rect x="25" y="25" width="1000" height="630" rx="27" fill={`url(#${heatId}-grass)`} />
            <g className="pitch-lines" fill="none" stroke="#717775" strokeWidth="5">
              <rect x="25" y="25" width="1000" height="630" rx="27" /><path d="M525 25V655" /><circle cx="525" cy="340" r="82" /><circle cx="525" cy="340" r="4" fill="#717775" stroke="none" />
              <path d="M25 177H178V503H25M1025 177H872V503H1025" /><path d="M25 252H75V428H25M1025 252H975V428H1025" /><path d="M178 262A82 82 0 0 1 178 418M872 262A82 82 0 0 0 872 418" />
              <circle cx="127" cy="340" r="4" fill="#717775" stroke="none" /><circle cx="923" cy="340" r="4" fill="#717775" stroke="none" />
            </g>
            <g clipPath={`url(#${heatId}-clip)`} filter={`url(#${heatId}-blur)`} style={{ mixBlendMode: "screen" }}>
              {density.map((cell, index) => <rect key={index} x={25 + cell.x * 1000 - 20} y={25 + cell.y * 630 - 20} width="40" height="40" rx="20" fill={surfaceColor(cell.value)} opacity={Math.min(0.98, 0.22 + cell.value * 0.76)} />)}
            </g>
            <g className="attack-arrow" transform="translate(493 4)"><path d="M0 0h24l17 21-17 21H0l17-21z" /><path d="M28 0h12l17 21-17 21H28l17-21z" /></g>
          </svg>
          {!player && <div className="pitch-state"><i />Loading this player’s activity…</div>}
          <div className="density-legend"><span>Less activity</span><i /><i /><i /><i /><i /><span>More activity</span></div>
        </div>
        <aside className="event-insights">
          <div className="event-total"><span>On-ball actions</span><strong>{player ? actions.length.toLocaleString() : "—"}</strong><small>across {matches || "—"} matches</small></div>
          <div className="event-mix"><div><span>Passes</span><b>{passes}</b></div><div><span>Carries</span><b>{carries}</b></div><div><span>Shots</span><b>{shots}</b></div></div>
          <div className="coverage-card"><span>About this season</span><p>Detailed Premier League activity is available for <strong>2015/16</strong>, so this view stays separate from today’s player profiles for a fair comparison.</p></div>
          <div className="coverage-card source"><span>Data you can trust</span><p>Built from official <strong>StatsBomb Open Data</strong> and shown as recorded on-ball actions.</p></div>
        </aside>
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside: string }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><p>{aside}</p></div>;
}

function Kpi({ label, value, detail, percentile }: { label: string; value: string; detail: string; percentile: number }) {
  return <article className="kpi-card"><div><span>{label}</span><b>{Math.round(percentile)}th</b></div><strong>{value}</strong><small>{detail}</small><i><span style={{ width: `${percentile}%` }} /></i></article>;
}

function MiniHeatStrip({ player, features, percentiles }: { player: Player; features: Feature[]; percentiles: PercentileLookup }) {
  return <div className="mini-heat-strip" aria-label={`${player.player_name} metric percentiles`}>{features.map((feature) => { const value = percentileValue(percentiles, player, feature); return <i key={feature} title={`${metricLabel(feature)}: ${Math.round(value)}th percentile`} style={{ background: heatColor(value) }} />; })}</div>;
}

function HeatmapRow({ player, features, percentiles, target, onSelect }: { player: Player; features: Feature[]; percentiles: PercentileLookup; target: boolean; onSelect: () => void }) {
  return <><button className={`heat-player ${target ? "target" : ""}`} onClick={onSelect}><span>{initials(player.player_name)}</span><span><strong>{player.player_name}</strong><small>{target ? "Target" : player.club}</small></span></button>{features.map((feature) => { const value = percentileValue(percentiles, player, feature); return <div className="heat-cell" key={`${playerKey(player)}-${feature}`} title={`${metricLabel(feature)} · ${value.toFixed(1)}th percentile`} style={{ background: heatColor(value), color: heatTextColor(value) }}>{Math.round(value)}</div>; })}</>;
}

function ComparisonRow({ player, features, percentiles, color }: { player: Player; features: Feature[]; percentiles: PercentileLookup; color: string }) {
  return <div className="comparison-player-row" style={{ color }}><div><span className="comparison-avatar" style={{ borderColor: color }}>{initials(player.player_name)}</span><span><strong>{player.player_name}</strong><small>{player.club} · {player.season}</small></span></div>{features.map((feature) => <b key={feature}>{percentileValue(percentiles, player, feature).toFixed(1)}</b>)}</div>;
}

function RadarTick({ x, y, payload, textAnchor }: { x?: number; y?: number; payload?: { value: string }; textAnchor?: "start" | "middle" | "end" }) {
  if (x === undefined || y === undefined || !payload) return null;
  return <text x={x} y={y} dy={4} textAnchor={textAnchor} fill="#aab6b3" fontSize={14} fontWeight={700}>{payload.value}</text>;
}

function RadarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="tooltip-card"><strong>{label}</strong>{payload.map((item) => <span key={item.name} style={{ color: item.color }}>{item.name}: {item.value.toFixed(1)}th</span>)}</div>;
}

function PlayerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Player }> }) {
  if (!active || !payload?.length) return null;
  const player = payload[0].payload;
  return <div className="tooltip-card"><strong>{player.player_name}</strong><span>{player.club} · {player.position} · {player.season}</span><span>{player.archetype}</span></div>;
}

function ClusterDot(props: { cx?: number; cy?: number; payload?: Player & { fill: string }; targetKey: string; matchKeys: Set<string> }) {
  const { cx, cy, payload, targetKey, matchKeys } = props;
  if (typeof cx !== "number" || typeof cy !== "number" || !payload) return null;
  const key = playerKey(payload); const isTarget = key === targetKey; const isMatch = matchKeys.has(key);
  return <circle cx={cx} cy={cy} r={isTarget ? 11 : 7} fill={payload.fill} stroke={isTarget ? "#ffffff" : isMatch ? "#0c1514" : "none"} strokeWidth={isTarget || isMatch ? 3 : 0} opacity={isTarget || isMatch ? 1 : 0.8} />;
}
