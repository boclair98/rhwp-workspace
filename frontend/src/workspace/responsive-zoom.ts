type FitMode = 'none' | 'fitWidth' | 'fitPage';
type ResizeState = { loaded: boolean; mode: FitMode };

/** Refit only a chosen fit rule; typing/keyboard height changes must not reset manual zoom. */
export function createFitResizeHandler(
  getState: () => ResizeState,
  refit: (mode: Exclude<FitMode, 'none'>) => void,
  enqueue: (callback: () => void) => void,
) {
  let previous: { width: number; height: number } | null = null;
  let pending = false;
  return (width: number, height: number) => {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return;
    const before = previous;
    previous = { width, height };
    const state = getState();
    if (!before || !state.loaded || state.mode === 'none')
      return;
    const changed =
      before.width !== width ||
      (state.mode === 'fitPage' && before.height !== height);
    if (!changed || pending) return;
    pending = true;
    enqueue(() => {
      pending = false;
      const latest = getState();
      if (latest.loaded && latest.mode !== 'none')
        refit(latest.mode);
    });
  };
}
