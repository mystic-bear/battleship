(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../../shared/utils.js"),
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
    createId,
    formatCoordinate,
    BOARD_SIZE,
    PLAYER_KEYS,
    PHASES,
    RESULT_TYPES,
    SHIP_TYPES_BY_KEY
  } = deps;

  function isInsideBoard(row, col, boardSize = BOARD_SIZE) {
    return row >= 0 && col >= 0 && row < boardSize && col < boardSize;
  }

  function getOpponentKey(playerKey) {
    return playerKey === PLAYER_KEYS.PLAYER ? PLAYER_KEYS.ENEMY : PLAYER_KEYS.PLAYER;
  }

  function getCell(board, row, col) {
    if (!isInsideBoard(row, col)) return null;
    return board[row][col];
  }

  function getShipById(participant, shipId) {
    return participant?.fleet?.find((ship) => ship.id === shipId) || null;
  }

  function areAllShipsSunk(participant) {
    return !!participant && participant.fleet.every((ship) => ship.sunk);
  }

  function getUnresolvedHitCells(participant) {
    const hits = [];
    participant.board.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell.attacked && cell.result === RESULT_TYPES.HIT) {
          hits.push({ row: rowIndex, col: colIndex });
        }
      });
    });
    return hits;
  }

  function syncShipState(participant, ship) {
    if (!ship) return;
    ship.sunk = ship.hits.every(Boolean);
    if (!ship.sunk) return;
    ship.cells.forEach((cell) => {
      const boardCell = getCell(participant.board, cell.row, cell.col);
      if (boardCell && boardCell.attacked) {
        boardCell.result = RESULT_TYPES.SUNK;
      }
    });
  }

  function applyAttack(state, attackerKey, row, col) {
    if (!state || state.phase !== PHASES.BATTLE) {
      return { ok: false, code: "game-inactive", reason: "Game is not in battle phase" };
    }
    if (state.turn !== attackerKey) {
      return { ok: false, code: "wrong-turn", reason: "It is not this side's turn" };
    }
    const targetKey = getOpponentKey(attackerKey);
    const attacker = state.players[attackerKey];
    const target = state.players[targetKey];
    const cell = getCell(target.board, row, col);

    if (!cell) {
      return { ok: false, code: "out-of-bounds", reason: "Target is outside the board" };
    }
    if (cell.attacked) {
      return { ok: false, code: "already-attacked", reason: "Target cell was already attacked" };
    }

    attacker.stats.shotsFired += 1;
    cell.attacked = true;

    let result = RESULT_TYPES.MISS;
    let ship = null;
    let sunkShip = false;

    if (cell.shipId) {
      ship = getShipById(target, cell.shipId);
      const hitIndex = ship.cells.findIndex((entry) => entry.row === row && entry.col === col);
      if (hitIndex >= 0) {
        ship.hits[hitIndex] = true;
      }
      target.stats.hitsTaken += 1;
      syncShipState(target, ship);
      sunkShip = !!ship.sunk;
      result = sunkShip ? RESULT_TYPES.SUNK : RESULT_TYPES.HIT;
      cell.result = result;
    } else {
      target.stats.missesTaken += 1;
      cell.result = RESULT_TYPES.MISS;
    }

    const entry = {
      id: createId("shot"),
      turnNumber: state.turnCount + 1,
      attacker: attackerKey,
      target: targetKey,
      row,
      col,
      coord: formatCoordinate(row, col),
      result,
      shipType: ship ? ship.type : null,
      sunk: sunkShip,
      timestamp: new Date().toISOString(),
      gameOver: false
    };

    state.lastAttack = entry;
    state.shotLog.push(entry);
    state.turnCount += 1;
    state.updatedAt = entry.timestamp;

    if (ship && ship.sunk && areAllShipsSunk(target)) {
      state.phase = PHASES.GAME_OVER;
      state.winner = attackerKey;
      state.turn = null;
      entry.gameOver = true;
    } else {
      state.turn = targetKey;
    }

    return {
      ok: true,
      entry,
      result,
      ship,
      gameOver: entry.gameOver
    };
  }

  function getFleetStatus(participant) {
    return participant.fleet.map((ship) => {
      const spec = SHIP_TYPES_BY_KEY[ship.type] || ship;
      const hits = ship.hits.filter(Boolean).length;
      return {
        key: ship.type,
        label: spec.label || ship.type,
        size: ship.size,
        hits,
        remaining: ship.size - hits,
        sunk: ship.sunk
      };
    });
  }

  function listAvailableShots(state, attackerKey) {
    const target = state.players[getOpponentKey(attackerKey)];
    const moves = [];
    target.board.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell.attacked) {
          moves.push({ row: rowIndex, col: colIndex, coord: formatCoordinate(rowIndex, colIndex) });
        }
      });
    });
    return moves;
  }

  function getVisibleBoard(participant, showShips = false) {
    return participant.board.map((row) => row.map((cell) => ({
      shipId: showShips ? cell.shipId : null,
      attacked: cell.attacked,
      result: cell.result
    })));
  }

  function buildAiState(state, attackerKey) {
    const target = state.players[getOpponentKey(attackerKey)];
    return {
      boardSize: BOARD_SIZE,
      attacker: attackerKey,
      remainingShips: target.fleet.filter((ship) => !ship.sunk).map((ship) => ship.size),
      shots: target.board.flatMap((row, rowIndex) => row.flatMap((cell, colIndex) => {
        if (!cell.attacked) return [];
        return [{ row: rowIndex, col: colIndex, result: cell.result }];
      })),
      unresolvedHits: getUnresolvedHitCells(target)
    };
  }

  return {
    isInsideBoard,
    getOpponentKey,
    getCell,
    getShipById,
    areAllShipsSunk,
    getUnresolvedHitCells,
    applyAttack,
    getFleetStatus,
    listAvailableShots,
    getVisibleBoard,
    buildAiState
  };
});
