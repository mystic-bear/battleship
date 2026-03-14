const ui = {
  toastTimer: null,

  t(key, params = {}) {
    const language = window.game?.language || DEFAULT_LANGUAGE;
    return translateUi(language, key, params);
  },

  showScreen(id) {
    document.querySelectorAll(".screen").forEach((screen) => screen.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
  },

  showSetup() {
    document.getElementById("menu-main")?.classList.add("hidden");
    document.getElementById("menu-setup")?.classList.remove("hidden");
    this.renderSetup();
  },

  hideSetup() {
    document.getElementById("menu-setup")?.classList.add("hidden");
    document.getElementById("menu-main")?.classList.remove("hidden");
    this.renderStart();
  },

  applyStaticText() {
    const language = window.game?.language || DEFAULT_LANGUAGE;
    document.documentElement.lang = language;
    document.title = this.t("document.title");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = this.t(node.dataset.i18n);
    });
  },

  applyStyle(node, styleMap = {}) {
    Object.entries(styleMap).forEach(([key, value]) => {
      node.style[key] = value;
    });
  },

  getShipLabel(shipTypeKey) {
    return getShipType(shipTypeKey)?.label || shipTypeKey || "";
  },

  getShotResultLabel(result) {
    if (!result) return "";
    return this.t(`status.${result}`);
  },

  getHintSourceLabel(hint) {
    if (!hint) return "";
    return hint.source === "local"
      ? this.t("hint.sourceFallback")
      : this.t("hint.sourceWorker");
  },

  getHintSearchLabel(hint) {
    if (!hint?.searchPhase) return "";
    return this.t(`hint.search.${hint.searchPhase}`);
  },

  renderLanguageSelector() {
    const container = document.getElementById("language-switcher");
    if (!container || !window.game) return;
    container.innerHTML = "";
    LANGUAGE_OPTIONS.forEach((entry) => {
      const button = document.createElement("button");
      button.className = `language-btn ${game.language === entry.key ? "active" : ""}`;
      button.textContent = entry.nativeLabel;
      button.onclick = () => game.setLanguage(entry.key);
      container.appendChild(button);
    });
  },

  renderStart() {
    const presetList = document.getElementById("quick-start-list");
    const summary = document.getElementById("setup-summary");
    const resumeCard = document.getElementById("resume-card");
    if (!presetList || !summary || !window.game) return;

    presetList.innerHTML = "";
    QUICK_PRESETS.forEach((preset) => {
      const button = document.createElement("button");
      button.className = `preset-card ${preset.enabled ? "enabled" : "disabled"}`;
      button.disabled = !preset.enabled;
      button.innerHTML = `
        <div class="preset-top">
          <div class="preset-title">${resolveLocalizedText(preset.label, game.language)}</div>
          <div class="preset-chip">${resolveLocalizedText(preset.subtitle, game.language)}</div>
        </div>
        <div class="preset-detail">${resolveLocalizedText(preset.detail, game.language)}</div>
      `;
      if (preset.enabled) {
        button.onclick = () => game.applyPreset(preset.key);
      }
      presetList.appendChild(button);
    });

    summary.innerHTML = `
      <div class="setup-summary-title">${this.t("start.currentSetup")}</div>
      <div class="setup-summary-body">${game.getSetupSummary()}</div>
    `;

    if (!resumeCard) return;
    const resumeInfo = game.getResumeInfo();
    if (!resumeInfo) {
      resumeCard.classList.add("hidden");
      resumeCard.innerHTML = "";
      return;
    }

    resumeCard.classList.remove("hidden");
    resumeCard.innerHTML = `
      <div class="resume-meta">
        <div class="resume-title">${this.t("resume.title")}</div>
        <div class="resume-line">${this.t("resume.savedAt", { time: resumeInfo.savedAtLabel })}</div>
        <div class="resume-line">${resumeInfo.setupSummary}</div>
        <div class="resume-line">${this.t("resume.lastShot", { shot: resumeInfo.lastShotLabel })}</div>
        <div class="resume-line">${resumeInfo.resultLine}</div>
      </div>
      <button class="action-btn primary">${this.t("buttons.resume")}</button>
    `;
    resumeCard.querySelector("button").onclick = () => game.resumeSavedGame();
  },

  renderSetup() {
    const playerList = document.getElementById("setup-player-list");
    const optionList = document.getElementById("setup-option-list");
    if (!playerList || !optionList || !window.game) return;

    const enemyState = game.setupPlayers.enemy;
    playerList.innerHTML = `
      <div class="setup-row">
        <div class="setup-main">
          <div class="setup-icon enemy">AI</div>
          <div>
            <div class="setup-title">${this.t("setup.enemyTitle")}</div>
            <div class="setup-desc">${this.t("setup.enemyDesc")}</div>
          </div>
        </div>
        <button class="state-btn ${isAiState(enemyState) ? "ai" : "human"}">${getSetupStateLabel(enemyState, game.language)}</button>
      </div>
    `;
    playerList.querySelector("button").onclick = () => game.cycleSetupState("enemy");

    optionList.innerHTML = `
      <div class="setup-row info-row">
        <div class="setup-main">
          <div class="setup-icon option">10</div>
          <div>
            <div class="setup-title">10 x 10</div>
            <div class="setup-desc">${this.t("placement.instruction")}</div>
          </div>
        </div>
      </div>
    `;
  },

  renderGameHeader() {
    const turnChip = document.getElementById("turn-chip");
    const statusLine = document.getElementById("status-line");
    const subtitle = document.getElementById("game-subtitle");
    if (!turnChip || !statusLine || !subtitle || !window.game) return;

    if (!game.gameState) {
      turnChip.textContent = "";
      statusLine.textContent = game.getSetupSummary();
      subtitle.textContent = this.t("game.phase.placement");
      return;
    }

    turnChip.textContent = game.getTurnLabel();
    turnChip.className = `turn-chip ${game.gameState.turn === PLAYER_KEYS.ENEMY ? "enemy" : "player"}`;
    statusLine.textContent = game.getStatusLine();
    subtitle.textContent = this.t(
      game.gameState.phase === PHASES.PLACEMENT
        ? "game.phase.placement"
        : game.gameState.phase === PHASES.GAME_OVER
          ? "game.phase.gameOver"
          : "game.phase.battle"
    );
  },

  createBoardCell(participant, row, col, options = {}) {
    const boardCell = participant.board[row][col];
    const cell = document.createElement(options.interactive ? "button" : "div");
    cell.className = "board-cell";
    cell.dataset.row = String(row);
    cell.dataset.col = String(col);
    if (options.interactive) cell.type = "button";
    if (options.showShips && boardCell.shipId) cell.classList.add("has-ship");
    if (boardCell.attacked && boardCell.result) cell.classList.add(`is-${boardCell.result}`);

    const lastAttack = window.game?.gameState?.lastAttack;
    if (lastAttack && lastAttack.target === participant.key && lastAttack.row === row && lastAttack.col === col) {
      cell.classList.add("is-last-shot");
    }

    if (options.interactive) {
      const disabled = !options.allowInput || typeof options.onSelect !== "function" || !!options.isLocked;
      cell.disabled = disabled;
      if (!disabled) {
        cell.onclick = () => options.onSelect(row, col);
      }
    }

    return cell;
  },

  renderBoardScene(hostId, participant, options = {}) {
    const host = document.getElementById(hostId);
    if (!host || !participant) return;
    host.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "board-wrap";

    const boardClip = document.createElement("div");
    boardClip.className = "board-clip";

    const gridLayer = document.createElement("div");
    gridLayer.className = "grid-layer board-grid";
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        gridLayer.appendChild(this.createBoardCell(participant, row, col, options));
      }
    }

    const shipLayer = document.createElement("div");
    shipLayer.className = "ship-layer";
    buildShipSprites(participant.fleet, { showShips: !!options.showShips }).forEach((sprite) => {
      const wrapper = document.createElement("div");
      wrapper.className = `ship-sprite ${sprite.orientation}`;
      wrapper.setAttribute("aria-hidden", "true");
      this.applyStyle(wrapper, sprite.wrapperStyle);

      const image = document.createElement("img");
      image.src = sprite.asset;
      image.alt = sprite.label;
      this.applyStyle(image, sprite.imageStyle);
      wrapper.appendChild(image);

      if (sprite.debugFootprintStyle) {
        const debugFootprint = document.createElement("div");
        debugFootprint.className = "ship-footprint-debug";
        this.applyStyle(debugFootprint, sprite.debugFootprintStyle);
        wrapper.appendChild(debugFootprint);
      }

      shipLayer.appendChild(wrapper);
    });

    const overlayLayer = document.createElement("div");
    overlayLayer.className = "overlay-layer";
    buildOverlayMarkers(participant.board).forEach((marker) => {
      const token = document.createElement("div");
      token.className = `overlay-token ${marker.result}`;
      token.textContent = marker.symbol;
      this.applyStyle(token, marker.style);
      overlayLayer.appendChild(token);
    });

    // Grid and attack overlays stay clipped to the board frame.
    // Ship sprites live in a sibling layer so bows, props, and masts can overhang naturally.
    boardClip.appendChild(gridLayer);
    boardClip.appendChild(overlayLayer);
    wrap.appendChild(boardClip);
    wrap.appendChild(shipLayer);
    host.appendChild(wrap);
  },

  renderBoards() {
    const ownTitle = document.getElementById("own-board-title");
    const targetTitle = document.getElementById("target-board-title");
    const ownHost = document.getElementById("own-board");
    const targetHost = document.getElementById("target-board");
    if (!window.game || !game.gameState || !ownHost || !targetHost) return;

    if (ownTitle) ownTitle.textContent = game.getOwnBoardTitle();
    if (targetTitle) targetTitle.textContent = game.getTargetBoardTitle();

    if (game.isPlacementPhase()) {
      const placementSeat = game.getPlacementSeatKey();
      const placementParticipant = game.getPlacementParticipant(placementSeat);
      const hiddenTarget = game.gameState.players[getOpponentKey(placementSeat)];

      this.renderBoardScene("own-board", placementParticipant, {
        showShips: true,
        interactive: true,
        allowInput: true,
        isLocked: game.inputLocked || game.aiThinking || game.turnHandoffPending,
        onSelect: (row, col) => game.placePlayerShipAt(row, col)
      });

      this.renderBoardScene("target-board", hiddenTarget, {
        showShips: false,
        interactive: false,
        allowInput: false
      });
      return;
    }

    const perspective = game.getPerspectiveKey();
    const targetKey = game.getTargetKeyForPerspective();
    const ownParticipant = game.gameState.players[perspective];
    const targetParticipant = game.gameState.players[targetKey];
    const allowTargetInput = game.isHumanTurn()
      && game.gameState.turn === perspective
      && !game.turnHandoffPending
      && !game.aiThinking
      && !game.inputLocked;

    this.renderBoardScene("own-board", ownParticipant, {
      showShips: true,
      interactive: false,
      allowInput: false
    });

    this.renderBoardScene("target-board", targetParticipant, {
      showShips: false,
      interactive: true,
      allowInput: allowTargetInput,
      onSelect: (row, col) => game.applyAttackAt(row, col)
    });
  },

  renderPlacementPanel(container) {
    const placement = game.getPlacementPanelData();
    const currentShipText = placement.currentShip
      ? `${placement.currentShip.label} (${placement.currentShip.size})`
      : this.t("placement.ready");

    container.innerHTML = `
      <div class="panel-head">${this.t("placement.title")}</div>
      <div class="placement-note">${this.t("placement.instruction", { seat: placement.seatLabel })}</div>
      <div class="placement-meta-row">
        <span>${this.t("placement.activeSeat")}</span>
        <strong>${placement.seatLabel}</strong>
      </div>
      <div class="placement-meta-row">
        <span>${this.t("placement.currentShip")}</span>
        <strong>${currentShipText}</strong>
      </div>
      <div class="placement-meta-row">
        <span>${this.t("placement.orientation")}</span>
        <strong>${this.t(`placement.${placement.orientation}`)}</strong>
      </div>
      <div class="placement-queue">
        ${placement.ships.map((ship) => `
          <div class="placement-ship ${ship.placed ? "placed" : ship.current ? "current" : "pending"}">
            <div class="placement-ship-name">${ship.label}</div>
            <div class="placement-ship-meta">${ship.size}칸</div>
          </div>
        `).join("")}
      </div>
      <div class="placement-actions">
        <button class="action-btn secondary" data-action="rotate">${this.t("buttons.rotateShip")}</button>
        <button class="action-btn secondary" data-action="randomize">${this.t("buttons.randomizeFleet")}</button>
        <button class="action-btn secondary" data-action="clear">${this.t("buttons.clearFleet")}</button>
        <button class="action-btn primary" data-action="confirm" ${placement.ready ? "" : "disabled"}>${this.t("buttons.startBattle")}</button>
      </div>
      <div class="placement-note compact">${placement.ready ? this.t("placement.confirmPrompt") : this.t("placement.targetLocked")}</div>
    `;

    container.querySelector("button[data-action='rotate']")?.addEventListener("click", () => game.togglePlacementOrientation());
    container.querySelector("button[data-action='randomize']")?.addEventListener("click", () => game.randomizePlacement());
    container.querySelector("button[data-action='clear']")?.addEventListener("click", () => game.clearPlacement());
    container.querySelector("button[data-action='confirm']")?.addEventListener("click", () => game.confirmPlacement());
  },
  renderFleetStatus() {
    const container = document.getElementById("fleet-status");
    if (!container || !window.game) return;

    if (game.isPlacementPhase()) {
      this.renderPlacementPanel(container);
      return;
    }

    const { own, target } = game.getFleetPanelData();
    const renderList = (title, ships) => `
      <div class="fleet-block">
        <div class="panel-subtitle">${title}</div>
        <div class="fleet-list">
          ${ships.map((ship) => `
            <div class="fleet-row ${ship.sunk ? "sunk" : "afloat"}">
              <div class="fleet-name">${ship.label}</div>
              <div class="fleet-meta">${ship.hits}/${ship.size} · ${ship.sunk ? this.t("fleet.sunk") : this.t("fleet.afloat")}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="panel-head">${this.t("fleet.title")}</div>
      ${renderList(this.t("fleet.player"), own)}
      ${renderList(this.t("fleet.enemy"), target)}
    `;
  },

  renderShotLog() {
    const container = document.getElementById("shot-log");
    if (!container || !window.game) return;

    if (game.isPlacementPhase()) {
      container.innerHTML = `
        <div class="panel-head">${this.t("log.title")}</div>
        <div class="panel-empty">${this.t("placement.targetLocked")}</div>
      `;
      return;
    }

    const log = game.getShotLog();
    if (log.length === 0) {
      container.innerHTML = `
        <div class="panel-head">${this.t("log.title")}</div>
        <div class="panel-empty">${this.t("log.empty")}</div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="panel-head">${this.t("log.title")}</div>
      <div class="shot-list">
        ${log.slice(0, 14).map((entry) => {
          const attackerLabel = entry.attacker === PLAYER_KEYS.PLAYER ? this.t("shot.byPlayer") : this.t("shot.byEnemy");
          const resultLabel = this.getShotResultLabel(entry.result);
          const shipLabel = entry.shipType ? this.getShipLabel(entry.shipType) : "";
          return `
            <div class="shot-item ${entry.result}">
              <div class="shot-main">${attackerLabel} · ${entry.coord}</div>
              <div class="shot-meta">${resultLabel}${shipLabel ? ` · ${shipLabel}` : ""}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  },

  renderHintPanel() {
    const container = document.getElementById("hint-panel");
    if (!container || !window.game) return;
    const hint = game.lastHint;

    if (game.isPlacementPhase()) {
      container.innerHTML = `
        <div class="panel-head">${this.t("hint.title")}</div>
        <div class="panel-empty">${this.t("placement.confirmPrompt")}</div>
      `;
      return;
    }

    const stage = Number(hint?.stage) || 0;
    const pending = !!hint?.pending;
    const sourceLabel = this.getHintSourceLabel(hint);
    const searchLabel = this.getHintSearchLabel(hint);
    const monteCarloApplied = !!hint?.monteCarlo?.applied;

    container.innerHTML = `
      <div class="panel-head">${this.t("hint.title")}</div>
      <div class="hint-controls">
        ${[1, 2, 3].map((value) => `
          <button class="hint-step-btn ${stage === value ? "active" : ""}" ${pending ? "disabled" : ""}>${value}</button>
        `).join("")}
      </div>
      ${hint ? `
        <div class="hint-meta-row">
          <span class="hint-stage">${this.t(`hint.stage${hint.stage}`)}</span>
          <span class="hint-badge ${pending ? "pending" : ""}">${pending ? this.t("hint.pending") : sourceLabel}</span>
          ${searchLabel ? `<span class="hint-badge subtle">${searchLabel}</span>` : ""}
          ${monteCarloApplied ? `<span class="hint-badge mc">MC</span>` : ""}
        </div>
        <div class="hint-summary ${pending ? "pending" : ""}">${hint.summary}</div>
        <div class="hint-candidates">
          ${(hint.candidates || []).map((entry) => `<span class="hint-chip">${entry.coord}</span>`).join("")}
        </div>
      ` : `
        <div class="panel-empty">${this.t("hint.empty")}</div>
      `}
    `;

    Array.from(container.querySelectorAll(".hint-step-btn")).forEach((button, index) => {
      button.onclick = () => game.requestHint(index + 1);
    });
  },

  renderTurnHandoffOverlay() {
    const overlay = document.getElementById("turn-handoff-overlay");
    const text = document.getElementById("turn-handoff-text");
    const button = document.getElementById("btn-turn-handoff");
    if (!overlay || !text || !button || !window.game) return;

    const visible = !!game.turnHandoffPending;
    overlay.classList.toggle("hidden", !visible);
    if (!visible) return;

    text.textContent = game.getTurnHandoffMessage() || this.t("handoff.text");
    button.onclick = () => game.acknowledgeTurnHandoff();
  },
  renderArchiveOverlay() {
    const overlay = document.getElementById("archive-overlay");
    const list = document.getElementById("archive-list");
    if (!overlay || !list || !window.game) return;

    overlay.classList.toggle("hidden", !game.archiveOverlayOpen);
    if (!game.archiveOverlayOpen) return;

    const entries = game.getArchiveGames();
    if (entries.length === 0) {
      list.innerHTML = `<div class="panel-empty">${this.t("archive.empty")}</div>`;
      return;
    }

    list.innerHTML = entries.map((entry) => {
      const summary = summarizeArchiveEntry(entry, game.language);
      return `
        <div class="archive-card">
          <div class="archive-main">
            <div class="archive-title">${summary.resultLabel}</div>
            <div class="archive-meta">${summary.savedAtLabel}</div>
            <div class="archive-meta">Shots: ${summary.shotCount}</div>
          </div>
          <div class="archive-actions-row">
            <button class="action-btn secondary" data-action="view" data-id="${summary.id}">${this.t("buttons.view")}</button>
            <button class="action-btn danger" data-action="delete" data-id="${summary.id}">${this.t("buttons.delete")}</button>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("button[data-action='view']").forEach((button) => {
      button.onclick = () => game.loadArchivedGame(button.dataset.id);
    });
    list.querySelectorAll("button[data-action='delete']").forEach((button) => {
      button.onclick = () => game.deleteArchivedGame(button.dataset.id);
    });
  },

  updateAll() {
    this.applyStaticText();
    this.renderLanguageSelector();
    this.renderStart();
    this.renderSetup();
    this.renderGameHeader();
    this.renderFleetStatus();
    this.renderShotLog();
    this.renderHintPanel();
    if (window.game?.gameState) {
      this.renderBoards();
    }
    this.renderArchiveOverlay();
    this.renderTurnHandoffOverlay();
  },

  toast(message) {
    const toast = document.getElementById("toast");
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("visible");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
      toast.classList.add("hidden");
    }, 2400);
  }
};



