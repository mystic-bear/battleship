(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../shared/i18n.js"),
      ...require("../shared/constants.js"),
      ...require("../shared/utils.js"),
      ...require("./battle/constants.js"),
      ...require("./battle/state.js"),
      ...require("./battle/placement.js"),
      ...require("./battle/rules.js"),
      ...require("./battle/hint-builder.js"),
      ...require("./battle/archive.js"),
      ...require("./persistence/save-manager.js")
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
    DEFAULT_LANGUAGE,
    isSupportedLanguage,
    translateUi,
    DEFAULT_SETUP,
    QUICK_PRESETS,
    SETUP_STATES,
    AI_LEVEL_INFO,
    isAiState,
    getAiLevelFromState,
    buildSetupSummary,
    deepCopy,
    formatDateTime,
    PLAYER_KEYS,
    PHASES,
    RESULT_TYPES,
    SHIP_TYPES,
    createInitialState,
    createBoardFromFleet,
    cloneBattleState,
    canPlaceShip,
    createRandomFleet,
    createPlacedShip,
    getNextShipType,
    hasCompleteFleet,
    applyAttack,
    getFleetStatus,
    getOpponentKey,
    listAvailableShots,
    buildAiState,
    buildHint,
    buildHintFromCandidates,
    summarizeArchiveEntry,
    SaveManager
  } = deps;

  const LANGUAGE_STORAGE_KEY = "animal-battleship-language";

  class Game {
    constructor(options = {}) {
      this.aiBridge = options.aiBridge || null;
      this.ui = options.ui || null;
      this.saveManager = options.saveManager || (typeof SaveManager === "function" ? new SaveManager() : null);
      this.language = this.loadLanguageSetting();
      this.setupPlayers = deepCopy(DEFAULT_SETUP);
      this.modeKey = "ai-3";
      this.stateVersion = 0;
      this.archiveOverlayOpen = false;
      this.resumeSnapshot = null;
      this.archiveGames = [];
      this.aiThinking = false;
      this.inputLocked = false;
      this.lastHint = null;
      this.hintRequestToken = 0;
      this.statusMessage = "";
      this.workerFallbackNotified = false;
      this.viewSeatKey = PLAYER_KEYS.PLAYER;
      this.turnHandoffPending = false;
      this.resetSession();
      this.refreshResumeSnapshot();
      this.refreshArchiveList();
    }

    loadLanguageSetting() {
      try {
        const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null;
        return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
      } catch (error) {
        return DEFAULT_LANGUAGE;
      }
    }

    saveLanguageSetting(language) {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        }
      } catch (error) {
        // Ignore storage failures.
      }
    }

    t(key, params = {}) {
      return translateUi(this.language, key, params);
    }

    setLanguage(language) {
      const nextLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
      if (nextLanguage === this.language) return;
      this.language = nextLanguage;
      this.saveLanguageSetting(nextLanguage);
      if (this.gameState && this.gameState.phase !== PHASES.GAME_OVER) {
        this.persistLatestGame();
        this.refreshResumeSnapshot();
      }
      this.refreshUi();
    }

    setUi(ui) {
      this.ui = ui;
    }

    setAIBridge(aiBridge) {
      this.aiBridge = aiBridge;
    }

    notifyUi(method, ...args) {
      if (this.ui && typeof this.ui[method] === "function") {
        return this.ui[method](...args);
      }
      return undefined;
    }

    refreshUi() {
      this.notifyUi("updateAll");
    }

    toast(message) {
      this.notifyUi("toast", message);
    }

    resetSession() {
      this.gameState = null;
      this.lastHint = null;
      this.hintRequestToken = (this.hintRequestToken || 0) + 1;
      this.statusMessage = "";
      this.aiThinking = false;
      this.inputLocked = false;
      this.workerFallbackNotified = false;
      this.viewSeatKey = PLAYER_KEYS.PLAYER;
      this.turnHandoffPending = false;
    }

    refreshResumeSnapshot() {
      this.resumeSnapshot = this.saveManager ? this.saveManager.loadLatest() : null;
      return this.resumeSnapshot;
    }

    refreshArchiveList() {
      this.archiveGames = this.saveManager ? this.saveManager.listFinishedGames(30) : [];
      return this.archiveGames;
    }

    getArchiveGames() {
      return this.archiveGames || [];
    }

    getArchiveSummaries() {
      return this.getArchiveGames().map((entry) => summarizeArchiveEntry(entry, this.language));
    }

    getResumeInfo() {
      const snapshot = this.resumeSnapshot || this.refreshResumeSnapshot();
      if (!snapshot) return null;
      const lastShot = snapshot.gameState?.lastAttack
        ? `${snapshot.gameState.lastAttack.coord} ${snapshot.gameState.lastAttack.result}`
        : "-";
      const winnerLabel = snapshot.gameState?.winner
        ? this.t(snapshot.gameState.winner === PLAYER_KEYS.PLAYER ? "winner.player" : "winner.enemy")
        : this.t(snapshot.gameState?.phase === PHASES.PLACEMENT ? "game.phase.placement" : "game.phase.battle");

      return {
        savedAtLabel: formatDateTime(snapshot.savedAt, this.language),
        setupSummary: buildSetupSummary(snapshot.setupPlayers || DEFAULT_SETUP, this.language),
        lastShotLabel: lastShot,
        resultLine: winnerLabel
      };
    }

    applyPreset(presetKey) {
      const preset = QUICK_PRESETS.find((entry) => entry.key === presetKey);
      if (!preset) return false;
      this.setupPlayers = deepCopy(preset.setup);
      this.modeKey = preset.key;
      this.startNewGame({ setupPlayers: preset.setup, modeKey: preset.key });
      return true;
    }

    cycleSetupState(seatKey) {
      if (seatKey !== "enemy") return;
      const current = this.setupPlayers.enemy || DEFAULT_SETUP.enemy;
      const index = SETUP_STATES.indexOf(current);
      const next = SETUP_STATES[(index + 1 + SETUP_STATES.length) % SETUP_STATES.length];
      this.setupPlayers.enemy = next;
      this.modeKey = isAiState(next) ? `custom-${String(next).toLowerCase()}` : "local-human";
      this.refreshUi();
    }

    canStartMatch() {
      return true;
    }

    hasAiConfigured() {
      return isAiState(this.setupPlayers.enemy);
    }

    isLocalHumanMatch() {
      return !isAiState(this.setupPlayers.enemy);
    }

    isPlacementPhase() {
      return !!this.gameState && this.gameState.phase === PHASES.PLACEMENT;
    }

    isAiTurn() {
      return !!this.gameState
        && this.gameState.phase === PHASES.BATTLE
        && this.gameState.turn === PLAYER_KEYS.ENEMY
        && isAiState(this.setupPlayers.enemy);
    }

    isHumanTurn() {
      return !!this.gameState
        && this.gameState.phase === PHASES.BATTLE
        && !this.isAiTurn();
    }

    getPerspectiveKey() {
      if (!this.gameState || this.isPlacementPhase()) {
        return PLAYER_KEYS.PLAYER;
      }
      if (this.isLocalHumanMatch()) {
        return this.viewSeatKey || this.gameState.turn || PLAYER_KEYS.PLAYER;
      }
      return PLAYER_KEYS.PLAYER;
    }

    getTargetKeyForPerspective() {
      return getOpponentKey(this.getPerspectiveKey());
    }

    getTurnLabel() {
      if (!this.gameState) return "";
      if (this.gameState.phase === PHASES.PLACEMENT) {
        return this.t("game.phase.placement");
      }
      if (this.gameState.phase === PHASES.GAME_OVER) {
        return this.t(this.gameState.winner === PLAYER_KEYS.PLAYER ? "winner.player" : "winner.enemy");
      }
      return this.gameState.turn === PLAYER_KEYS.PLAYER
        ? this.t("game.turn.player")
        : this.t("game.turn.enemy");
    }

    getActiveAiLabel() {
      const level = getAiLevelFromState(this.setupPlayers.enemy);
      return level ? (AI_LEVEL_INFO[level]?.label?.[this.language] || AI_LEVEL_INFO[level]?.short || this.setupPlayers.enemy) : this.setupPlayers.enemy;
    }

    startConfiguredGame() {
      this.startNewGame({ setupPlayers: this.setupPlayers, modeKey: this.modeKey });
    }

    startNewGame(options = {}) {
      const setup = deepCopy(options.setupPlayers || this.setupPlayers || DEFAULT_SETUP);
      const modeKey = options.modeKey || this.modeKey || (isAiState(setup.enemy) ? `custom-${String(setup.enemy).toLowerCase()}` : "local-human");
      this.resetSession();
      this.setupPlayers = setup;
      this.modeKey = modeKey;
      this.gameState = createInitialState({
        enemy: setup.enemy,
        modeKey,
        playerFleet: [],
        enemyFleet: this.isLocalHumanMatch() ? [] : undefined
      });
      this.viewSeatKey = PLAYER_KEYS.PLAYER;
      this.turnHandoffPending = false;
      this.statusMessage = this.buildPlacementMessage("status.placementStart", PLAYER_KEYS.PLAYER);
      this.stateVersion += 1;
      this.persistLatestGame();
      this.refreshResumeSnapshot();
      if (this.ui && typeof this.ui.showScreen === "function") {
        this.ui.showScreen("game-screen");
      }
      this.refreshUi();
      return this.gameState;
    }
    buildSaveSnapshot() {
      if (!this.gameState) return null;
      return {
        savedAt: new Date().toISOString(),
        language: this.language,
        modeKey: this.modeKey,
        setupPlayers: deepCopy(this.setupPlayers),
        gameState: cloneBattleState(this.gameState),
        lastHint: this.lastHint ? deepCopy(this.lastHint) : null,
        statusMessage: this.statusMessage || "",
        viewSeatKey: this.viewSeatKey || PLAYER_KEYS.PLAYER,
        turnHandoffPending: !!this.turnHandoffPending
      };
    }

    persistLatestGame() {
      if (!this.saveManager || !this.gameState || this.gameState.phase === PHASES.GAME_OVER) {
        return null;
      }
      const saved = this.saveManager.saveLatest(this.buildSaveSnapshot());
      this.resumeSnapshot = saved;
      return saved;
    }

    restoreSavedGame(snapshot, source = "resume") {
      if (!snapshot?.gameState) return false;
      this.setupPlayers = deepCopy(snapshot.setupPlayers || DEFAULT_SETUP);
      this.modeKey = snapshot.modeKey || "resume";
      this.gameState = cloneBattleState(snapshot.gameState);
      if (!this.gameState.placement) {
        this.gameState.placement = { orientation: "horizontal", activeSeat: PLAYER_KEYS.PLAYER };
      }
      if (!this.gameState.placement.activeSeat) {
        const playerReady = hasCompleteFleet(this.gameState.players?.player?.fleet || []);
        const enemyReady = !this.isLocalHumanMatch() || hasCompleteFleet(this.gameState.players?.enemy?.fleet || []);
        this.gameState.placement.activeSeat = !playerReady
          ? PLAYER_KEYS.PLAYER
          : (this.isLocalHumanMatch() && !enemyReady ? PLAYER_KEYS.ENEMY : PLAYER_KEYS.PLAYER);
      }
      this.lastHint = snapshot.lastHint ? deepCopy(snapshot.lastHint) : null;
      this.statusMessage = snapshot.statusMessage || this.t(source === "archive" ? "status.archiveLoaded" : "status.resumeLoaded");
      this.aiThinking = false;
      this.inputLocked = false;
      this.workerFallbackNotified = false;
      this.viewSeatKey = snapshot.viewSeatKey || (this.isLocalHumanMatch() ? (this.gameState.turn || this.getPlacementSeatKey()) : PLAYER_KEYS.PLAYER);
      this.turnHandoffPending = !!snapshot.turnHandoffPending;
      this.stateVersion += 1;
      if (this.ui && typeof this.ui.showScreen === "function") {
        this.ui.showScreen("game-screen");
      }
      this.refreshUi();
      if (this.isAiTurn()) {
        this.queueAiTurn();
      }
      return true;
    }
    resumeSavedGame() {
      const snapshot = this.refreshResumeSnapshot();
      if (!snapshot) {
        this.toast(this.t("resume.none"));
        return false;
      }
      return this.restoreSavedGame(snapshot, "resume");
    }

    returnToMenu() {
      this.aiThinking = false;
      this.inputLocked = false;
      this.archiveOverlayOpen = false;
      this.refreshResumeSnapshot();
      this.refreshArchiveList();
      if (this.ui && typeof this.ui.showScreen === "function") {
        this.ui.showScreen("start-screen");
      }
      this.refreshUi();
    }

    restartCurrentGame() {
      this.startNewGame({ setupPlayers: this.setupPlayers, modeKey: this.modeKey });
    }

    getPlacementSeatKey() {
      const seatKey = this.gameState?.placement?.activeSeat;
      return seatKey === PLAYER_KEYS.ENEMY ? PLAYER_KEYS.ENEMY : PLAYER_KEYS.PLAYER;
    }

    getPlacementSeatLabel(seatKey = this.getPlacementSeatKey()) {
      return this.t(seatKey === PLAYER_KEYS.ENEMY ? "placement.seat.enemy" : "placement.seat.player");
    }

    getPlacementFleet(seatKey = this.getPlacementSeatKey()) {
      return this.gameState?.players?.[seatKey]?.fleet || [];
    }

    getPlacementParticipant(seatKey = this.getPlacementSeatKey()) {
      return this.gameState?.players?.[seatKey] || null;
    }

    buildPlacementMessage(key, seatKey = this.getPlacementSeatKey(), params = {}) {
      return this.t(key, {
        seat: this.getPlacementSeatLabel(seatKey),
        ...params
      });
    }

    getTurnHandoffMessage() {
      if (!this.turnHandoffPending || !this.gameState) return "";
      if (this.isPlacementPhase()) {
        return this.t("handoff.placementText", { seat: this.getPlacementSeatLabel(this.getPlacementSeatKey()) });
      }
      if (this.isLocalHumanMatch()) {
        return this.t("handoff.battleText", { seat: this.getPlacementSeatLabel(this.gameState.turn || PLAYER_KEYS.PLAYER) });
      }
      return this.t("handoff.text");
    }

    getPlacementOrientation() {
      return this.gameState?.placement?.orientation || "horizontal";
    }

    getNextPlacementShip() {
      return getNextShipType(this.getPlacementFleet());
    }

    isPlacementComplete(seatKey = this.getPlacementSeatKey()) {
      return hasCompleteFleet(this.getPlacementFleet(seatKey));
    }

    syncPlacementState(statusMessage = null) {
      if (!this.gameState) return;
      const seatKey = this.getPlacementSeatKey();
      this.gameState.players[seatKey].board = createBoardFromFleet(this.getPlacementFleet(seatKey));
      this.gameState.updatedAt = new Date().toISOString();
      this.lastHint = null;
      this.hintRequestToken += 1;
      if (statusMessage) {
        this.statusMessage = statusMessage;
      }
      this.stateVersion += 1;
      this.persistLatestGame();
      this.refreshResumeSnapshot();
      this.refreshUi();
    }

    togglePlacementOrientation() {
      if (!this.isPlacementPhase()) return false;
      this.gameState.placement.orientation = this.getPlacementOrientation() === "horizontal" ? "vertical" : "horizontal";
      this.syncPlacementState();
      return true;
    }

    clearPlacement() {
      if (!this.isPlacementPhase()) return false;
      const seatKey = this.getPlacementSeatKey();
      this.gameState.players[seatKey].fleet = [];
      this.syncPlacementState(this.buildPlacementMessage("status.placementStart", seatKey));
      return true;
    }

    randomizePlacement() {
      if (!this.isPlacementPhase()) return false;
      const seatKey = this.getPlacementSeatKey();
      this.gameState.players[seatKey].fleet = createRandomFleet();
      this.syncPlacementState(this.buildPlacementMessage("status.placementComplete", seatKey));
      return true;
    }

    placePlayerShipAt(row, col) {
      if (!this.isPlacementPhase()) return false;
      const seatKey = this.getPlacementSeatKey();
      const nextShip = this.getNextPlacementShip();
      if (!nextShip) {
        this.statusMessage = this.buildPlacementMessage("status.placementComplete", seatKey);
        this.refreshUi();
        return false;
      }
      const orientation = this.getPlacementOrientation();
      const fleet = this.getPlacementFleet(seatKey);
      if (!canPlaceShip(fleet, nextShip, row, col, orientation)) {
        this.toast(this.t("toast.placementInvalid"));
        return false;
      }
      fleet.push(createPlacedShip(nextShip, row, col, orientation, fleet.length + 1));
      const followingShip = getNextShipType(fleet);
      this.syncPlacementState(
        followingShip
          ? this.buildPlacementMessage("status.placementNext", seatKey, { ship: followingShip.label })
          : this.buildPlacementMessage("status.placementComplete", seatKey)
      );
      return true;
    }

    confirmPlacement() {
      if (!this.isPlacementPhase()) return false;
      const seatKey = this.getPlacementSeatKey();
      if (!this.isPlacementComplete(seatKey)) {
        this.toast(this.t("toast.placementIncomplete"));
        return false;
      }

      const nextPlacementSeat = this.isLocalHumanMatch() && seatKey === PLAYER_KEYS.PLAYER && !this.isPlacementComplete(PLAYER_KEYS.ENEMY)
        ? PLAYER_KEYS.ENEMY
        : null;

      if (nextPlacementSeat) {
        this.gameState.placement.activeSeat = nextPlacementSeat;
        this.gameState.placement.orientation = "horizontal";
        this.viewSeatKey = seatKey;
        this.turnHandoffPending = true;
        this.gameState.updatedAt = new Date().toISOString();
        this.statusMessage = this.buildPlacementMessage("status.placementStart", nextPlacementSeat);
        this.stateVersion += 1;
        this.persistLatestGame();
        this.refreshResumeSnapshot();
        this.refreshUi();
        return true;
      }

      this.gameState.phase = PHASES.BATTLE;
      this.gameState.turn = PLAYER_KEYS.PLAYER;
      this.gameState.placement.activeSeat = PLAYER_KEYS.PLAYER;
      this.gameState.placement.orientation = "horizontal";
      this.gameState.updatedAt = new Date().toISOString();

      if (this.isLocalHumanMatch()) {
        this.viewSeatKey = seatKey;
        this.turnHandoffPending = true;
        this.statusMessage = this.t("status.battleReady", { seat: this.getPlacementSeatLabel(PLAYER_KEYS.PLAYER) });
      } else {
        this.viewSeatKey = PLAYER_KEYS.PLAYER;
        this.turnHandoffPending = false;
        this.statusMessage = this.t("status.ready");
      }

      this.stateVersion += 1;
      this.persistLatestGame();
      this.refreshResumeSnapshot();
      this.refreshUi();
      return true;
    }
    applyAttackAt(row, col) {
      if (!this.gameState) {
        this.toast(this.t("toast.noGame"));
        return false;
      }
      if (this.gameState.phase === PHASES.PLACEMENT) {
        this.toast(this.t("toast.turnLocked"));
        return false;
      }
      if (this.gameState.phase === PHASES.GAME_OVER) {
        this.toast(this.t("toast.gameOver"));
        return false;
      }
      if (this.turnHandoffPending || !this.isHumanTurn() || this.inputLocked || this.aiThinking) {
        this.toast(this.t("toast.turnLocked"));
        return false;
      }

      const attackerKey = this.gameState.turn;
      const outcome = applyAttack(this.gameState, attackerKey, row, col);
      if (!outcome.ok) {
        this.statusMessage = outcome.code === "already-attacked" ? this.t("status.repeat") : String(outcome.reason || "Invalid move");
        this.refreshUi();
        return false;
      }

      this.afterAttack(outcome);
      if (this.isAiTurn()) {
        this.queueAiTurn();
      }
      return true;
    }

    afterAttack(outcome) {
      const entry = outcome.entry;
      if (!entry) return;
      this.lastHint = null;
      this.hintRequestToken += 1;

      if (entry.result === RESULT_TYPES.HIT) {
        this.statusMessage = `${entry.coord} ${this.t("status.hit")}`;
      } else if (entry.result === RESULT_TYPES.SUNK) {
        this.statusMessage = `${entry.coord} ${this.t("status.sunk")}`;
      } else {
        this.statusMessage = `${entry.coord} ${this.t("status.miss")}`;
      }

      if (outcome.gameOver) {
        this.turnHandoffPending = false;
        this.viewSeatKey = this.isLocalHumanMatch() ? entry.attacker : PLAYER_KEYS.PLAYER;
        this.statusMessage = this.t(this.gameState.winner === PLAYER_KEYS.PLAYER ? "winner.player" : "winner.enemy");
        this.finishGame();
      } else {
        if (this.isLocalHumanMatch()) {
          this.turnHandoffPending = true;
          this.viewSeatKey = entry.attacker;
        } else {
          this.turnHandoffPending = false;
          this.viewSeatKey = PLAYER_KEYS.PLAYER;
        }
        this.persistLatestGame();
        this.refreshResumeSnapshot();
      }

      this.stateVersion += 1;
      this.refreshUi();
    }

    finishGame() {
      if (!this.saveManager || !this.gameState) return;
      const record = {
        id: this.gameState.id,
        savedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        language: this.language,
        modeKey: this.modeKey,
        setupPlayers: deepCopy(this.setupPlayers),
        winner: this.gameState.winner,
        statusMessage: this.statusMessage,
        gameState: cloneBattleState(this.gameState)
      };
      this.saveManager.saveFinishedGame(record);
      this.saveManager.clearLatest();
      this.refreshResumeSnapshot();
      this.refreshArchiveList();
    }

    async requestAiMove() {
      const aiLevel = getAiLevelFromState(this.setupPlayers.enemy) || 1;
      if (this.aiBridge && this.aiBridge.battleshipReady) {
        try {
          const result = await this.aiBridge.chooseMove(buildAiState(this.gameState, PLAYER_KEYS.ENEMY), aiLevel, this.stateVersion);
          if (result?.move && Number.isInteger(result.move.row) && Number.isInteger(result.move.col)) {
            return result.move;
          }
        } catch (error) {
          console.warn("AI bridge move failed. Falling back to local heuristic.", error);
        }
      }

      if (!this.workerFallbackNotified) {
        this.workerFallbackNotified = true;
        this.toast(this.t("toast.workerFallback"));
      }

      const hint = buildHint(this.gameState, 3, PLAYER_KEYS.ENEMY, this.language);
      if (hint?.recommended) {
        return { row: hint.recommended.row, col: hint.recommended.col };
      }

      const candidates = listAvailableShots(this.gameState, PLAYER_KEYS.ENEMY);
      return candidates[0] || null;
    }

    queueAiTurn() {
      if (!this.isAiTurn()) return;
      this.aiThinking = true;
      this.inputLocked = true;
      this.statusMessage = this.t("status.waitAi");
      this.refreshUi();

      Promise.resolve()
        .then(() => this.requestAiMove())
        .then((move) => {
          if (!move || !this.isAiTurn()) return;
          const outcome = applyAttack(this.gameState, PLAYER_KEYS.ENEMY, move.row, move.col);
          if (outcome.ok) {
            this.afterAttack(outcome);
          }
        })
        .catch((error) => {
          console.error("AI move failed:", error);
        })
        .finally(() => {
          this.aiThinking = false;
          this.inputLocked = false;
          if (this.gameState && this.gameState.phase === PHASES.BATTLE) {
            this.persistLatestGame();
            this.refreshResumeSnapshot();
          }
          this.refreshUi();
        });
    }

    async requestHint(stage = null) {
      if (!this.gameState) {
        this.toast(this.t("toast.noGame"));
        return null;
      }
      if (this.turnHandoffPending || !this.isHumanTurn()) {
        this.toast(this.t("toast.turnLocked"));
        return null;
      }

      const nextStage = stage == null
        ? ((Number(this.lastHint?.stage) || 0) % 3) + 1
        : Math.max(1, Math.min(3, Number(stage) || 1));
      const requestToken = this.hintRequestToken + 1;
      this.hintRequestToken = requestToken;
      const attackerKey = this.gameState.turn;
      const stateVersion = this.stateVersion;
      const aiLevel = getAiLevelFromState(this.setupPlayers.enemy) || 3;

      this.lastHint = {
        stage: nextStage,
        availableStage: 3,
        recommended: null,
        candidates: [],
        summary: this.t("hint.loading"),
        pending: true,
        source: "worker",
        searchPhase: null,
        monteCarlo: null,
        meta: null
      };
      this.refreshUi();

      if (this.aiBridge && this.aiBridge.battleshipReady) {
        try {
          const result = await this.aiBridge.getHint(
            buildAiState(this.gameState, attackerKey),
            aiLevel,
            stateVersion,
            { hintStage: nextStage }
          );
          const workerCandidates = Array.isArray(result?.hint?.candidates) && result.hint.candidates.length > 0
            ? result.hint.candidates
            : (result?.hint?.recommended ? [result.hint.recommended] : []);

          if (requestToken === this.hintRequestToken && stateVersion === this.stateVersion && this.gameState && this.isHumanTurn() && !this.turnHandoffPending) {
            this.lastHint = buildHintFromCandidates(workerCandidates, nextStage, this.language, {
              zone: result?.hint?.zone || null,
              source: "worker",
              searchPhase: result?.hint?.searchPhase || result?.searchPhase || null,
              monteCarlo: result?.hint?.monteCarlo || result?.meta?.monteCarlo || null,
              searchMeta: result?.hint?.meta || result?.meta || null
            });
            this.persistLatestGame();
            this.refreshUi();
            return this.lastHint;
          }
          return this.lastHint;
        } catch (error) {
          console.warn("Hint request failed. Falling back to local scorer.", error);
        }
      }

      if (requestToken !== this.hintRequestToken || stateVersion !== this.stateVersion || !this.gameState || !this.isHumanTurn() || this.turnHandoffPending) {
        return this.lastHint;
      }

      this.lastHint = buildHint(this.gameState, nextStage, attackerKey, this.language);
      this.persistLatestGame();
      this.refreshUi();
      return this.lastHint;
    }

    acknowledgeTurnHandoff() {
      if (!this.turnHandoffPending || !this.gameState) return false;
      this.turnHandoffPending = false;
      this.viewSeatKey = this.isPlacementPhase()
        ? this.getPlacementSeatKey()
        : (this.gameState.turn || PLAYER_KEYS.PLAYER);
      this.persistLatestGame();
      this.refreshResumeSnapshot();
      this.refreshUi();
      return true;
    }

    getPlacementPanelData() {
      const seatKey = this.getPlacementSeatKey();
      const fleet = this.getPlacementFleet(seatKey);
      const nextShip = this.getNextPlacementShip();
      return {
        seatKey,
        seatLabel: this.getPlacementSeatLabel(seatKey),
        ready: this.isPlacementComplete(seatKey),
        currentShip: nextShip,
        orientation: this.getPlacementOrientation(),
        ships: SHIP_TYPES.map((shipType) => ({
          key: shipType.key,
          label: shipType.label,
          size: shipType.size,
          placed: fleet.some((ship) => ship.type === shipType.key),
          current: nextShip?.key === shipType.key
        }))
      };
    }
    getFleetPanelData() {
      if (!this.gameState) {
        return {
          own: [],
          target: []
        };
      }
      const perspective = this.getPerspectiveKey();
      const targetKey = getOpponentKey(perspective);
      return {
        own: getFleetStatus(this.gameState.players[perspective]),
        target: getFleetStatus(this.gameState.players[targetKey])
      };
    }

    getShotLog() {
      return Array.isArray(this.gameState?.shotLog) ? [...this.gameState.shotLog].reverse() : [];
    }

    getLastShotLabel(entry) {
      if (!entry) return "-";
      const attackerLabel = entry.attacker === PLAYER_KEYS.PLAYER ? this.t("shot.byPlayer") : this.t("shot.byEnemy");
      return `${attackerLabel} · ${entry.coord} · ${entry.result}`;
    }

    openArchive() {
      this.refreshArchiveList();
      this.archiveOverlayOpen = true;
      this.refreshUi();
    }

    closeArchive() {
      this.archiveOverlayOpen = false;
      this.refreshUi();
    }

    loadArchivedGame(id) {
      const record = this.saveManager ? this.saveManager.loadFinishedGame(id) : null;
      if (!record) return false;
      this.archiveOverlayOpen = false;
      return this.restoreSavedGame(record, "archive");
    }

    deleteArchivedGame(id) {
      if (!this.saveManager) return false;
      const deleted = this.saveManager.deleteFinishedGame(id);
      if (deleted) {
        this.refreshArchiveList();
        this.toast(this.t("toast.deleted"));
        this.refreshUi();
      }
      return deleted;
    }

    getOwnBoardTitle() {
      return this.isPlacementPhase()
        ? this.t("placement.boardTitle", { seat: this.getPlacementSeatLabel() })
        : this.t("board.own");
    }
    getTargetBoardTitle() {
      return this.isPlacementPhase() ? this.t("board.targetLocked") : this.t("board.target");
    }

    getStatusLine() {
      if (this.statusMessage) return this.statusMessage;
      if (!this.gameState) return buildSetupSummary(this.setupPlayers, this.language);
      if (this.isPlacementPhase()) {
        const seatKey = this.getPlacementSeatKey();
        return this.isPlacementComplete(seatKey)
          ? this.buildPlacementMessage("status.placementComplete", seatKey)
          : this.buildPlacementMessage("status.placementNext", seatKey, { ship: this.getNextPlacementShip()?.label || "" });
      }
      return this.getTurnLabel();
    }
    getSetupSummary() {
      return buildSetupSummary(this.setupPlayers, this.language);
    }
  }

  return {
    Game
  };
});







