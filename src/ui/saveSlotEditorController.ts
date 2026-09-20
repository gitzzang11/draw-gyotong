export type LoadedSaveSlot<TState, TMeta> = {
  state: TState;
  meta: TMeta;
};

export type SaveSlotEditorInput<TMode, TDifficulty> = {
  slotId: string;
  slotName: string;
  mode: TMode;
  difficulty: TDifficulty;
  networkTitle?: string;
};

export type SaveSlotEditorCallbacks<TState, TMeta, TMode, TDifficulty> = {
  isActiveSlot: (slotId: string) => boolean;
  flushActiveSlot: () => Promise<void>;
  readSlot: (slotId: string) => Promise<LoadedSaveSlot<TState, TMeta> | null>;
  buildMeta: (meta: TMeta, input: SaveSlotEditorInput<TMode, TDifficulty>, updatedAt: number) => TMeta;
  updateSlot: (state: TState, meta: TMeta) => Promise<void>;
  applyActiveMeta: (meta: TMeta) => void;
  refreshSlots: () => Promise<void>;
  refreshViews: () => void;
  setStatus: (status: string) => void;
  closeEditor: () => void;
  notifySuccess: () => void;
};

/** Runs save-slot editor persistence and refresh orchestration without owning DOM state. */
export async function saveEditedSlot<TState, TMeta, TMode, TDifficulty>(
  input: SaveSlotEditorInput<TMode, TDifficulty>,
  callbacks: SaveSlotEditorCallbacks<TState, TMeta, TMode, TDifficulty>,
) {
  if (callbacks.isActiveSlot(input.slotId)) await callbacks.flushActiveSlot();
  const loaded = await callbacks.readSlot(input.slotId);
  if (!loaded) throw new Error("Save metadata is missing");

  const nextMeta = callbacks.buildMeta(loaded.meta, input, Date.now());
  await callbacks.updateSlot(loaded.state, nextMeta);
  if (callbacks.isActiveSlot(input.slotId)) callbacks.applyActiveMeta(nextMeta);
  await callbacks.refreshSlots();
  callbacks.refreshViews();
  callbacks.setStatus("세이브 설정 수정");
  callbacks.closeEditor();
  callbacks.notifySuccess();
}
