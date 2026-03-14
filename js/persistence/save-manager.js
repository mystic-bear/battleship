(function (root, factory) {
  let deps;
  if (typeof module !== "undefined" && module.exports) {
    deps = {
      ...require("../../shared/utils.js")
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
    deepCopy
  } = deps;

  const SAVE_KEY = "animal-battleship-latest-save";
  const ARCHIVE_KEY = "animal-battleship-archive";
  const SAVE_SCHEMA_VERSION = 1;
  const ARCHIVE_LIMIT = 30;

  function createMemoryStorage() {
    const store = new Map();
    return {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      }
    };
  }

  class SaveManager {
    constructor(options = {}) {
      this.saveKey = options.saveKey || SAVE_KEY;
      this.archiveKey = options.archiveKey || ARCHIVE_KEY;
      this.schemaVersion = options.schemaVersion || SAVE_SCHEMA_VERSION;
      this.archiveLimit = Number(options.archiveLimit) > 0 ? Number(options.archiveLimit) : ARCHIVE_LIMIT;
      this.storage = options.storage || this.resolveStorage();
    }

    resolveStorage() {
      if (typeof localStorage !== "undefined") {
        return localStorage;
      }
      return createMemoryStorage();
    }

    normalizeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object" || !snapshot.gameState) return null;
      return {
        schemaVersion: this.schemaVersion,
        savedAt: snapshot.savedAt || new Date().toISOString(),
        language: snapshot.language || "ko",
        modeKey: snapshot.modeKey || "local-human",
        setupPlayers: deepCopy(snapshot.setupPlayers || { player: "HUMAN", enemy: "AI-3" }),
        gameState: deepCopy(snapshot.gameState),
        lastHint: snapshot.lastHint ? deepCopy(snapshot.lastHint) : null,
        statusMessage: String(snapshot.statusMessage || ""),
        viewSeatKey: snapshot.viewSeatKey || "player",
        turnHandoffPending: !!snapshot.turnHandoffPending
      };
    }

    normalizeArchiveEntry(record) {
      if (!record || typeof record !== "object" || !record.gameState) return null;
      return {
        id: record.id || `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        schemaVersion: this.schemaVersion,
        savedAt: record.savedAt || new Date().toISOString(),
        finishedAt: record.finishedAt || new Date().toISOString(),
        language: record.language || "ko",
        modeKey: record.modeKey || "local-human",
        setupPlayers: deepCopy(record.setupPlayers || { player: "HUMAN", enemy: "AI-3" }),
        winner: record.winner || null,
        statusMessage: String(record.statusMessage || ""),
        gameState: deepCopy(record.gameState)
      };
    }

    saveLatest(snapshot) {
      const normalized = this.normalizeSnapshot(snapshot);
      if (!normalized) return null;
      this.storage.setItem(this.saveKey, JSON.stringify(normalized));
      return normalized;
    }

    loadLatest() {
      try {
        const raw = this.storage.getItem(this.saveKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== this.schemaVersion) return null;
        return this.normalizeSnapshot(parsed);
      } catch (error) {
        return null;
      }
    }

    clearLatest() {
      this.storage.removeItem(this.saveKey);
    }

    hasResumeCandidate() {
      return !!this.loadLatest();
    }

    loadArchiveRaw() {
      try {
        const raw = this.storage.getItem(this.archiveKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .map((entry) => this.normalizeArchiveEntry(entry))
          .filter(Boolean)
          .sort((a, b) => String(b.finishedAt || b.savedAt).localeCompare(String(a.finishedAt || a.savedAt)));
      } catch (error) {
        return [];
      }
    }

    saveArchiveRaw(entries) {
      this.storage.setItem(this.archiveKey, JSON.stringify(entries.slice(0, this.archiveLimit)));
    }

    saveFinishedGame(record) {
      const normalized = this.normalizeArchiveEntry(record);
      if (!normalized) return null;
      const archive = this.loadArchiveRaw().filter((entry) => entry.id !== normalized.id);
      archive.unshift(normalized);
      archive.sort((a, b) => String(b.finishedAt || b.savedAt).localeCompare(String(a.finishedAt || a.savedAt)));
      this.saveArchiveRaw(archive);
      return normalized;
    }

    listFinishedGames(limit = null) {
      const archive = this.loadArchiveRaw();
      if (!limit || limit < 1) return archive;
      return archive.slice(0, limit);
    }

    loadFinishedGame(id) {
      if (!id) return null;
      return this.loadArchiveRaw().find((entry) => entry.id === id) || null;
    }

    deleteFinishedGame(id) {
      if (!id) return false;
      const archive = this.loadArchiveRaw();
      const nextArchive = archive.filter((entry) => entry.id !== id);
      if (nextArchive.length === archive.length) return false;
      this.saveArchiveRaw(nextArchive);
      return true;
    }
  }

  return {
    SAVE_KEY,
    ARCHIVE_KEY,
    SAVE_SCHEMA_VERSION,
    ARCHIVE_LIMIT,
    SaveManager,
    createMemoryStorage
  };
});
