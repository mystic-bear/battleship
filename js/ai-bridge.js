(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class AIBridge {
    constructor(options = {}) {
      this.workerPath = options.workerPath || "./worker/ai-worker.js";
      this.worker = null;
      this.pending = new Map();
      this.ready = false;
      this.available = false;
      this.lastError = null;
      this.requestTimeoutMs = {
        chooseMove: options.requestTimeoutMs?.chooseMove || 10000,
        getHint: options.requestTimeoutMs?.getHint || 10000,
        analyzeGame: options.requestTimeoutMs?.analyzeGame || 45000
      };
      this.softDeadlineMs = {
        chooseMove: options.softDeadlineMs?.chooseMove || 9000,
        getHint: options.softDeadlineMs?.getHint || 9000,
        analyzeGame: options.softDeadlineMs?.analyzeGame || 40000
      };
      this._initWorker();
    }

    _createBridgeError(message, code = "worker-unavailable", cause = null) {
      const error = message instanceof Error ? message : new Error(String(message || "Worker unavailable"));
      if (!error.code) error.code = code;
      if (cause && !error.cause) error.cause = cause;
      return error;
    }

    _teardownWorker() {
      if (!this.worker) return;
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }

    _markUnavailable(error) {
      this.ready = false;
      this.available = false;
      this.lastError = this._createBridgeError(error, error?.code || "worker-unavailable");
    }

    _clearPendingEntry(id) {
      const pending = this.pending.get(id);
      if (!pending) return null;
      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
      this.pending.delete(id);
      return pending;
    }

    _attachPartialToError(error, pending) {
      if (!pending?.lastPartial) return error;
      if (pending.type === "chooseMove") error.partialMove = pending.lastPartial.move || null;
      if (pending.type === "getHint") error.partialHint = pending.lastPartial.hint || null;
      error.partialResult = pending.lastPartial;
      return error;
    }

    _rejectAllPending(error) {
      this.pending.forEach((pending, id) => {
        const entry = this._clearPendingEntry(id);
        if (!entry) return;
        const workerError = this._createBridgeError(error, error?.code || "worker-unavailable");
        entry.reject(this._attachPartialToError(workerError, entry));
      });
    }

    _restartWorker(error) {
      const workerError = this._createBridgeError(error, error?.code || "worker-unavailable");
      this._rejectAllPending(workerError);
      this._teardownWorker();
      this._markUnavailable(workerError);
      this._initWorker();
    }

    _getRequestTimeoutMs(type) {
      return this.requestTimeoutMs[type] || 10000;
    }

    _getSoftDeadlineMs(type) {
      return this.softDeadlineMs[type] || Math.max(1000, this._getRequestTimeoutMs(type) - 1000);
    }

    _startRequestTimeout(id, type) {
      return setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        const label = type === "chooseMove"
          ? "AI move"
          : type === "getHint"
            ? "Hint"
            : "Review analysis";
        const code = type === "chooseMove"
          ? "choose-move-timeout"
          : type === "getHint"
            ? "hint-timeout"
            : "review-timeout";
        const error = this._createBridgeError(`${label} request timed out`, code);

        if (pending.lastPartial) {
          const entry = this._clearPendingEntry(id);
          if (!entry) return;
          entry.resolve({
            ...entry.lastPartial,
            timedOut: true
          });
          this._restartWorker(error);
          return;
        }

        this._restartWorker(error);
      }, this._getRequestTimeoutMs(type));
    }

    _cachePartial(pending, payload) {
      if (!pending || !payload) return;
      const searchPhase = payload.searchPhase
        || payload.move?.searchPhase
        || payload.hint?.searchPhase
        || null;
      const partialReason = payload.partialReason
        || payload.move?.partialReason
        || payload.hint?.partialReason
        || "soft-deadline";
      const partial = {
        stateVersion: payload.stateVersion ?? pending.stateVersion,
        partial: true,
        searchTruncated: true,
        searchPhase,
        partialReason
      };

      if (payload.move) {
        partial.move = {
          ...payload.move,
          partial: true,
          searchTruncated: true,
          searchPhase: payload.move.searchPhase || searchPhase,
          partialReason: payload.move.partialReason || partialReason
        };
      }

      if (payload.hint) {
        partial.hint = {
          ...payload.hint,
          partial: true,
          searchTruncated: true,
          searchPhase: payload.hint.searchPhase || searchPhase,
          partialReason: payload.hint.partialReason || partialReason
        };
      }

      pending.lastPartial = partial;
    }

    _initWorker() {
      this._teardownWorker();

      if (typeof window !== "undefined" && window.location?.protocol === "file:") {
        this._markUnavailable(this._createBridgeError(
          "AI and coach need http://localhost or a deployed site. Browsers block worker scripts on file:// pages.",
          "worker-file-origin"
        ));
        return false;
      }

      try {
        const workerTarget = typeof window !== "undefined" && typeof URL !== "undefined"
          ? new URL(this.workerPath, window.location.href)
          : this.workerPath;
        this.worker = new Worker(workerTarget);
      } catch (error) {
        this._markUnavailable(this._createBridgeError(error, "worker-init-failed"));
        return false;
      }

      this.ready = false;
      this.available = true;
      this.lastError = null;

      this.worker.onmessage = (event) => {
        const { type, id, stateVersion, move, hint, message, code, progressMeta } = event.data;

        if (type === "ready") {
          this.ready = true;
          return;
        }

        const pending = this.pending.get(id);
        if (!pending) return;

        if (type === "progress") {
          pending.progressMeta = progressMeta || event.data;
          if (pending.onProgress) pending.onProgress(pending.progressMeta);
          return;
        }

        if (type === "partialMove") {
          const partialPayload = {
            move,
            stateVersion,
            searchPhase: event.data.searchPhase || null,
            partialReason: event.data.partialReason || null,
            partial: true,
            searchTruncated: true
          };
          this._cachePartial(pending, partialPayload);
          if (pending.onPartial) pending.onPartial({ ...partialPayload, type: "partialMove" });
          return;
        }

        if (type === "partialHint") {
          const partialPayload = {
            hint,
            stateVersion,
            searchPhase: event.data.searchPhase || null,
            partialReason: event.data.partialReason || null,
            partial: true,
            searchTruncated: true
          };
          this._cachePartial(pending, partialPayload);
          if (pending.onPartial) pending.onPartial({ ...partialPayload, type: "partialHint" });
          return;
        }

        const entry = this._clearPendingEntry(id);
        if (!entry) return;

        if (type === "error") {
          const workerError = this._createBridgeError(message || "Worker request failed", code || "worker-error");
          entry.reject(this._attachPartialToError(workerError, entry));
          return;
        }

        if (type === "moveResult") {
          entry.resolve({ move, stateVersion, meta: event.data.meta || null, candidates: event.data.candidates || [] });
          return;
        }

        if (type === "hintResult") {
          entry.resolve({ hint, stateVersion, meta: event.data.meta || null });
          return;
        }

        if (type === "reviewResult") {
          entry.resolve({ review: event.data.review, stateVersion });
        }
      };

      this.worker.onerror = (event) => {
        this._restartWorker(this._createBridgeError("Worker crashed", "worker-crashed", event));
      };

      return true;
    }

    _ensureWorker() {
      if (this.worker && this.available) return true;
      return this._initWorker();
    }

    _getWorkerError(defaultMessage = "Worker unavailable", code = "worker-unavailable") {
      if (this.lastError instanceof Error) return this.lastError;
      return this._createBridgeError(defaultMessage, code);
    }

    _createRequestId(prefix) {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    _createPendingEntry(id, type, stateVersion, resolve, reject, callbacks = {}) {
      return {
        resolve,
        reject,
        timeoutHandle: this._startRequestTimeout(id, type),
        type,
        stateVersion,
        lastPartial: null,
        progressMeta: null,
        onPartial: typeof callbacks.onPartial === "function" ? callbacks.onPartial : null,
        onProgress: typeof callbacks.onProgress === "function" ? callbacks.onProgress : null
      };
    }

    chooseMove(gameState, aiLevel, stateVersion, callbacks = {}) {
      const id = this._createRequestId("move");
      return new Promise((resolve, reject) => {
        if (!this._ensureWorker()) {
          reject(this._getWorkerError("Worker unavailable", "worker-unavailable"));
          return;
        }

        this.pending.set(id, this._createPendingEntry(id, "chooseMove", stateVersion, resolve, reject, callbacks));
        try {
          this.worker.postMessage({
            type: "chooseMove",
            id,
            stateVersion,
            gameState,
            aiLevel,
            budgetMs: this._getRequestTimeoutMs("chooseMove"),
            softDeadlineMs: this._getSoftDeadlineMs("chooseMove"),
            allowPartial: true
          });
        } catch (error) {
          this._restartWorker(error);
        }
      });
    }

    getHint(gameState, aiLevel, stateVersion, callbacks = {}) {
      const id = this._createRequestId("hint");
      const hintStage = Number(callbacks?.hintStage) || 1;
      return new Promise((resolve, reject) => {
        if (!this._ensureWorker()) {
          reject(this._getWorkerError("Worker unavailable", "worker-unavailable"));
          return;
        }

        this.pending.set(id, this._createPendingEntry(id, "getHint", stateVersion, resolve, reject, callbacks));
        try {
          this.worker.postMessage({
            type: "getHint",
            id,
            stateVersion,
            gameState,
            aiLevel,
            hintStage,
            budgetMs: this._getRequestTimeoutMs("getHint"),
            softDeadlineMs: this._getSoftDeadlineMs("getHint"),
            allowPartial: true
          });
        } catch (error) {
          this._restartWorker(error);
        }
      });
    }

    analyzeGame(reviewTarget, stateVersion, callbacks = {}) {
      const id = this._createRequestId("review");
      return new Promise((resolve, reject) => {
        if (!this._ensureWorker()) {
          reject(this._getWorkerError("Worker unavailable", "worker-unavailable"));
          return;
        }

        this.pending.set(id, this._createPendingEntry(id, "analyzeGame", stateVersion, resolve, reject, callbacks));
        try {
          this.worker.postMessage({
            type: "analyzeGame",
            id,
            stateVersion,
            reviewTarget,
            budgetMs: this._getRequestTimeoutMs("analyzeGame"),
            softDeadlineMs: this._getSoftDeadlineMs("analyzeGame"),
            allowPartial: false
          });
        } catch (error) {
          this._restartWorker(error);
        }
      });
    }

    cancelPending() {
      this._rejectAllPending(new Error("Cancelled"));
      this._initWorker();
    }
  }

  function createUnavailableAIBridge(error) {
    const lastError = error instanceof Error ? error : new Error(String(error || "Worker unavailable"));
    if (!lastError.code) lastError.code = "worker-unavailable";

    return {
      worker: null,
      pending: new Map(),
      ready: false,
      available: false,
      lastError,
      chooseMove() {
        return Promise.reject(this.lastError);
      },
      getHint() {
        return Promise.reject(this.lastError);
      },
      analyzeGame() {
        return Promise.reject(this.lastError);
      },
      cancelPending() {}
    };
  }

  return {
    AIBridge,
    createUnavailableAIBridge
  };
});


