(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../../shared/utils.js"),
      ...require("./constants.js"),
      ...require("./rules.js")
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

  const {
    formatCoordinate,
    PLAYER_KEYS,
    getOpponentKey,
    listAvailableShots,
    getUnresolvedHitCells
  } = deps;

  function buildCandidateScores(state, attackerKey = PLAYER_KEYS.PLAYER) {
    const target = state.players[getOpponentKey(attackerKey)];
    const unresolvedHits = getUnresolvedHitCells(target);

    return listAvailableShots(state, attackerKey).map((cell) => {
      let score = (cell.row + cell.col) % 2 === 0 ? 2 : 0;
      const centerBias = 5 - (Math.abs(cell.row - 4.5) + Math.abs(cell.col - 4.5)) / 2;
      score += Math.max(0, centerBias);

      unresolvedHits.forEach((hit) => {
        const manhattan = Math.abs(hit.row - cell.row) + Math.abs(hit.col - cell.col);
        if (manhattan === 1) {
          score += 14;
        } else if (manhattan === 2 && (hit.row === cell.row || hit.col === cell.col)) {
          score += 6;
        }
      });

      return {
        row: cell.row,
        col: cell.col,
        coord: formatCoordinate(cell.row, cell.col),
        score: Number(score.toFixed(2))
      };
    }).sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
  }

  function describeZone(candidates, language = "ko", explicitZone = null) {
    if (explicitZone?.vertical && explicitZone?.horizontal) {
      if (language === "ko") {
        const vertical = explicitZone.vertical === "upper" ? "상단" : "하단";
        const horizontal = explicitZone.horizontal === "left" ? "왼쪽" : "오른쪽";
        return `보드의 ${vertical} ${horizontal} 구역을 우선 살펴보세요.`;
      }
      return `Focus on the ${explicitZone.vertical} ${explicitZone.horizontal} side of the board.`;
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return language === "ko" ? "남은 유효 칸이 없습니다." : "There are no legal cells left.";
    }
    const rowAverage = candidates.reduce((sum, entry) => sum + entry.row, 0) / candidates.length;
    const colAverage = candidates.reduce((sum, entry) => sum + entry.col, 0) / candidates.length;
    const vertical = rowAverage < 5 ? (language === "ko" ? "상단" : "upper") : (language === "ko" ? "하단" : "lower");
    const horizontal = colAverage < 5 ? (language === "ko" ? "왼쪽" : "left") : (language === "ko" ? "오른쪽" : "right");
    return language === "ko"
      ? `보드의 ${vertical} ${horizontal} 구역을 우선 살펴보세요.`
      : `Focus on the ${vertical} ${horizontal} side of the board.`;
  }

  function normalizeCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : []).map((entry) => ({
      row: Number(entry.row),
      col: Number(entry.col),
      coord: entry.coord || formatCoordinate(entry.row, entry.col),
      score: Number(entry.score) || 0
    })).filter((entry) => Number.isInteger(entry.row) && Number.isInteger(entry.col));
  }

  function withSharedMeta(packet, options = {}) {
    return {
      ...packet,
      pending: !!options.pending,
      source: options.source || null,
      searchPhase: options.searchPhase || null,
      monteCarlo: options.monteCarlo || null,
      meta: options.searchMeta || null
    };
  }

  function buildHintFromCandidates(candidates, stage = 1, language = "ko", options = {}) {
    const normalizedCandidates = normalizeCandidates(candidates);
    const recommended = normalizedCandidates[0] || null;
    const normalizedStage = Math.max(1, Math.min(3, Number(stage) || 1));

    if (!recommended) {
      return withSharedMeta({
        stage: normalizedStage,
        availableStage: 0,
        recommended: null,
        candidates: [],
        summary: language === "ko" ? "추천할 칸이 없습니다." : "No recommendation is available."
      }, options);
    }

    if (normalizedStage === 1) {
      return withSharedMeta({
        stage: 1,
        availableStage: 3,
        recommended,
        candidates: normalizedCandidates.slice(0, 3),
        summary: describeZone(normalizedCandidates.slice(0, 4), language, options.zone)
      }, options);
    }

    if (normalizedStage === 2) {
      const listed = normalizedCandidates.slice(0, 3).map((entry) => entry.coord).join(", ");
      return withSharedMeta({
        stage: 2,
        availableStage: 3,
        recommended,
        candidates: normalizedCandidates.slice(0, 3),
        summary: language === "ko"
          ? `우선 후보는 ${listed} 입니다.`
          : `The leading candidates are ${listed}.`
      }, options);
    }

    return withSharedMeta({
      stage: 3,
      availableStage: 3,
      recommended,
      candidates: normalizedCandidates.slice(0, 5),
      summary: language === "ko"
        ? `가장 추천하는 칸은 ${recommended.coord} 입니다.`
        : `The strongest recommendation is ${recommended.coord}.`
    }, options);
  }

  function buildHint(state, stage = 1, attackerKey = PLAYER_KEYS.PLAYER, language = "ko") {
    return buildHintFromCandidates(buildCandidateScores(state, attackerKey), stage, language, {
      source: "local",
      searchPhase: "local-fallback"
    });
  }

  return {
    buildCandidateScores,
    buildHintFromCandidates,
    buildHint
  };
});
