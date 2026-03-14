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
    SHIP_TYPES,
    SHIP_TYPES_BY_KEY
  } = deps;

  function buildShipCells(row, col, orientation, size) {
    const cells = [];
    for (let index = 0; index < size; index += 1) {
      cells.push({
        row: row + (orientation === "vertical" ? index : 0),
        col: col + (orientation === "horizontal" ? index : 0)
      });
    }
    return cells;
  }

  function createPlacedShip(shipType, row, col, orientation, index = 1) {
    const spec = typeof shipType === "string" ? SHIP_TYPES_BY_KEY[shipType] : shipType;
    if (!spec) {
      throw new Error(`Unknown ship type: ${shipType}`);
    }
    return {
      id: `${spec.key}-${index}`,
      type: spec.key,
      bbKey: spec.bbKey,
      size: spec.size,
      row,
      col,
      orientation,
      cells: buildShipCells(row, col, orientation, spec.size),
      hits: Array(spec.size).fill(false),
      sunk: false
    };
  }

  function canPlaceShip(fleet, shipType, row, col, orientation, boardSize = BOARD_SIZE) {
    const spec = typeof shipType === "string" ? SHIP_TYPES_BY_KEY[shipType] : shipType;
    if (!spec) return false;
    const cells = buildShipCells(row, col, orientation, spec.size);
    const occupied = new Set();

    (fleet || []).forEach((ship) => {
      ship.cells.forEach((cell) => {
        occupied.add(`${cell.row}:${cell.col}`);
      });
    });

    return cells.every((cell) => {
      if (cell.row < 0 || cell.col < 0 || cell.row >= boardSize || cell.col >= boardSize) {
        return false;
      }
      return !occupied.has(`${cell.row}:${cell.col}`);
    });
  }

  function getNextShipType(fleet, shipTypes = SHIP_TYPES) {
    return shipTypes[(fleet || []).length] || null;
  }

  function hasCompleteFleet(fleet, shipTypes = SHIP_TYPES) {
    return Array.isArray(fleet) && fleet.length === shipTypes.length && validateFleet(fleet);
  }

  function createRandomFleet(options = {}) {
    const boardSize = Number(options.boardSize) || BOARD_SIZE;
    const shipTypes = Array.isArray(options.shipTypes) && options.shipTypes.length > 0 ? options.shipTypes : SHIP_TYPES;
    const rng = typeof options.rng === "function" ? options.rng : Math.random;
    const fleet = [];

    shipTypes.forEach((shipType, index) => {
      let placedShip = null;
      let attempts = 0;
      while (!placedShip && attempts < 500) {
        attempts += 1;
        const orientation = rng() < 0.5 ? "horizontal" : "vertical";
        const row = Math.floor(rng() * boardSize);
        const col = Math.floor(rng() * boardSize);
        if (!canPlaceShip(fleet, shipType, row, col, orientation, boardSize)) {
          continue;
        }
        placedShip = createPlacedShip(shipType, row, col, orientation, index + 1);
      }
      if (!placedShip) {
        throw new Error(`Unable to place ship ${shipType.key || shipType}`);
      }
      fleet.push(placedShip);
    });

    return fleet;
  }

  function validateFleet(fleet, boardSize = BOARD_SIZE) {
    const occupied = new Set();
    for (const ship of fleet || []) {
      const spec = SHIP_TYPES_BY_KEY[ship.type];
      if (!spec || spec.size !== ship.size) return false;
      if (!Array.isArray(ship.cells) || ship.cells.length !== ship.size) return false;
      for (const cell of ship.cells) {
        if (cell.row < 0 || cell.col < 0 || cell.row >= boardSize || cell.col >= boardSize) {
          return false;
        }
        const key = `${cell.row}:${cell.col}`;
        if (occupied.has(key)) return false;
        occupied.add(key);
      }
    }
    return true;
  }

  return {
    buildShipCells,
    createPlacedShip,
    canPlaceShip,
    getNextShipType,
    hasCompleteFleet,
    createRandomFleet,
    validateFleet
  };
});

