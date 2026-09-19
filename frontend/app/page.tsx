"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
    dataset_version?: string;
    model_version?: string;
    generated_at?: string;
    minimum_minutes?: number;
    reliability_prior_minutes?: number;
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

type SimilarityPriorities = Record<"Finishing" | "Creation" | "Involvement", number>;

type ShortlistDetail = {
  status: "Watching" | "Review" | "Priority";
  note: string;
};

type SavedFinderSearch = {
  id: string;
  label: string;
  position: string;
  season: string;
  query: string;
  club: string;
  archetype: string;
  feature: Feature;
  minimumPercentile: number;
  minimumMinutes: number;
};

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

type PlayerImage = {
  player_name: string;
  path: string;
  creator: string;
  license: string;
  license_url: string;
  source_url: string;
  modifications: string;
};
type PlayerImageManifest = {
  source: string;
  policy: string;
  total_players: number;
  covered_players: number;
  players: Record<string, PlayerImage>;
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
const PRIOR_MINUTES = 900;
const defaultPriorities: SimilarityPriorities = { Finishing: 100, Creation: 100, Involvement: 100 };
const priorityPresets: Array<{ name: string; description: string; values: SimilarityPriorities }> = [
  { name: "Balanced role", description: "Keep the position-aware baseline", values: defaultPriorities },
  { name: "Goal threat", description: "Prioritise scoring and shot profile", values: { Finishing: 165, Creation: 65, Involvement: 80 } },
  { name: "Chance creator", description: "Prioritise assists and chance quality", values: { Finishing: 70, Creation: 165, Involvement: 95 } },
  { name: "Link player", description: "Prioritise involvement and buildup", values: { Finishing: 65, Creation: 100, Involvement: 170 } },
];

function playerKey(player: Player) {
  return `${player.player_name}__${player.club}__${player.position}__${player.season ?? "single"}`;
}

function playerImage(player: Player | undefined, images: Record<string, PlayerImage>) {
  const providerId = Number(player?.provider_player_id);
  return providerId ? images[String(providerId)] : undefined;
}

function metricValue(player: Player | undefined, feature: Feature) {
  if (!player) return 0;
  const value = player[feature];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function adjustedMetricValue(player: Player, feature: Feature, cohortMean: number) {
  const minutes = Math.max(0, Number(player.minutes ?? 0));
  return ((metricValue(player, feature) * minutes) + (cohortMean * PRIOR_MINUTES)) / (minutes + PRIOR_MINUTES || 1);
}

function buildCohortPercentiles(players: Player[], features: Feature[]): PercentileLookup {
  const lookup: PercentileLookup = {};
  players.forEach((player) => { lookup[playerKey(player)] = {}; });
  features.forEach((feature) => {
    const cohortMean = players.reduce((sum, player) => sum + metricValue(player, feature), 0) / (players.length || 1);
    const adjustedValues = new Map(players.map((player) => [playerKey(player), adjustedMetricValue(player, feature, cohortMean)]));
    const sorted = Array.from(adjustedValues.values()).sort((a, b) => a - b);
    players.forEach((player) => {
      const value = adjustedValues.get(playerKey(player)) ?? 0;
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

function featureCategory(feature: Feature) {
  return (Object.entries(similarityCategories).find(([, features]) => features.includes(feature))?.[0] ?? "Involvement") as keyof SimilarityPriorities;
}

function featureWeight(position: string, feature: Feature, priorities: SimilarityPriorities = defaultPriorities) {
  const intentWeight = priorities[featureCategory(feature)] / 100;
  return (positionMetricWeights[position]?.[feature] ?? 1) * intentWeight;
}

function metricOverlap(target: Player, candidate: Player, features: Feature[], priorities: SimilarityPriorities) {
  const totalWeight = features.reduce((sum, feature) => sum + featureWeight(target.position, feature, priorities), 0) || 1;
  return features.reduce((sum, feature) => {
    const targetValue = metricValue(target, feature);
    const candidateValue = metricValue(candidate, feature);
    const denominator = Math.abs(targetValue) || 1;
    const gap = Math.min(Math.abs(candidateValue - targetValue) / denominator, 1);
    return sum + (1 - gap) * 100 * featureWeight(target.position, feature, priorities);
  }, 0) / totalWeight;
}

function findMatches(players: Player[], target: Player, topN: number, features: Feature[], percentiles: PercentileLookup, priorities: SimilarityPriorities) {
  const totalWeight = features.reduce((sum, feature) => sum + featureWeight(target.position, feature, priorities), 0) || 1;
  return players
    .filter((player) => playerKey(player) !== playerKey(target) && player.position === target.position)
    .map((player) => {
      const featureFits = features.map((feature) => ({
        feature,
        fit: 100 - Math.abs(percentileValue(percentiles, target, feature) - percentileValue(percentiles, player, feature)),
        weight: featureWeight(target.position, feature, priorities),
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
      return { ...player, similarity: similarityPct / 100, similarityPct, overlap: metricOverlap(target, player, features, priorities), sampleScore, sampleLabel, finishingScore: categoryScores.Finishing, creationScore: categoryScores.Creation, involvementScore: categoryScores.Involvement, sharedStrengthsLabel };
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
  const [shortlistDetails, setShortlistDetails] = useState<Record<string, ShortlistDetail>>({});
  const [priorities, setPriorities] = useState<SimilarityPriorities>(defaultPriorities);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotStatus, setShotStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [eventManifest, setEventManifest] = useState<EventLabManifest | null>(null);
  const [eventPlayerId, setEventPlayerId] = useState(0);
  const [eventPlayer, setEventPlayer] = useState<EventLabPayload | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [imageManifest, setImageManifest] = useState<PlayerImageManifest | null>(null);

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
    fetch("/player-images/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Player image manifest failed (${response.status})`);
        return response.json();
      })
      .then((data: PlayerImageManifest) => setImageManifest(data))
      .catch(() => setImageManifest(null));
  }, []);

  useEffect(() => {
    if (!payload || urlReady) return;
    const params = new URLSearchParams(window.location.search);
    const requestedKey = params.get("player");
    const requestedPlayer = requestedKey ? payload.players.find((player) => playerKey(player) === requestedKey) : null;
    if (requestedPlayer) {
      setPosition(requestedPlayer.position);
      setSeason(requestedPlayer.season ?? "Latest");
      setTargetKey(playerKey(requestedPlayer));
    }
    const requestedWeights = params.get("weights")?.split(",").map(Number);
    if (requestedWeights?.length === 3 && requestedWeights.every((value) => Number.isFinite(value) && value >= 25 && value <= 200)) {
      setPriorities({ Finishing: requestedWeights[0], Creation: requestedWeights[1], Involvement: requestedWeights[2] });
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

  useEffect(() => {
    const saved = window.localStorage.getItem("player-scouting-shortlist-details");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setShortlistDetails(parsed);
    } catch {
      window.localStorage.removeItem("player-scouting-shortlist-details");
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
    url.searchParams.set("weights", `${priorities.Finishing},${priorities.Creation},${priorities.Involvement}`);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setShareCopied(false);
  }, [target, urlReady, priorities]);

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
    return findMatches(pool, target, topN, payload.metadata.features, cohortPercentiles, priorities);
  }, [payload, pool, target, topN, cohortPercentiles, priorities]);

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

  function updateShortlistDetail(key: string, detail: Partial<ShortlistDetail>) {
    const current = shortlistDetails[key] ?? { status: "Watching" as const, note: "" };
    const next = { ...shortlistDetails, [key]: { ...current, ...detail } };
    setShortlistDetails(next);
    window.localStorage.setItem("player-scouting-shortlist-details", JSON.stringify(next));
  }

  function exportShortlist() {
    if (!payload) return;
    const columns = ["Player", "Club", "Position", "Season", "Playing style", "Minutes", "Status", "Scout notes", ...payload.metadata.features.map((feature) => `${metricLabel(feature)} /90`)];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = shortlistPlayers.map((player) => {
      const detail = shortlistDetails[playerKey(player)] ?? { status: "Watching", note: "" };
      return [player.player_name, player.club, player.position, player.season, player.archetype, player.minutes, detail.status, detail.note, ...payload.metadata.features.map((feature) => numberFormat(player[feature]))];
    });
    const blob = new Blob([[columns, ...rows].map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `scoutlab-shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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

  function scoutPlayer(player: Player) {
    setPosition(player.position);
    setSeason(player.season ?? "Latest");
    setTargetKey(playerKey(player));
    setPlayerQuery("");
    window.setTimeout(() => document.getElementById("top")?.scrollIntoView(), 0);
  }

  const shortlistPlayers = shortlist.map((key) => payload.players.find((player) => playerKey(player) === key)).filter(Boolean) as Player[];
  const activePreset = priorityPresets.find((preset) => (Object.keys(defaultPriorities) as Array<keyof SimilarityPriorities>).every((category) => preset.values[category] === priorities[category]));
  const playerImages = imageManifest?.players ?? {};
  const targetImage = playerImage(target, playerImages);
  const imageCredits = imageManifest ? Object.entries(playerImages).sort(([, a], [, b]) => a.player_name.localeCompare(b.player_name)) : [];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <a className="brand-lockup" href="#top" aria-label="Scouting intelligence home">
          <div className="brand-mark"><span>S</span></div>
          <div><strong>SCOUT//LAB</strong><span>Smarter player recruitment</span></div>
        </a>
        <nav className="nav-links" aria-label="Dashboard sections">
          <a href="#finder">Finder</a><a href="#similarity">Similar players</a><a href="#heatmaps">Shot map</a><a href="#event-lab">Action map</a><a href="#trends">Trends</a><a href="#compare">Compare</a><a href="#shortlist">Shortlist <b>{shortlist.length}</b></a>
        </nav>
        <div className="dataset-status"><i /><span>Ready to scout</span><strong>{payload.metadata.row_count.toLocaleString()} profiles · {payload.metadata.model_version ?? "profile model"}</strong></div>
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
          <div className="player-portrait-wrap">
            <div className={`player-orb ${targetImage ? "with-photo" : ""}`}>{targetImage ? <img src={targetImage.path} alt={`${target.player_name} portrait`} /> : <span aria-hidden="true">{initials(target.player_name)}</span>}<i>{Math.round(percentileValue(cohortPercentiles, target, "xg_chain_p90"))}</i></div>
            {targetImage && <div className="hero-photo-credit">Photo: <a href={targetImage.source_url} target="_blank" rel="noreferrer">{targetImage.creator || "Wikimedia contributor"}</a> · <a href={targetImage.license_url} target="_blank" rel="noreferrer">{targetImage.license}</a></div>}
          </div>
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

        <section className="intent-panel panel" aria-label="Similarity priorities">
          <div className="intent-copy"><span className="eyebrow">Recruitment intent</span><h2>Tell the model what matters for this search</h2><p>The position-aware baseline still applies. These priorities change how strongly each part of the profile influences the ranking.</p></div>
          <div className="intent-presets">{priorityPresets.map((preset) => <button type="button" key={preset.name} className={activePreset?.name === preset.name ? "active" : ""} onClick={() => setPriorities(preset.values)}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}</div>
          <div className="intent-sliders">{(Object.keys(priorities) as Array<keyof SimilarityPriorities>).map((category) => <label key={category}><span><b>{category}</b><strong>{priorities[category]}%</strong></span><input type="range" min="25" max="200" step="5" value={priorities[category]} onChange={(event) => setPriorities({ ...priorities, [category]: Number(event.target.value) })} /></label>)}</div>
          <div className="intent-status"><span>{activePreset?.name ?? "Custom brief"}</span><p>Rankings and match explanations update instantly. Shared profile links preserve this brief.</p><button type="button" onClick={() => setPriorities(defaultPriorities)}>Reset priorities</button></div>
        </section>

        <section id="finder" className="section-block">
          <SectionHeading eyebrow="Recruitment finder" title="Build a data-led player search" aside={`${selectedSeason} · ${position}s`} />
          <PlayerFinder players={pool} features={payload.metadata.features} percentiles={cohortPercentiles} position={position} season={String(selectedSeason)} onLoadContext={(nextPosition, nextSeason) => { setPosition(nextPosition); setSeason(nextSeason); }} onScout={scoutPlayer} onShortlist={toggleShortlist} shortlisted={shortlist} images={playerImages} />
        </section>

        <section id="similarity" className="section-block">
          <SectionHeading eyebrow="Similar players" title="Players who match this profile" aside={`${matches.length} recommendations · ${activePreset?.name ?? "custom brief"}`} />
          <div className="match-strip">
            {matches.slice(0, 5).map((match, index) => (
              <article key={playerKey(match)} className="match-card">
                <button className="match-main" onClick={() => setTargetKey(playerKey(match))} aria-label={`Scout ${match.player_name}`}>
                  <span className="match-rank">0{index + 1}</span><PlayerAvatar player={match} images={playerImages} className="match-avatar" />
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
                {comparedPlayers.map((player, rowIndex) => <HeatmapRow key={playerKey(player)} player={player} features={payload.metadata.features} percentiles={cohortPercentiles} target={rowIndex === 0} onSelect={() => setTargetKey(playerKey(player))} images={playerImages} />)}
              </div></div>
              <p className="heatmap-disclaimer">Higher scores show where each player ranks strongest against comparable players in the same season.</p>
            </article>
          </div>
        </section>

        <section id="trends" className="section-block">
          <SectionHeading eyebrow="Development curve" title="Track performance across seasons" aside="Sample-adjusted percentile · recorded values remain visible" />
          <PlayerTrends payload={payload} player={target} />
        </section>

        <section id="compare" className="section-block">
          <SectionHeading eyebrow="Head-to-head" title="How their strengths compare" aside="Percentile score · 0–100" />
          <article className="radar-panel panel">
            <div className="comparison-picker"><span>Compare with</span><select value={comparePlayer ? playerKey(comparePlayer) : ""} onChange={(event) => setCompareKey(event.target.value)}>{matches.map((match) => <option key={playerKey(match)} value={playerKey(match)}>{match.player_name} · {match.similarityPct.toFixed(1)}% match</option>)}</select></div>
            {selectedMatch && <div className="match-explanation"><div><span>Position-aware match</span><strong>{selectedMatch.similarityPct.toFixed(1)}%</strong><small>Weighted for a {target.position.toLowerCase()} profile</small></div>{[["Finishing", selectedMatch.finishingScore], ["Creation", selectedMatch.creationScore], ["Involvement", selectedMatch.involvementScore]].map(([category, value]) => { const score = Number(value); return <div key={String(category)}><span>{category}</span><strong>{score.toFixed(0)}</strong><i><b style={{ width: `${score}%` }} /></i></div>; })}<div><span>Evidence strength</span><strong>{selectedMatch.sampleScore.toFixed(0)}</strong><small>{selectedMatch.sampleLabel} · {Math.min(Number(target.minutes ?? 0), Number(selectedMatch.minutes ?? 0)).toLocaleString()}+ shared-minute floor</small></div></div>}
            <div className="comparison-table">
              <div className="comparison-metrics-head"><span>Percentiles</span>{visibleRadarMetrics.map((feature) => <b key={feature}>{compactLabel(feature)}</b>)}</div>
              <ComparisonRow player={target} features={visibleRadarMetrics} percentiles={cohortPercentiles} color={targetColor} images={playerImages} />
              {comparePlayer && <ComparisonRow player={comparePlayer} features={visibleRadarMetrics} percentiles={cohortPercentiles} color={compareColor} images={playerImages} />}
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
          <div className="panel-heading"><div><span className="eyebrow">Your recruitment list</span><h2>Players to watch</h2><p className="panel-subtitle">Add a decision status and scout notes, then export the list for review.</p></div>{shortlistPlayers.length > 0 && <div className="shortlist-actions"><button className="ghost-action" onClick={exportShortlist}>Export CSV ↓</button><button className="ghost-action" onClick={() => window.print()}>Print report ↗</button><button className="ghost-action danger" onClick={() => { setShortlist([]); setShortlistDetails({}); window.localStorage.removeItem("player-scouting-shortlist"); window.localStorage.removeItem("player-scouting-shortlist-details"); }}>Clear</button></div>}</div>
          <div className="shortlist-grid">{shortlistPlayers.length ? shortlistPlayers.map((player, index) => { const key = playerKey(player); const detail = shortlistDetails[key] ?? { status: "Watching", note: "" }; return <article key={key} className={`shortlist-card status-${detail.status.toLowerCase()}`}><div className="shortlist-player-row"><button onClick={() => scoutPlayer(player)}><span className="shortlist-number">{String(index + 1).padStart(2, "0")}</span><PlayerAvatar player={player} images={playerImages} className="match-avatar" /><span><strong>{player.player_name}</strong><small>{player.club} · {player.position} · {player.season}</small><b>{player.archetype}</b></span></button><button className="remove-player" onClick={() => toggleShortlist(player)} aria-label={`Remove ${player.player_name}`}>×</button></div><MiniHeatStrip player={player} features={payload.metadata.features} percentiles={cohortPercentiles} /><div className="shortlist-detail"><label><span>Decision status</span><select value={detail.status} onChange={(event) => updateShortlistDetail(key, { status: event.target.value as ShortlistDetail["status"] })}><option>Watching</option><option>Review</option><option>Priority</option></select></label><label><span>Scout notes</span><textarea value={detail.note} maxLength={240} placeholder="Add fit, risk or follow-up notes…" onChange={(event) => updateShortlistDetail(key, { note: event.target.value })} /></label></div></article>; }) : <div className="empty-shortlist"><span>＋</span><strong>No players shortlisted yet</strong><p>Save a promising match to start building your recruitment list.</p></div>}</div>
        </section>

        <details className="raw-panel panel"><summary>View full performance numbers <span>＋</span></summary><div className="raw-grid">{payload.metadata.features.map((feature) => <div key={feature}><span>{metricLabel(feature)}</span><strong>{numberFormat(target[feature])}</strong><small>per 90 minutes</small></div>)}</div></details>
        {imageManifest && <details className="photo-credits panel"><summary><span><b>Licensed player photography</b><small>{imageManifest.covered_players} of {imageManifest.total_players} players · initials shown when no verified image is available</small></span><i>View credits ＋</i></summary><p>Portraits are sourced from Wikimedia Commons only after an exact footballer match and reusable licence check. Images are displayed with a centre crop.</p><div className="photo-credit-grid">{imageCredits.map(([providerId, image]) => <div key={providerId}><strong>{image.player_name}</strong><span>{image.creator || "Wikimedia contributor"}</span><a href={image.source_url} target="_blank" rel="noreferrer">Source</a><a href={image.license_url} target="_blank" rel="noreferrer">{image.license}</a></div>)}</div></details>}
        <footer className="data-note"><span>SCOUT//LAB · PLAYER INTELLIGENCE</span><p>Compare Premier League players using attacking and creative performance data, measured per 90 minutes for a fairer view.</p><div><b>{clubs.size}</b> clubs <i /> <b>{payload.metadata.features.length}</b> measures <i /> <b>{payload.metadata.minimum_minutes ?? 450}+</b> minutes <i /> <b>{payload.metadata.dataset_version ?? "dataset"}</b></div></footer>
      </main>
    </div>
  );
}

function PlayerFinder({ players, features, percentiles, position, season, onLoadContext, onScout, onShortlist, shortlisted, images }: { players: Player[]; features: Feature[]; percentiles: PercentileLookup; position: string; season: string; onLoadContext: (position: string, season: string) => void; onScout: (player: Player) => void; onShortlist: (player: Player) => void; shortlisted: string[]; images: Record<string, PlayerImage> }) {
  const [query, setQuery] = useState("");
  const [club, setClub] = useState("All");
  const [archetype, setArchetype] = useState("All");
  const [feature, setFeature] = useState<Feature>(features.includes("key_passes_p90") ? "key_passes_p90" : features[0]);
  const [minimumPercentile, setMinimumPercentile] = useState(75);
  const [minimumMinutes, setMinimumMinutes] = useState(900);
  const [savedSearches, setSavedSearches] = useState<SavedFinderSearch[]>([]);
  const [searchSaved, setSearchSaved] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("player-scouting-saved-searches") ?? "[]");
      if (Array.isArray(saved)) setSavedSearches(saved.slice(0, 6));
    } catch {
      window.localStorage.removeItem("player-scouting-saved-searches");
    }
  }, []);

  function persistSearches(next: SavedFinderSearch[]) {
    setSavedSearches(next);
    window.localStorage.setItem("player-scouting-saved-searches", JSON.stringify(next));
  }

  function saveSearch() {
    const saved: SavedFinderSearch = { id: String(Date.now()), label: `${position} · ${metricLabel(feature)} ${minimumPercentile ? `${minimumPercentile}th+` : "any"}`, position, season, query, club, archetype, feature, minimumPercentile, minimumMinutes };
    persistSearches([saved, ...savedSearches.filter((item) => item.label !== saved.label)].slice(0, 6));
    setSearchSaved(true);
    window.setTimeout(() => setSearchSaved(false), 1600);
  }

  function loadSearch(saved: SavedFinderSearch) {
    onLoadContext(saved.position, saved.season);
    setQuery(saved.query); setClub(saved.club); setArchetype(saved.archetype); setFeature(saved.feature); setMinimumPercentile(saved.minimumPercentile); setMinimumMinutes(saved.minimumMinutes);
  }
  const clubs = useMemo(() => Array.from(new Set(players.flatMap((player) => player.club.split(",").map((item) => item.trim())))).sort(), [players]);
  const archetypes = useMemo(() => Array.from(new Set(players.map((player) => player.archetype))).sort(), [players]);
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return players.filter((player) => {
      const matchesQuery = !normalizedQuery || `${player.player_name} ${player.club}`.toLocaleLowerCase().includes(normalizedQuery);
      const matchesClub = club === "All" || player.club.split(",").map((item) => item.trim()).includes(club);
      const matchesArchetype = archetype === "All" || player.archetype === archetype;
      return matchesQuery && matchesClub && matchesArchetype && Number(player.minutes ?? 0) >= minimumMinutes && percentileValue(percentiles, player, feature) >= minimumPercentile;
    }).sort((a, b) => percentileValue(percentiles, b, feature) - percentileValue(percentiles, a, feature) || Number(b.minutes ?? 0) - Number(a.minutes ?? 0)).slice(0, 12);
  }, [players, query, club, archetype, minimumMinutes, minimumPercentile, percentiles, feature]);

  return <article className="finder-panel panel">
    <div className="finder-controls">
      <label><span>Search player or club</span><input type="search" value={query} placeholder="Type a name…" onChange={(event) => setQuery(event.target.value)} /></label>
      <label><span>Club</span><select value={club} onChange={(event) => setClub(event.target.value)}><option value="All">All clubs</option>{clubs.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>Playing style</span><select value={archetype} onChange={(event) => setArchetype(event.target.value)}><option value="All">All styles</option>{archetypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>Priority metric</span><select value={feature} onChange={(event) => setFeature(event.target.value)}>{features.map((item) => <option key={item} value={item}>{metricLabel(item)}</option>)}</select></label>
      <label><span>Minimum percentile</span><select value={minimumPercentile} onChange={(event) => setMinimumPercentile(Number(event.target.value))}>{[0, 60, 75, 85, 90].map((value) => <option key={value} value={value}>{value === 0 ? "Any percentile" : `${value}th+`}</option>)}</select></label>
      <label><span>Minimum minutes</span><select value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))}>{[450, 900, 1350, 1800].map((value) => <option key={value} value={value}>{value.toLocaleString()}+</option>)}</select></label>
    </div>
    <div className="saved-search-bar"><button type="button" className="save-search" onClick={saveSearch}>{searchSaved ? "Search saved ✓" : "+ Save this search"}</button>{savedSearches.length > 0 && <div className="saved-searches"><span>Saved briefs</span>{savedSearches.map((saved) => <div key={saved.id} className={saved.position !== position || saved.season !== season ? "out-of-context" : ""}><button type="button" title={saved.position !== position || saved.season !== season ? `Created for ${saved.position}s · ${saved.season}` : "Load saved search"} onClick={() => loadSearch(saved)}>{saved.label}</button><button type="button" aria-label={`Delete ${saved.label}`} onClick={() => persistSearches(savedSearches.filter((item) => item.id !== saved.id))}>×</button></div>)}</div>}</div>
    <div className="finder-summary"><div><strong>{results.length}</strong><span>best results shown</span></div><p>Percentiles are adjusted toward the positional average when a player has fewer minutes, reducing small-sample noise.</p></div>
    <div className="finder-results">{results.length ? results.map((player, index) => { const percentile = percentileValue(percentiles, player, feature); const saved = shortlisted.includes(playerKey(player)); return <article key={playerKey(player)} className="finder-card"><div className="finder-rank">{String(index + 1).padStart(2, "0")}</div><button className="finder-player" aria-label={`Scout ${player.player_name}`} onClick={() => onScout(player)}><PlayerAvatar player={player} images={images} /><span><strong>{player.player_name}</strong><small>{player.club} · {Number(player.minutes ?? 0).toLocaleString()} min</small></span></button><div className="finder-metric"><span>{metricLabel(feature)}</span><strong>{numberFormat(player[feature])}<small>/90</small></strong><b>{Math.round(percentile)}th</b></div><div className="finder-style">{player.archetype}</div><button className={`finder-save ${saved ? "saved" : ""}`} onClick={() => onShortlist(player)}>{saved ? "Saved ✓" : "+ Save"}</button></article>; }) : <div className="finder-empty"><strong>No players meet every filter</strong><span>Lower the percentile or minutes threshold to widen the search.</span></div>}</div>
  </article>;
}

function PlayerTrends({ payload, player }: { payload: Payload; player: Player }) {
  const [feature, setFeature] = useState<Feature>(payload.metadata.features.includes("key_passes_p90") ? "key_passes_p90" : payload.metadata.features[0]);
  const history = useMemo(() => payload.players.filter((item) => item.player_name === player.player_name).sort((a, b) => String(a.season).localeCompare(String(b.season))), [payload, player.player_name]);
  const trendData = useMemo(() => history.map((seasonPlayer) => {
    const cohort = payload.players.filter((item) => item.season === seasonPlayer.season && item.position === seasonPlayer.position);
    const lookup = buildCohortPercentiles(cohort, [feature]);
    const cohortMean = cohort.reduce((sum, item) => sum + metricValue(item, feature), 0) / (cohort.length || 1);
    return {
      season: seasonPlayer.season,
      percentile: Number(percentileValue(lookup, seasonPlayer, feature).toFixed(1)),
      raw: metricValue(seasonPlayer, feature),
      adjusted: adjustedMetricValue(seasonPlayer, feature, cohortMean),
      minutes: Number(seasonPlayer.minutes ?? 0),
      club: seasonPlayer.club,
    };
  }), [history, payload, feature]);
  const first = trendData[0]?.percentile ?? 0;
  const last = trendData.at(-1)?.percentile ?? 0;
  const change = last - first;
  const average = trendData.reduce((sum, item) => sum + item.percentile, 0) / (trendData.length || 1);
  const deviation = Math.sqrt(trendData.reduce((sum, item) => sum + ((item.percentile - average) ** 2), 0) / (trendData.length || 1));
  const trajectory = trendData.length < 2 ? "Single-season sample" : change >= 12 ? "Strong upward trend" : change >= 5 ? "Improving" : change <= -12 ? "Clear downward trend" : change <= -5 ? "Trending down" : "Stable profile";
  const consistency = deviation <= 8 ? "Highly consistent" : deviation <= 16 ? "Generally consistent" : "Variable across seasons";

  return <article className="trends-panel panel">
    <div className="trends-toolbar"><div><span className="eyebrow">{player.player_name}</span><h2>{trajectory}</h2><p>{consistency} · {trendData.length} season{trendData.length === 1 ? "" : "s"} available</p></div><label><span>Track metric</span><select value={feature} onChange={(event) => setFeature(event.target.value)}>{payload.metadata.features.map((item) => <option key={item} value={item}>{metricLabel(item)}</option>)}</select></label></div>
    <div className="trend-layout"><div className="trend-chart"><ResponsiveContainer width="100%" height={330}><LineChart data={trendData} margin={{ top: 28, right: 24, bottom: 8, left: 0 }}><CartesianGrid stroke="#243632" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="season" tick={{ fill: "#82918e", fontSize: 11 }} axisLine={{ stroke: "#30423f" }} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "#82918e", fontSize: 11 }} axisLine={false} tickLine={false} width={34} /><Tooltip content={<TrendTooltip feature={feature} />} /><Line type="monotone" dataKey="percentile" stroke={compareColor} strokeWidth={4} dot={{ r: 6, fill: compareColor, stroke: "#0e1b19", strokeWidth: 3 }} activeDot={{ r: 8 }} /></LineChart></ResponsiveContainer><div className="trend-axis-note"><span>Sample-adjusted percentile among same-position players</span><b>{change >= 0 ? "+" : ""}{change.toFixed(0)} pts from first to latest</b></div></div><div className="trend-seasons">{trendData.map((item) => <div key={String(item.season)}><span>{item.season}</span><strong>{item.percentile.toFixed(0)}th</strong><p>{item.raw.toFixed(2)} /90 · {item.minutes.toLocaleString()} min</p><small>{item.club}</small></div>)}</div></div>
    <div className="shrinkage-note"><span>How reliability works</span><p>The displayed per-90 value is always the recorded number. Ranking percentiles use an empirical-Bayes posterior mean with a 900-minute positional prior, so short samples move toward the cohort average and established samples retain more of their observed performance.</p></div>
  </article>;
}

function TrendTooltip({ active, payload, feature }: { active?: boolean; payload?: Array<{ payload: { season: string; percentile: number; raw: number; adjusted: number; minutes: number } }>; feature: Feature }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return <div className="tooltip-card"><strong>{item.season}</strong><span>{metricLabel(feature)}: {item.raw.toFixed(2)} /90</span><span>Adjusted percentile: {item.percentile.toFixed(1)}</span><span>{item.minutes.toLocaleString()} minutes</span></div>;
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

function PlayerAvatar({ player, images, className = "" }: { player: Player; images: Record<string, PlayerImage>; className?: string }) {
  const image = playerImage(player, images);
  return <span className={`${className} player-avatar ${image ? "has-photo" : ""}`} aria-hidden="true">{image ? <img src={image.path} alt="" loading="lazy" /> : initials(player.player_name)}</span>;
}

function MiniHeatStrip({ player, features, percentiles }: { player: Player; features: Feature[]; percentiles: PercentileLookup }) {
  return <div className="mini-heat-strip" aria-label={`${player.player_name} metric percentiles`}>{features.map((feature) => { const value = percentileValue(percentiles, player, feature); return <i key={feature} title={`${metricLabel(feature)}: ${Math.round(value)}th percentile`} style={{ background: heatColor(value) }} />; })}</div>;
}

function HeatmapRow({ player, features, percentiles, target, onSelect, images }: { player: Player; features: Feature[]; percentiles: PercentileLookup; target: boolean; onSelect: () => void; images: Record<string, PlayerImage> }) {
  return <><button className={`heat-player ${target ? "target" : ""}`} onClick={onSelect}><PlayerAvatar player={player} images={images} /><span><strong>{player.player_name}</strong><small>{target ? "Target" : player.club}</small></span></button>{features.map((feature) => { const value = percentileValue(percentiles, player, feature); return <div className="heat-cell" key={`${playerKey(player)}-${feature}`} title={`${metricLabel(feature)} · ${value.toFixed(1)}th percentile`} style={{ background: heatColor(value), color: heatTextColor(value) }}>{Math.round(value)}</div>; })}</>;
}

function ComparisonRow({ player, features, percentiles, color, images }: { player: Player; features: Feature[]; percentiles: PercentileLookup; color: string; images: Record<string, PlayerImage> }) {
  return <div className="comparison-player-row" style={{ color }}><div><PlayerAvatar player={player} images={images} className="comparison-avatar" /><span><strong>{player.player_name}</strong><small>{player.club} · {player.season}</small></span></div>{features.map((feature) => <b key={feature}>{percentileValue(percentiles, player, feature).toFixed(1)}</b>)}</div>;
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
