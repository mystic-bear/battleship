"use strict";

(function bootstrapWorker(globalScope) {
  const isNodeRuntime = typeof process !== "undefined"
    && process.versions
    && typeof process.versions.node === "string"
    && typeof require === "function";

  let BattleboatAdapter;
  let addMessageListener;
  let postMessageSafe;

  if (isNodeRuntime) {
    const { parentPort } = require("node:worker_threads");
    BattleboatAdapter = require("./battleboat-adapter.js");
    addMessageListener = (handler) => parentPort.on("message", (data) => handler({ data }));
    postMessageSafe = (payload) => parentPort.postMessage(payload);
  } else {
    importScripts("../js/battle/constants.js", "montecarlo-rerank.js", "battleboat-adapter.js");
    BattleboatAdapter = globalScope;
    addMessageListener = (handler) => {
      globalScope.onmessage = handler;
    };
    postMessageSafe = (payload) => globalScope.postMessage(payload);
  }

  function post(payload) {
    postMessageSafe(payload);
  }

  function normalizeErrorPayload(error) {
    return {
      message: error instanceof Error ? error.message : String(error || "Worker error"),
      code: error?.code || "worker-error"
    };
  }

  async function handleChooseMove(request) {
    const result = BattleboatAdapter.chooseMove(request.gameState, request.aiLevel);
    post({
      type: "moveResult",
      id: request.id,
      stateVersion: request.stateVersion,
      move: result.move,
      candidates: result.candidates,
      searchPhase: result.searchPhase || "battleboat-probability",
      meta: result.meta || null
    });
  }

  async function handleGetHint(request) {
    const result = BattleboatAdapter.getHint(request.gameState, request.aiLevel, request.hintStage);
    post({
      type: "hintResult",
      id: request.id,
      stateVersion: request.stateVersion,
      hint: result.hint,
      searchPhase: result.searchPhase || "battleboat-probability",
      meta: result.meta || null
    });
  }

  async function handleAnalyzeGame(request) {
    const error = new Error("Game review is not implemented for battleship yet.");
    error.code = "review-unavailable";
    throw error;
  }

  async function handleRequest(event) {
    const request = event.data || {};
    try {
      if (request.type === "newGame") {
        post({ type: "newGameResult", id: request.id, stateVersion: request.stateVersion, ok: true });
        return;
      }
      if (request.type === "chooseMove") {
        await handleChooseMove(request);
        return;
      }
      if (request.type === "getHint") {
        await handleGetHint(request);
        return;
      }
      if (request.type === "analyzeGame") {
        await handleAnalyzeGame(request);
      }
    } catch (error) {
      const payload = normalizeErrorPayload(error);
      post({
        type: "error",
        id: request.id,
        stateVersion: request.stateVersion,
        message: payload.message,
        code: payload.code
      });
    }
  }

  addMessageListener(handleRequest);
  post({ type: "ready", workerMode: "battleboat-adapter" });
})(typeof self !== "undefined" ? self : globalThis);
