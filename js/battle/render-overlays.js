(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("./constants.js")
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
    BOARD_SIZE,
    RESULT_TYPES
  } = deps;

  const OVERLAY_SYMBOLS = {
    [RESULT_TYPES.MISS]: "💦",
    [RESULT_TYPES.HIT]: "🔥",
    [RESULT_TYPES.SUNK]: "💥"
  };

  function pct(value) {
    return `${(value / BOARD_SIZE) * 100}%`;
  }

  function getOverlaySymbol(result) {
    return OVERLAY_SYMBOLS[result] || "";
  }

  function buildOverlayMarkers(board) {
    const markers = [];
    (board || []).forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell.attacked || !cell.result) return;
        markers.push({
          key: `${rowIndex}:${colIndex}`,
          row: rowIndex,
          col: colIndex,
          result: cell.result,
          symbol: getOverlaySymbol(cell.result),
          style: {
            left: pct(colIndex),
            top: pct(rowIndex),
            width: pct(1),
            height: pct(1)
          }
        });
      });
    });
    return markers;
  }

  return {
    OVERLAY_SYMBOLS,
    getOverlaySymbol,
    buildOverlayMarkers
  };
});
