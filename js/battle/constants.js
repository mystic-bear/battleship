(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BOARD_SIZE = 10;
  const SHIP_SPRITE_HEIGHT_CELLS = 3;
  const SHIP_SPRITE_PADDING_CELLS = Math.floor(SHIP_SPRITE_HEIGHT_CELLS / 2);

  const PHASES = {
    PLACEMENT: "placement",
    BATTLE: "battle",
    GAME_OVER: "game-over"
  };

  const PLAYER_KEYS = {
    PLAYER: "player",
    ENEMY: "enemy"
  };

  const RESULT_TYPES = {
    MISS: "miss",
    HIT: "hit",
    SUNK: "sunk"
  };

  function createSpriteLayout(canvasHeightCells, overrides = {}) {
    const footprintBand = 1 / canvasHeightCells;
    const footprintStart = 1 - footprintBand;
    const centeredStart = (1 - footprintBand) / 2;
    const defaultHorizontal = {
      footprint: {
        x: 0,
        y: footprintStart,
        w: 1,
        h: footprintBand
      },
      nudgeXCells: 0,
      nudgeYCells: 0
    };
    const defaultVertical = {
      footprint: {
        x: centeredStart,
        y: 0,
        w: footprintBand,
        h: 1
      },
      nudgeXCells: 0,
      nudgeYCells: 0
    };
    const horizontalOverrides = overrides.horizontal || {};
    const verticalOverrides = overrides.vertical || {};

    return {
      canvasHeightCells,
      horizontal: {
        ...defaultHorizontal,
        ...horizontalOverrides,
        footprint: {
          ...defaultHorizontal.footprint,
          ...(horizontalOverrides.footprint || {})
        }
      },
      vertical: {
        ...defaultVertical,
        ...verticalOverrides,
        footprint: {
          ...defaultVertical.footprint,
          ...(verticalOverrides.footprint || {})
        }
      }
    };
  }

  const SHIP_TYPES = [
    {
      key: "carrier",
      label: "항공모함",
      size: 5,
      asset: "assets/ships/carrier_5.png",
      bbKey: "carrier",
      spriteLayout: createSpriteLayout(3, {
        horizontal: { nudgeYCells: 0.34 },
        vertical: { nudgeXCells: 0.55, nudgeYCells: 0.00 }
      })
    },
    {
      key: "battleship",
      label: "전함",
      size: 4,
      asset: "assets/ships/battleship_4.png",
      bbKey: "battleship",
      spriteLayout: createSpriteLayout(3, {
        horizontal: { nudgeYCells: 0.38 },
        vertical: { nudgeXCells: 0.45, nudgeYCells: 0.00 }
      })
    },
    {
      key: "cruiser",
      label: "순양함",
      size: 3,
      asset: "assets/ships/cruiser_3.png",
      bbKey: "destroyer",
      spriteLayout: createSpriteLayout(3, {
        horizontal: { nudgeYCells: 0.40 },
        vertical: { nudgeXCells: 0.35, nudgeYCells: 0.00 }
      })
    },
    {
      key: "submarine",
      label: "잠수함",
      size: 3,
      asset: "assets/ships/submarine_3.png",
      bbKey: "submarine",
      spriteLayout: createSpriteLayout(3, {
        horizontal: { nudgeYCells: 0.43 },
        vertical: { nudgeXCells: 0.30, nudgeYCells: 0.00 }
      })
    },
    {
      key: "destroyer",
      label: "구축함",
      size: 2,
      asset: "assets/ships/destroyer_2.png",
      bbKey: "patrolboat",
      spriteLayout: createSpriteLayout(2.0, {
        horizontal: {
          footprint: { y: 0.64, h: 0.36 },
          nudgeYCells: 0.16
        },
        vertical: {
          footprint: { y: 0.14, h: 0.72 },
          nudgeXCells: 0.40,
          nudgeYCells: 0.00
        }
      })
    }
  ];

  const AI_DIFFICULTY_PRESETS = {
    1: {
      level: 1,
      randomness: 0.58,
      topPool: 7,
      openingScale: 0.85,
      hitWeightScale: 0.45,
      monteCarlo: null
    },
    2: {
      level: 2,
      randomness: 0.48,
      topPool: 6,
      openingScale: 0.9,
      hitWeightScale: 0.6,
      monteCarlo: null
    },
    3: {
      level: 3,
      randomness: 0.1,
      topPool: 3,
      openingScale: 1,
      hitWeightScale: 1,
      monteCarlo: null
    },
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
  const SHIP_TYPES_BY_KEY = SHIP_TYPES.reduce((acc, ship) => {
    acc[ship.key] = ship;
    return acc;
  }, {});

  function getShipType(type) {
    return SHIP_TYPES_BY_KEY[type] || null;
  }

  function getAiDifficultyPreset(level) {
    return AI_DIFFICULTY_PRESETS[Number(level)] || AI_DIFFICULTY_PRESETS[3];
  }

  return {
    BOARD_SIZE,
    SHIP_SPRITE_HEIGHT_CELLS,
    SHIP_SPRITE_PADDING_CELLS,
    PHASES,
    PLAYER_KEYS,
    RESULT_TYPES,
    SHIP_TYPES,
    SHIP_TYPES_BY_KEY,
    AI_DIFFICULTY_PRESETS,
    createSpriteLayout,
    getShipType,
    getAiDifficultyPreset
  };
});





































