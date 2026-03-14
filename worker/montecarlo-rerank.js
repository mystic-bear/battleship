(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GRID_TYPES = {
    EMPTY: 0,
    MISS: 2,
    HIT: 3,
    SUNK: 4
  };

  function buildCellKey(row, col) {
    return `${row}:${col}`;
  }

  function summarizeCandidate(candidate) {
    if (!candidate) return null;
    const summary = {
      row: Number(candidate.row),
      col: Number(candidate.col),
      coord: candidate.coord || `${candidate.row}:${candidate.col}`,
      score: Number(candidate.score) || 0
    };
    if (Number.isFinite(candidate.monteCarloScore)) {
      summary.monteCarloScore = Number(candidate.monteCarloScore);
    }
    if (Number.isFinite(candidate.combinedScore)) {
      summary.combinedScore = Number(candidate.combinedScore);
    }
    return summary;
  }

  function buildMeta(searchPhase, mode, candidates, extra = {}) {
    const topWindow = Array.isArray(candidates) ? candidates.map((candidate) => summarizeCandidate(candidate)) : [];
    return {
      applied: false,
      mode: mode || null,
      reason: extra.reason || null,
      searchPhase,
      samplesAccepted: Number(extra.samplesAccepted) || 0,
      samplesAttempted: Number(extra.samplesAttempted) || 0,
      acceptRate: Number(extra.acceptRate) || 0,
      candidateCount: Number(extra.candidateCount) || topWindow.length,
      topCandidates: topWindow,
      unresolvedHitCount: Number(extra.unresolvedHitCount) || 0,
      tieCount: Number(extra.tieCount) || 0
    };
  }

  function buildShipCells(row, col, size, orientation) {
    const cells = [];
    for (let index = 0; index < size; index += 1) {
      cells.push({
        row: row + (orientation === "vertical" ? index : 0),
        col: col + (orientation === "horizontal" ? index : 0)
      });
    }
    return cells;
  }

  function buildPlacements(state, shipSize) {
    const placements = [];
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        ["horizontal", "vertical"].forEach((orientation) => {
          const cells = buildShipCells(row, col, shipSize, orientation);
          let blocked = false;
          const keys = [];
          const hitKeys = [];

          cells.forEach((cell) => {
            if (blocked) return;
            if (cell.row < 0 || cell.col < 0 || cell.row >= state.size || cell.col >= state.size) {
              blocked = true;
              return;
            }
            const value = state.grid[cell.row][cell.col];
            if (value === GRID_TYPES.MISS || value === GRID_TYPES.SUNK) {
              blocked = true;
              return;
            }
            const key = buildCellKey(cell.row, cell.col);
            keys.push(key);
            if (value === GRID_TYPES.HIT) {
              hitKeys.push(key);
            }
          });

          if (blocked) return;
          placements.push({
            shipSize,
            row,
            col,
            orientation,
            cells,
            keys,
            hitKeys,
            hitCount: hitKeys.length
          });
        });
      }
    }
    return placements;
  }

  function overlapsPlacement(placement, occupied) {
    return placement.keys.some((key) => occupied.has(key));
  }

  function countCoverage(placement, unresolvedHitKeys) {
    return placement.hitKeys.reduce((count, key) => count + (unresolvedHitKeys.has(key) ? 1 : 0), 0);
  }

  function chooseWeightedPlacement(entries) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return entries[0]?.placement || null;
    let roll = Math.random() * totalWeight;
    for (let index = 0; index < entries.length; index += 1) {
      roll -= entries[index].weight;
      if (roll <= 0) {
        return entries[index].placement;
      }
    }
    return entries[entries.length - 1]?.placement || null;
  }

  function sampleBoard(state, placementsBySize, shipSizes, config) {
    const unresolvedHitKeys = new Set((state.unresolvedHits || []).map((cell) => buildCellKey(cell.row, cell.col)));
    const occupied = new Set();
    const chosenPlacements = [];
    const orderedShips = shipSizes
      .map((size, index) => ({ size, sortKey: `${String(size).padStart(2, "0")}-${index}` }))
      .sort((left, right) => right.size - left.size || left.sortKey.localeCompare(right.sortKey));

    for (let index = 0; index < orderedShips.length; index += 1) {
      const ship = orderedShips[index];
      const validPlacements = (placementsBySize[ship.size] || []).flatMap((placement) => {
        if (overlapsPlacement(placement, occupied)) return [];
        const coverage = countCoverage(placement, unresolvedHitKeys);
        return [{
          placement,
          coverage,
          weight: 1 + (coverage * (config.hitBias || 10)) + (placement.hitCount * 0.25) + (Math.random() * 0.05)
        }];
      });

      if (validPlacements.length === 0) {
        return null;
      }

      const hitCoveringPlacements = unresolvedHitKeys.size > 0
        ? validPlacements.filter((entry) => entry.coverage > 0)
        : [];
      const pool = hitCoveringPlacements.length > 0 ? hitCoveringPlacements : validPlacements;
      const selected = chooseWeightedPlacement(pool);
      if (!selected) return null;

      chosenPlacements.push(selected);
      selected.keys.forEach((key) => occupied.add(key));
      selected.hitKeys.forEach((key) => unresolvedHitKeys.delete(key));
    }

    if (unresolvedHitKeys.size > 0) {
      return null;
    }

    return chosenPlacements;
  }

  function rerankCandidatesWithMonteCarlo(state, candidates, options = {}) {
    const rankedCandidates = Array.isArray(candidates) ? [...candidates] : [];
    const candidateCount = Math.max(1, Math.min(Number(options.topCandidates) || 4, rankedCandidates.length));
    const limitedCandidates = rankedCandidates.slice(0, candidateCount);
    const searchPhase = options.mode === "fallback"
      ? "battleboat-montecarlo-fallback"
      : "battleboat-montecarlo-rerank";
    const mode = options.mode || null;
    const unresolvedHitCount = Array.isArray(state?.unresolvedHits) ? state.unresolvedHits.length : 0;
    const tieCount = Number(options.tieCount) || 0;

    if (!state || !Array.isArray(state.remainingShips) || state.remainingShips.length === 0 || limitedCandidates.length === 0) {
      return {
        applied: false,
        candidates: rankedCandidates,
        meta: buildMeta(searchPhase, mode, limitedCandidates, {
          reason: options.triggerReason || "no-candidates",
          candidateCount,
          unresolvedHitCount,
          tieCount
        })
      };
    }

    const uniqueShipSizes = [...new Set(state.remainingShips)];
    const placementsBySize = uniqueShipSizes.reduce((acc, shipSize) => {
      acc[shipSize] = buildPlacements(state, shipSize);
      return acc;
    }, {});

    if (uniqueShipSizes.some((shipSize) => (placementsBySize[shipSize] || []).length === 0)) {
      return {
        applied: false,
        candidates: rankedCandidates,
        meta: buildMeta(searchPhase, mode, limitedCandidates, {
          reason: options.triggerReason || "no-placements",
          candidateCount,
          unresolvedHitCount,
          tieCount
        })
      };
    }

    const sampleTarget = Math.max(24, Number(options.sampleCount) || 180);
    const maxAttempts = Math.max(sampleTarget * 10, sampleTarget + 40);
    const candidateKeys = limitedCandidates.map((candidate) => buildCellKey(candidate.row, candidate.col));
    const occupancyCounts = new Map(candidateKeys.map((key) => [key, 0]));

    let samplesAccepted = 0;
    let samplesAttempted = 0;

    while (samplesAccepted < sampleTarget && samplesAttempted < maxAttempts) {
      samplesAttempted += 1;
      const sample = sampleBoard(state, placementsBySize, state.remainingShips, options);
      if (!sample) continue;

      samplesAccepted += 1;
      const coveredKeys = new Set();
      sample.forEach((placement) => {
        placement.keys.forEach((key) => coveredKeys.add(key));
      });

      candidateKeys.forEach((key) => {
        if (coveredKeys.has(key)) {
          occupancyCounts.set(key, (occupancyCounts.get(key) || 0) + 1);
        }
      });
    }

    if (samplesAccepted === 0) {
      return {
        applied: false,
        candidates: rankedCandidates,
        meta: buildMeta(searchPhase, mode, limitedCandidates, {
          reason: options.triggerReason || "zero-accepted-samples",
          samplesAccepted,
          samplesAttempted,
          candidateCount,
          unresolvedHitCount,
          tieCount
        })
      };
    }

    const topBaseScore = Math.max(1, Number(limitedCandidates[0]?.score) || 1);
    const baseWeight = Number(options.baseWeight) || 0.5;
    const monteCarloWeight = Number(options.monteCarloWeight) || 1.5;

    const rerankedTop = limitedCandidates.map((candidate) => {
      const key = buildCellKey(candidate.row, candidate.col);
      const monteCarloScore = (occupancyCounts.get(key) || 0) / samplesAccepted;
      const normalizedBase = (Number(candidate.score) || 0) / topBaseScore;
      const combinedScore = (normalizedBase * baseWeight) + (monteCarloScore * monteCarloWeight);
      return {
        ...candidate,
        monteCarloScore: Number(monteCarloScore.toFixed(4)),
        combinedScore: Number(combinedScore.toFixed(4)),
        monteCarloSamples: samplesAccepted
      };
    }).sort((left, right) => {
      return (right.combinedScore - left.combinedScore)
        || (right.monteCarloScore - left.monteCarloScore)
        || (right.score - left.score)
        || (left.row - right.row)
        || (left.col - right.col);
    });

    return {
      applied: true,
      candidates: [...rerankedTop, ...rankedCandidates.slice(candidateCount)],
      meta: {
        ...buildMeta(searchPhase, mode, rerankedTop, {
          reason: options.triggerReason || (mode === "fallback" ? "fallback-window" : "rerank-window"),
          samplesAccepted,
          samplesAttempted,
          acceptRate: Number((samplesAccepted / Math.max(1, samplesAttempted)).toFixed(4)),
          candidateCount,
          unresolvedHitCount,
          tieCount
        }),
        applied: true
      }
    };
  }

  return {
    GRID_TYPES,
    buildPlacements,
    rerankCandidatesWithMonteCarlo
  };
});
