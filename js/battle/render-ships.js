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
    SHIP_SPRITE_HEIGHT_CELLS,
    SHIP_TYPES_BY_KEY
  } = deps;

  const DEBUG_SHIP_FOOTPRINTS = false;

  function pct(value) {
    return `${Number((((value / BOARD_SIZE) * 100)).toFixed(4))}%`;
  }

  function pctWithinBox(value) {
    return `${Number((value * 100).toFixed(4))}%`;
  }

  function resolveSpriteLayout(spec, orientation) {
    const spriteLayout = spec.spriteLayout || {};
    const orientationLayout = spriteLayout[orientation] || {};
    const footprint = orientationLayout.footprint || {};
    const parsedCanvasHeight = Number(spriteLayout.canvasHeightCells);

    return {
      canvasHeightCells: Number.isFinite(parsedCanvasHeight) && parsedCanvasHeight > 0
        ? parsedCanvasHeight
        : SHIP_SPRITE_HEIGHT_CELLS,
      footprint: {
        x: Number.isFinite(Number(footprint.x)) ? Number(footprint.x) : 0,
        y: Number.isFinite(Number(footprint.y)) ? Number(footprint.y) : 0,
        w: Number.isFinite(Number(footprint.w)) && Number(footprint.w) > 0 ? Number(footprint.w) : 1,
        h: Number.isFinite(Number(footprint.h)) && Number(footprint.h) > 0 ? Number(footprint.h) : 1
      },
      nudgeXCells: Number.isFinite(Number(orientationLayout.nudgeXCells)) ? Number(orientationLayout.nudgeXCells) : 0,
      nudgeYCells: Number.isFinite(Number(orientationLayout.nudgeYCells)) ? Number(orientationLayout.nudgeYCells) : 0
    };
  }

  function buildDebugFootprintStyle(footprint) {
    return {
      left: pctWithinBox(footprint.x),
      top: pctWithinBox(footprint.y),
      width: pctWithinBox(footprint.w),
      height: pctWithinBox(footprint.h)
    };
  }

  function buildHorizontalSpriteStyle(ship, spec) {
    const layout = resolveSpriteLayout(spec, "horizontal");
    const logicalLeft = ship.col;
    const logicalTop = ship.row;
    const logicalWidth = ship.size;
    const logicalHeight = 1;
    const wrapperWidthCells = logicalWidth / layout.footprint.w;
    const wrapperHeightCells = logicalHeight / layout.footprint.h;
    const wrapperLeftCells = logicalLeft - (layout.footprint.x * wrapperWidthCells) + layout.nudgeXCells;
    const wrapperTopCells = logicalTop - (layout.footprint.y * wrapperHeightCells) + layout.nudgeYCells;

    return {
      wrapperStyle: {
        left: pct(wrapperLeftCells),
        top: pct(wrapperTopCells),
        width: pct(wrapperWidthCells),
        height: pct(wrapperHeightCells)
      },
      imageStyle: {
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "fill"
      },
      debugFootprintStyle: DEBUG_SHIP_FOOTPRINTS ? buildDebugFootprintStyle(layout.footprint) : null
    };
  }

  function buildVerticalSpriteStyle(ship, spec) {
    const layout = resolveSpriteLayout(spec, "vertical");
    const logicalLeft = ship.col;
    const logicalTop = ship.row;
    const logicalWidth = 1;
    const logicalHeight = ship.size;
    const wrapperWidthCells = logicalWidth / layout.footprint.w;
    const wrapperHeightCells = logicalHeight / layout.footprint.h;
    const wrapperLeftCells = logicalLeft - (layout.footprint.x * wrapperWidthCells) + layout.nudgeXCells;
    const wrapperTopCells = logicalTop - (layout.footprint.y * wrapperHeightCells) + layout.nudgeYCells;
    const widthPercent = Number((((ship.size / layout.canvasHeightCells) * 100)).toFixed(4));
    const heightPercent = Number((((layout.canvasHeightCells / ship.size) * 100)).toFixed(4));

    return {
      wrapperStyle: {
        left: pct(wrapperLeftCells),
        top: pct(wrapperTopCells),
        width: pct(wrapperWidthCells),
        height: pct(wrapperHeightCells)
      },
      imageStyle: {
        left: "50%",
        top: "50%",
        width: `${widthPercent}%`,
        height: `${heightPercent}%`,
        transform: "translate(-50%, -50%) rotate(90deg)",
        transformOrigin: "center center",
        objectFit: "fill"
      },
      debugFootprintStyle: DEBUG_SHIP_FOOTPRINTS ? buildDebugFootprintStyle(layout.footprint) : null
    };
  }

  function buildShipSprites(fleet, options = {}) {
    if (!options.showShips) return [];

    // The footprint model treats each ship PNG as a canvas that contains a
    // smaller logical footprint. We solve for the wrapper box that makes that
    // footprint land exactly on the occupied cells, instead of guessing from the
    // whole art box. We also never clamp the wrapper: ship-layer lives outside
    // board-clip, so overhang beyond the board edge is expected and desired.
    return (fleet || []).map((ship) => {
      const spec = SHIP_TYPES_BY_KEY[ship.type] || ship;
      const layout = ship.orientation === "vertical"
        ? buildVerticalSpriteStyle(ship, spec)
        : buildHorizontalSpriteStyle(ship, spec);

      return {
        id: ship.id,
        asset: spec.asset,
        label: spec.label || ship.type,
        orientation: ship.orientation,
        wrapperStyle: layout.wrapperStyle,
        imageStyle: layout.imageStyle,
        debugFootprintStyle: layout.debugFootprintStyle
      };
    });
  }

  return {
    DEBUG_SHIP_FOOTPRINTS,
    buildShipSprites
  };
});
