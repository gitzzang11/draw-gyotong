export type GameShellInitializerDependencies<TSlot, TCityId extends string = string> = {
  applySettingsToUi: () => void;
  renderCityOptions: () => void;
  listSaveSlots: () => Promise<TSlot[]>;
  setSlotSummaries: (slots: TSlot[]) => void;
  loadSavedState: () => void;
  getCityId: () => TCityId;
  applyCityMapConstraints: (cityId: TCityId) => void;
  updateEconomyHud: () => void;
  renderStartScreen: () => void;
  showStartScreen: (visible: boolean) => void;
  hasNetworkRoutes: () => boolean;
  activateSession: () => void;
  resetMeta: () => void;
  saveCurrentSlot: (label: string) => Promise<unknown>;
  startAutoSave: () => void;
  updateCacheReadout: () => void | Promise<void>;
};

/** Runs the existing shell/session startup sequence without owning game state. */
export async function initializeGameShell<TSlot, TCityId extends string = string>(dependencies: GameShellInitializerDependencies<TSlot, TCityId>) {
  dependencies.applySettingsToUi();
  dependencies.renderCityOptions();
  let slots: TSlot[] = [];
  try {
    slots = await dependencies.listSaveSlots();
  } catch {
    slots = [];
  }
  dependencies.setSlotSummaries(slots);
  if (slots.length === 0) dependencies.loadSavedState();
  dependencies.applyCityMapConstraints(dependencies.getCityId());
  dependencies.updateEconomyHud();
  dependencies.renderStartScreen();
  dependencies.showStartScreen(slots.length > 0);
  if (slots.length === 0 && dependencies.hasNetworkRoutes()) {
    dependencies.activateSession();
    dependencies.resetMeta();
    await dependencies.saveCurrentSlot("기존 저장 이전");
  }
  dependencies.startAutoSave();
  void dependencies.updateCacheReadout();
}
