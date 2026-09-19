# Model Validation Report

This report is generated from the committed free Understat player-season dataset. It evaluates model behaviour; it does not claim that statistical similarity predicts transfer success.

## Reliability prior

- Completed-season player transitions: **550**
- Current prior: **900 minutes**
- Error reduction versus raw per-90 rates: **10.1%**
- Best tested prior: **1,200 minutes**
- Current-to-best error gap: **0.26%**
- Decision: Retain the 900-minute prior: it is within 1% of the best tested error while preserving more responsiveness to established player samples.

## Recruitment-brief sensitivity

- Profiles evaluated: **1,854**
- Mean share of top-10 matches retained across all four briefs: **57.8%**
- Mean pairwise top-10 Jaccard overlap: **63.8%**

Brief changes materially affect some recommendations, so the product exposes sensitivity for every match.

## Cluster diagnostics

- KMeans clusters: **5**
- Silhouette score: **0.294** (moderate separation)
- Latest cluster-distribution drift: **10.9%** (2024-2025 to 2025-2026)

Clusters are descriptive style groups, not scouting grades or natural-position ground truth.
