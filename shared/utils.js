(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLUMN_LABELS = "ABCDEFGHIJ".split("");

  function deepCopy(value) {
    if (value == null) return value;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Fall back to JSON cloning below.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInt(max, rng = Math.random) {
    return Math.floor(rng() * max);
  }

  function sample(list, rng = Math.random) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[randomInt(list.length, rng)];
  }

  function createId(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function resolveLocalizedText(value, language = "ko") {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return String(value[language] || value.ko || value.en || Object.values(value)[0] || "");
    }
    return String(value || "");
  }

  function formatCoordinate(row, col) {
    const column = COLUMN_LABELS[col] || "?";
    return `${column}${Number(row) + 1}`;
  }

  function formatDateTime(value, language = "ko") {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value));
    } catch (error) {
      return String(value);
    }
  }

  return {
    COLUMN_LABELS,
    deepCopy,
    clamp,
    randomInt,
    sample,
    createId,
    resolveLocalizedText,
    formatCoordinate,
    formatDateTime
  };
});
