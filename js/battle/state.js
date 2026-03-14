(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../../shared/utils.js"),
      ...require("./constants.js"),
      ...require("./placement.js")
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
    deepCopy,
    createId,
    BOARD_SIZE,
    PLAYER_KEYS,
    PHASES,
    createRandomFleet,
    hasCompleteFleet
  } = deps;

  function createCell(shipId = null) {
    return {
      shipId,
      attacked: false,
      result: null
    };
  }

  function createBoard(boardSize = BOARD_SIZE) {
    return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => createCell()));
  }

  function createBoardFromFleet(fleet, boardSize = BOARD_SIZE) {
    const board = createBoard(boardSize);
    (fleet || []).forEach((ship) => {
      ship.cells.forEach((cell) => {
        board[cell.row][cell.col].shipId = ship.id;
      });
    });
    return board;
  }

  function createParticipant(key, fleet, boardSize = BOARD_SIZE) {
    const normalizedFleet = deepCopy(fleet || []);
    return {
      key,
      fleet: normalizedFleet,
      board: createBoardFromFleet(normalizedFleet, boardSize),
      stats: {
        shotsFired: 0,
        hitsTaken: 0,
        missesTaken: 0
      }
    };
  }

  function createInitialState(options = {}) {
    const requestedPlayerFleet = Array.isArray(options.playerFleet) ? deepCopy(options.playerFleet) : [];
    const playerFleet = requestedPlayerFleet;
    const localHumanMatch = options.enemy === "HUMAN";
    const enemyFleet = Array.isArray(options.enemyFleet)
      ? deepCopy(options.enemyFleet)
      : (localHumanMatch ? [] : createRandomFleet());
    const timestamp = new Date().toISOString();
    const playerReady = hasCompleteFleet(playerFleet);
    const enemyReady = !localHumanMatch || hasCompleteFleet(enemyFleet);
    const phase = options.phase || (playerReady && enemyReady ? PHASES.BATTLE : PHASES.PLACEMENT);
    const activeSeat = options.placementSeatKey
      || (!playerReady ? PLAYER_KEYS.PLAYER : (localHumanMatch && !enemyReady ? PLAYER_KEYS.ENEMY : PLAYER_KEYS.PLAYER));

    return {
      id: options.id || createId("battle"),
      phase,
      turn: phase === PHASES.BATTLE ? PLAYER_KEYS.PLAYER : PLAYER_KEYS.PLAYER,
      winner: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        modeKey: options.modeKey || "local-human",
        enemy: options.enemy || "HUMAN"
      },
      placement: {
        orientation: options.placementOrientation || "horizontal",
        activeSeat
      },
      players: {
        player: createParticipant(PLAYER_KEYS.PLAYER, playerFleet),
        enemy: createParticipant(PLAYER_KEYS.ENEMY, enemyFleet)
      },
      shotLog: [],
      lastAttack: null,
      turnCount: 0
    };
  }

  function cloneBattleState(state) {
    return deepCopy(state);
  }

  return {
    createCell,
    createBoard,
    createBoardFromFleet,
    createParticipant,
    createInitialState,
    cloneBattleState
  };
});
