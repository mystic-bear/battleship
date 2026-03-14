let aiBridge;

try {
  aiBridge = new AIBridge();
} catch (error) {
  console.error("AI bridge bootstrap failed:", error);
  aiBridge = createUnavailableAIBridge(error);
}

aiBridge.battleshipReady = aiBridge.available !== false;

window.aiBridge = aiBridge;
window.ui = ui;

const saveManager = new SaveManager();
window.saveManager = saveManager;

const game = new Game({ aiBridge, ui, saveManager });
window.game = game;

ui.renderStart();
ui.renderSetup();
ui.hideSetup();
ui.showScreen("start-screen");
ui.updateAll();

window.addEventListener("resize", () => {
  ui.updateAll();
});
