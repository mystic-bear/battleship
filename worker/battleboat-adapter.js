(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../js/battle/constants.js"),
      ...require("./montecarlo-rerank.js")
    };
  } else {
    deps = root;
  }

  const api = factory(deps);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  const GRID_TYPES = {
    EMPTY: 0,
    MISS: 2,
    HIT: 3,
    SUNK: 4
  };

  const DEFAULT_BOARD_SIZE = 10;
  const DEFAULT_REMAINING_SHIPS = [5, 4, 3, 3, 2];
  const PROB_WEIGHT = 5000;

  const OPENINGS = [
    { row: 7, col: 3, weight: 15 },
    { row: 6, col: 2, weight: 15 },
    { row: 3, col: 7, weight: 15 },
    { row: 2, col: 6, weight: 15 },
    { row: 6, col: 6, weight: 15 },
    { row: 3, col: 3, weight: 15 },
    { row: 5, col: 5, weight: 15 },
    { row: 4, col: 4, weight: 15 },
    { row: 0, col: 8, weight: 20 },
    { row: 1, col: 9, weight: 25 },
    { row: 8, col: 0, weight: 20 },
    { row: 9, col: 1, weight: 25 },
    { row: 9, col: 9, weight: 25 },
    { row: 0, col: 0, weight: 25 }
  ];

  const DEFAULT_PRESETS = {
    1: { level: 1, randomness: 0.58, topPool: 7, openingScale: 0.85, hitWeightScale: 0.45, monteCarlo: null },
    2: { level: 2, randomness: 0.42, topPool: 5, openingScale: 0.9, hitWeightScale: 0.65, monteCarlo: null },
    3: { level: 3, randomness: 0.1, topPool: 3, openingScale: 1, hitWeightScale: 1, monteCarlo: null },
    4: {
      level: 4,
      randomness: 0.04,
      topPool: 2,
      openingScale: 1,
      hitWeightScale: 1,
      monteCarlo: {
        mode: "fallback",
        topCandidates: 3,
        sampleCount: 140,
        hitBias: 10,
        baseWeight: 0.75,
        monteCarloWeight: 1.05,
        tieCandidateCount: 2
      }
    },
    5: {
      level: 5,
      randomness: 0,
      topPool: 1,
      openingScale: 1,
      hitWeightScale: 1,
      monteCarlo: {
        mode: "rerank",
        topCandidates: 7,
        sampleCount: 360,
        hitBias: 12,
        baseWeight: 0.4,
        monteCarloWeight: 1.7,
        tieCandidateCount: 2
      }
    }
  };
  const PRESETS = deps.AI_DIFFICULTY_PRESETS || DEFAULT_PRESETS;
  const getSharedPreset = typeof deps.getAiDifficultyPreset === "function"
    ? deps.getAiDifficultyPreset
    : null;
  const rerankCandidatesWithMonteCarlo = typeof deps.rerankCandidatesWithMonteCarlo === "function"
    ? deps.rerankCandidatesWithMonteCarlo
    : null;
  const COLUMN_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function createAdapterError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getPreset(aiLevel) {
    if (getSharedPreset) {
      return getSharedPreset(aiLevel);
    }
    return PRESETS[Number(aiLevel)] || PRESETS[3];
  }

  function formatCoordinate(row, col) {
    return `${COLUMN_LABELS[col] || "?"}${Number(row) + 1}`;
  }

  function createMatrix(size, fill = 0) {
    return Array.from({ length: size }, () => Array.from({ length: size }, () => fill));
  }

  function assertInteger(value, label) {
    if (!Number.isInteger(value)) {
      throw createAdapterError(`${label} must be an integer`, "invalid-state");
    }
  }

  function summarizeCandidate(candidate) {
    if (!candidate) return null;
    const summary = {
      row: Number(candidate.row),
      col: Number(candidate.col),
      coord: candidate.coord || formatCoordinate(candidate.row, candidate.col),
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

  function buildTopCandidateList(candidates, count) {
    const limit = Math.max(1, Math.min(Number(count) || 4, Array.isArray(candidates) ? candidates.length : 0));
    return (Array.isArray(candidates) ? candidates : []).slice(0, limit).map((candidate) => summarizeCandidate(candidate));
  }

  function buildSearchMeta(preset, searchPhase, monteCarlo, candidates) {
    return {
      level: Number(preset?.level) || 3,
      randomness: Number(preset?.randomness) || 0,
      topPool: Number(preset?.topPool) || 1,
      openingScale: Number(preset?.openingScale) || 1,
      hitWeightScale: Number(preset?.hitWeightScale) || 1,
      searchPhase: searchPhase || "battleboat-probability",
      topCandidates: buildTopCandidateList(candidates, Math.max(4, preset?.topPool || 1)),
      monteCarlo: monteCarlo || null
    };
  }
  function buildIdleMonteCarloMeta(config, candidates, extra = {}) {
    if (!config) return null;
    return {
      applied: false,
      mode: config.mode || null,
      reason: extra.reason || "not-requested",
      searchPhase: "battleboat-probability",
      samplesAccepted: Number(extra.samplesAccepted) || 0,
      samplesAttempted: Number(extra.samplesAttempted) || 0,
      acceptRate: Number(extra.acceptRate) || 0,
      candidateCount: Math.max(1, Math.min(Number(config.topCandidates) || 4, Array.isArray(candidates) ? candidates.length : 0)),
      topCandidates: buildTopCandidateList(candidates, Number(config.topCandidates) || 4),
      unresolvedHitCount: Number(extra.unresolvedHitCount) || 0,
      tieCount: Number(extra.tieCount) || 0
    };
  }

  function normalizeState(gameState) {
    const size = Number(gameState?.boardSize);
    if (!Number.isInteger(size) || size < 2 || size > 26) {
      throw createAdapterError("gameState.boardSize must be an integer between 2 and 26", "invalid-state");
    }

    const remainingShips = Array.isArray(gameState?.remainingShips) && gameState.remainingShips.length > 0
      ? [...gameState.remainingShips]
      : [...DEFAULT_REMAINING_SHIPS];
    if (!remainingShips.every((shipSize) => Number.isInteger(shipSize) && shipSize > 0 && shipSize <= size)) {
      throw createAdapterError("gameState.remainingShips must contain positive ship lengths within the board size", "invalid-state");
    }

    const shots = Array.isArray(gameState?.shots) ? gameState.shots : [];
    const unresolvedHits = Array.isArray(gameState?.unresolvedHits) ? gameState.unresolvedHits : [];
    const grid = createMatrix(size, GRID_TYPES.EMPTY);
    const seenShots = new Set();

    shots.forEach((shot, index) => {
      const row = Number(shot?.row);
      const col = Number(shot?.col);
      assertInteger(row, `shots[${index}].row`);
      assertInteger(col, `shots[${index}].col`);
      if (row < 0 || col < 0 || row >= size || col >= size) {
        throw createAdapterError(`shots[${index}] is outside the board`, "invalid-state");
      }
      const key = `${row}:${col}`;
      if (seenShots.has(key)) {
        throw createAdapterError(`Duplicate shot entry detected at ${key}`, "invalid-state");
      }
      seenShots.add(key);

      if (shot.result === "miss") {
        grid[row][col] = GRID_TYPES.MISS;
      } else if (shot.result === "sunk") {
        grid[row][col] = GRID_TYPES.SUNK;
      } else if (shot.result === "hit") {
        grid[row][col] = GRID_TYPES.HIT;
      } else {
        throw createAdapterError(`shots[${index}].result must be one of miss/hit/sunk`, "invalid-state");
      }
    });

    unresolvedHits.forEach((shot, index) => {
      const row = Number(shot?.row);
      const col = Number(shot?.col);
      assertInteger(row, `unresolvedHits[${index}].row`);
      assertInteger(col, `unresolvedHits[${index}].col`);
      if (row < 0 || col < 0 || row >= size || col >= size) {
        throw createAdapterError(`unresolvedHits[${index}] is outside the board`, "invalid-state");
      }
      if (grid[row][col] !== GRID_TYPES.HIT) {
        throw createAdapterError(`unresolvedHits[${index}] must point to a recorded hit cell`, "invalid-state");
      }
    });

    return {
      size,
      grid,
      remainingShips,
      unresolvedHits
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

  function isPlacementLegal(state, cells) {
    return cells.every((cell) => {
      if (cell.row < 0 || cell.col < 0 || cell.row >= state.size || cell.col >= state.size) {
        return false;
      }
      const value = state.grid[cell.row][cell.col];
      return value !== GRID_TYPES.MISS && value !== GRID_TYPES.SUNK;
    });
  }

  function passesThroughHitCell(state, cells) {
    return cells.some((cell) => state.grid[cell.row][cell.col] === GRID_TYPES.HIT);
  }

  function countCoveredHits(state, cells) {
    return cells.reduce((count, cell) => count + (state.grid[cell.row][cell.col] === GRID_TYPES.HIT ? 1 : 0), 0);
  }

  function updateProbabilityGrid(state, preset) {
    const probGrid = createMatrix(state.size, 0);
    const hitWeightScale = Number(preset?.hitWeightScale) || 1;

    state.remainingShips.forEach((shipSize) => {
      ["horizontal", "vertical"].forEach((orientation) => {
        for (let row = 0; row < state.size; row += 1) {
          for (let col = 0; col < state.size; col += 1) {
            const cells = buildShipCells(row, col, shipSize, orientation);
            if (!isPlacementLegal(state, cells)) continue;
            if (passesThroughHitCell(state, cells)) {
              const hitCount = countCoveredHits(state, cells);
              cells.forEach((cell) => {
                probGrid[cell.row][cell.col] += PROB_WEIGHT * Math.max(1, hitCount) * hitWeightScale;
              });
            } else {
              cells.forEach((cell) => {
                probGrid[cell.row][cell.col] += 1;
              });
            }
          }
        }
      });
    });

    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        if (state.grid[row][col] !== GRID_TYPES.EMPTY) {
          probGrid[row][col] = 0;
        }
      }
    }

    return probGrid;
  }
  function applyOpeningWeights(probGrid, state, preset) {
    OPENINGS.forEach((entry) => {
      if (entry.row >= state.size || entry.col >= state.size) return;
      if (state.grid[entry.row][entry.col] !== GRID_TYPES.EMPTY) return;
      if (probGrid[entry.row][entry.col] > 0) {
        probGrid[entry.row][entry.col] += Math.round(entry.weight * preset.openingScale);
      }
    });
  }

  function countTopTies(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return 0;
    const topScore = candidates[0].score;
    return candidates.filter((candidate) => candidate.score === topScore).length;
  }

  function getMonteCarloDecision(state, candidates, preset) {
    const config = preset?.monteCarlo;
    if (!config || !rerankCandidatesWithMonteCarlo) {
      return { shouldApply: false, reason: "disabled", unresolvedHitCount: 0, tieCount: 0 };
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { shouldApply: false, reason: "no-candidates", unresolvedHitCount: 0, tieCount: 0 };
    }

    const unresolvedHitCount = Array.isArray(state?.unresolvedHits) ? state.unresolvedHits.length : 0;
    const tieCount = countTopTies(candidates);
    if (config.mode === "rerank") {
      return {
        shouldApply: candidates.length > 1,
        reason: candidates.length > 1 ? "rerank-window" : "not-enough-candidates",
        unresolvedHitCount,
        tieCount
      };
    }

    if (unresolvedHitCount > 0) {
      return { shouldApply: true, reason: "unresolved-hit", unresolvedHitCount, tieCount };
    }
    if (tieCount >= (config.tieCandidateCount || 2)) {
      return { shouldApply: true, reason: "top-score-tie", unresolvedHitCount, tieCount };
    }
    return { shouldApply: false, reason: "fallback-not-needed", unresolvedHitCount, tieCount };
  }

  function applyMonteCarloRerank(state, candidates, preset) {
    const config = preset?.monteCarlo;
    if (!config) {
      return {
        candidates,
        searchPhase: "battleboat-probability",
        monteCarlo: null
      };
    }

    const decision = getMonteCarloDecision(state, candidates, preset);
    if (!decision.shouldApply) {
      return {
        candidates,
        searchPhase: "battleboat-probability",
        monteCarlo: buildIdleMonteCarloMeta(config, candidates, decision)
      };
    }

    const result = rerankCandidatesWithMonteCarlo(state, candidates, {
      ...config,
      triggerReason: decision.reason,
      unresolvedHitCount: decision.unresolvedHitCount,
      tieCount: decision.tieCount
    });
    if (!result?.applied) {
      return {
        candidates,
        searchPhase: "battleboat-probability",
        monteCarlo: result?.meta || buildIdleMonteCarloMeta(config, candidates, {
          ...decision,
          reason: decision.reason || "zero-accepted-samples"
        })
      };
    }

    return {
      candidates: result.candidates,
      searchPhase: result.meta?.searchPhase || "battleboat-probability",
      monteCarlo: result.meta || null
    };
  }

  function rankCandidates(gameState, aiLevel = 3) {
    const preset = getPreset(aiLevel);
    const state = normalizeState(gameState);
    const probGrid = updateProbabilityGrid(state, preset);
    applyOpeningWeights(probGrid, state, preset);

    const candidates = [];
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        if (state.grid[row][col] !== GRID_TYPES.EMPTY) continue;
        candidates.push({
          row,
          col,
          coord: formatCoordinate(row, col),
          score: probGrid[row][col]
        });
      }
    }

    candidates.sort((left, right) => right.score - left.score || left.row - right.row || left.col - right.col);
    const monteCarlo = applyMonteCarloRerank(state, candidates, preset);
    const meta = buildSearchMeta(preset, monteCarlo.searchPhase, monteCarlo.monteCarlo, monteCarlo.candidates);
    return {
      state,
      preset,
      probGrid,
      candidates: monteCarlo.candidates,
      searchPhase: monteCarlo.searchPhase,
      monteCarlo: monteCarlo.monteCarlo,
      meta
    };
  }

  function chooseCandidate(candidates, aiLevel = 3) {
    const preset = getPreset(aiLevel);
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const pool = candidates.slice(0, Math.max(1, Math.min(preset.topPool, candidates.length)));
    if (pool.length === 1) return pool[0];
    if (Math.random() < preset.randomness) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return pool[0];
  }

  function summarizeZone(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const rowAverage = candidates.reduce((sum, entry) => sum + entry.row, 0) / candidates.length;
    const colAverage = candidates.reduce((sum, entry) => sum + entry.col, 0) / candidates.length;
    return {
      vertical: rowAverage < 5 ? "upper" : "lower",
      horizontal: colAverage < 5 ? "left" : "right"
    };
  }

  function buildHintPacket(candidates, stage = 1, meta = {}) {
    const normalizedStage = Math.max(1, Math.min(3, Number(stage) || 1));
    const recommended = candidates[0] || null;
    const zone = summarizeZone(candidates.slice(0, 4));
    return {
      stage: normalizedStage,
      availableStage: 3,
      recommended,
      candidates: candidates.slice(0, normalizedStage === 1 ? 3 : normalizedStage === 2 ? 3 : 5),
      zone,
      summary: recommended
        ? `battleboat suggests ${recommended.coord}`
        : "No legal targets remain.",
      searchPhase: meta.searchPhase || "battleboat-probability",
      monteCarlo: meta.monteCarlo || null,
      meta: meta.searchMeta || null
    };
  }

  function chooseMove(gameState, aiLevel = 3) {
    const { candidates, probGrid, searchPhase, monteCarlo, meta } = rankCandidates(gameState, aiLevel);
    const selected = chooseCandidate(candidates, aiLevel);
    return {
      move: selected ? {
        ...selected,
        searchPhase,
        monteCarlo: monteCarlo || null,
        meta
      } : null,
      candidates: candidates.slice(0, 8).map((candidate) => ({
        ...candidate,
        searchPhase
      })),
      probGrid,
      searchPhase,
      monteCarlo,
      meta
    };
  }

  function getHint(gameState, aiLevel = 3, stage = 1) {
    const { candidates, probGrid, searchPhase, monteCarlo, meta } = rankCandidates(gameState, aiLevel);
    return {
      hint: buildHintPacket(candidates, stage, { searchPhase, monteCarlo, searchMeta: meta }),
      probGrid,
      searchPhase,
      monteCarlo,
      meta
    };
  }

  return {
    GRID_TYPES,
    OPENINGS,
    PRESETS,
    normalizeState,
    rankCandidates,
    chooseCandidate,
    buildHintPacket,
    chooseMove,
    getHint
  };
});















