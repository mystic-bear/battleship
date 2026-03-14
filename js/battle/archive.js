(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../../shared/utils.js")
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
    formatDateTime
  } = deps;

  function summarizeArchiveEntry(entry, language = "ko") {
    if (!entry) return null;
    return {
      id: entry.id,
      savedAtLabel: formatDateTime(entry.finishedAt || entry.savedAt, language),
      resultLabel: entry.winner === "player"
        ? (language === "ko" ? "플레이어 승리" : "Player victory")
        : (language === "ko" ? "상대 승리" : "Enemy victory"),
      shotCount: Array.isArray(entry.gameState?.shotLog) ? entry.gameState.shotLog.length : 0
    };
  }

  return {
    summarizeArchiveEntry
  };
});
