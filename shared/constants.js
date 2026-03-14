(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_LANGUAGE = "ko";

  const LANGUAGE_OPTIONS = [
    { key: "ko", nativeLabel: "한국어" },
    { key: "en", nativeLabel: "English" }
  ];

  const PLAYER_ORDER = ["player", "enemy"];
  const HUMAN_PLAYER_TYPE = "HUMAN";
  const SETUP_STATES = ["HUMAN", "AI-1", "AI-2", "AI-3", "AI-4", "AI-5"];

  const HUMAN_LABEL = {
    ko: "사람",
    en: "Human"
  };

  const AI_LEVEL_INFO = {
    1: {
      short: "AI-1",
      label: { ko: "AI-1 / 입문", en: "AI-1 / Entry" },
      desc: { ko: "상위 후보 여러 칸 중에서 자주 흔들리는 쉬운 상대", en: "A forgiving opponent that wanders among several top candidates" }
    },
    2: {
      short: "AI-2",
      label: { ko: "AI-2 / 쉬움", en: "AI-2 / Easy" },
      desc: { ko: "battleboat 확률을 따르되 여전히 선택 폭이 넓음", en: "Mostly follows the battleboat grid but still leaves breathing room" }
    },
    3: {
      short: "AI-3",
      label: { ko: "AI-3 / 기본", en: "AI-3 / Standard" },
      desc: { ko: "기본 battleboat 감각에 가장 가까운 기준 난이도", en: "The baseline profile closest to the default battleboat feel" }
    },
    4: {
      short: "AI-4",
      label: { ko: "AI-4 / 강함", en: "AI-4 / Strong" },
      desc: { ko: "동률이나 추격 상황에서만 Monte Carlo 보강이 들어감", en: "Adds Monte Carlo fallback only in tied or high-pressure states" }
    },
    5: {
      short: "AI-5",
      label: { ko: "AI-5 / 도전", en: "AI-5 / Challenge" },
      desc: { ko: "상위 후보를 매 턴 Monte Carlo로 다시 재정렬함", en: "Reranks top candidates with Monte Carlo every turn" }
    }
  };

  const DEFAULT_SETUP = {
    player: HUMAN_PLAYER_TYPE,
    enemy: "AI-3"
  };

  const QUICK_PRESETS = [
    {
      key: "local-human",
      label: { ko: "사람 vs 사람", en: "Human vs Human" },
      subtitle: { ko: "로컬 대전", en: "Local match" },
      detail: {
        ko: "한 기기에서 두 사람이 번갈아 두 보드 해전을 즐깁니다.",
        en: "Two people share one device and alternate turns."
      },
      setup: { player: HUMAN_PLAYER_TYPE, enemy: HUMAN_PLAYER_TYPE },
      enabled: true
    },
    {
      key: "ai-1",
      label: { ko: "사람 vs AI-1", en: "Human vs AI-1" },
      subtitle: { ko: "가벼운 연습", en: "Warm-up" },
      detail: {
        ko: "첫 판용으로 부담이 적은 쉬운 상대입니다.",
        en: "A gentle opponent for the first few games."
      },
      setup: { player: HUMAN_PLAYER_TYPE, enemy: "AI-1" },
      enabled: true
    },
    {
      key: "ai-3",
      label: { ko: "사람 vs AI-3", en: "Human vs AI-3" },
      subtitle: { ko: "기본 난이도", en: "Standard" },
      detail: {
        ko: "프로젝트의 기준 battleboat 감각에 가까운 설정입니다.",
        en: "A balanced baseline close to the target battleboat feel."
      },
      setup: { player: HUMAN_PLAYER_TYPE, enemy: "AI-3" },
      enabled: true
    },
    {
      key: "ai-5",
      label: { ko: "사람 vs AI-5", en: "Human vs AI-5" },
      subtitle: { ko: "고난이도", en: "Challenge" },
      detail: {
        ko: "Monte Carlo 재정렬까지 붙는 가장 까다로운 설정입니다.",
        en: "The toughest profile with full Monte Carlo reranking."
      },
      setup: { player: HUMAN_PLAYER_TYPE, enemy: "AI-5" },
      enabled: true
    }
  ];

  const HINT_LEVELS = [1, 2, 3];

  function isAiState(state) {
    return /^AI-\d+$/.test(String(state || ""));
  }

  function getAiLevelFromState(state) {
    const match = String(state || "").match(/AI-(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function getSetupStateLabel(state, language = DEFAULT_LANGUAGE) {
    if (!isAiState(state)) return HUMAN_LABEL[language] || HUMAN_LABEL.ko;
    const level = getAiLevelFromState(state);
    const info = AI_LEVEL_INFO[level];
    return info ? (info.label[language] || info.label.ko) : String(state || "AI");
  }

  function buildSetupSummary(setup, language = DEFAULT_LANGUAGE) {
    const enemy = setup?.enemy || DEFAULT_SETUP.enemy;
    if (!isAiState(enemy)) {
      return language === "ko"
        ? "사람 둘이 번갈아 공격하는 로컬 대전"
        : "Local pass-and-play with two human captains";
    }
    const enemyLabel = getSetupStateLabel(enemy, language);
    return language === "ko"
      ? `플레이어 대 ${enemyLabel}`
      : `Player versus ${enemyLabel}`;
  }

  return {
    DEFAULT_LANGUAGE,
    LANGUAGE_OPTIONS,
    PLAYER_ORDER,
    HUMAN_PLAYER_TYPE,
    SETUP_STATES,
    HUMAN_LABEL,
    AI_LEVEL_INFO,
    DEFAULT_SETUP,
    QUICK_PRESETS,
    HINT_LEVELS,
    isAiState,
    getAiLevelFromState,
    getSetupStateLabel,
    buildSetupSummary
  };
});

