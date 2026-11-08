import type { WasmBridge } from '../core/wasm-bridge';
import type { EventBus } from '../core/event-bus';
import type { CommandDispatcher } from '../command/dispatcher';
import { userSettings } from '../core/user-settings';
import { createFitResizeHandler } from '../workspace/responsive-zoom';
import { workspaceDialog } from './workspace-dialog';

export function installWorkspaceZoom(
  wasm: WasmBridge,
  bus: EventBus,
  dispatcher: CommandDispatcher,
) {
  const narrow = matchMedia('(max-width:900px)');
  const trigger = document.getElementById('sb-zoom-display')!;
  const scroll = document.getElementById('scroll-container')!;
  let currentZoom = 1;
  bus.on('zoom-level-display', (value) => {
    currentZoom = Number(value) || 1;
  });
  const fit = (mode: 'fitWidth' | 'fitPage') =>
    dispatcher.dispatch(
      mode === 'fitWidth' ? 'view:zoom-fit-width' : 'view:zoom-fit-page',
    );
  const resize = createFitResizeHandler(
    () => ({
      loaded: wasm.hasLoadedDocument(),
      mode: userSettings.getViewSettings().zoomFitMode,
    }),
    fit,
    (callback) => {
      const readingTop = scroll.scrollTop / currentZoom;
      const generation = wasm.documentGeneration;
      setTimeout(() => {
        callback();
        if (
          generation === wasm.documentGeneration &&
          userSettings.getViewSettings().zoomFitMode !== 'none'
        ) {
          scroll.scrollTop = readingTop * currentZoom;
        }
      }, 0);
    },
  );
  bus.on('viewport-resize', (width, height) =>
    resize(Number(width), Number(height)),
  );
  bus.on('document-loaded', () => {
    if (narrow.matches && wasm.hasLoadedDocument()) fit('fitWidth');
  });

  trigger.addEventListener(
    'click',
    (event) => {
      if (!narrow.matches || !wasm.hasLoadedDocument()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const view = workspaceDialog('화면 배율', trigger);
      view.dialog.classList.add('workspace-zoom-dialog');
      const current = document.createElement('p');
      current.className = 'workspace-zoom-current';
      current.setAttribute('role', 'status');
      const hint = document.createElement('p');
      hint.className = 'workspace-muted';
      hint.textContent =
        '작은 글자는 100% 이상으로 확대해 보세요. 문서의 종이 크기는 그대로 유지돼요.';
      const grid = document.createElement('div');
      grid.className = 'workspace-zoom-presets';
      const presets = [50, 75, 100, 125, 150, 200].map((percent) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workspace-button';
        button.textContent = `${percent}%`;
        button.addEventListener('click', () =>
          dispatcher.dispatch(`view:zoom-${percent}`),
        );
        grid.append(button);
        return { button, percent };
      });
      const fits = document.createElement('div');
      fits.className = 'workspace-zoom-fits';
      for (const [label, mode] of [
        ['폭 맞춤', 'fitWidth'],
        ['쪽 맞춤', 'fitPage'],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workspace-button';
        button.textContent = label;
        button.addEventListener('click', () => fit(mode));
        fits.append(button);
      }
      view.body.append(current, hint, grid, fits);
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'workspace-button workspace-primary';
      done.textContent = '완료';
      done.addEventListener('click', view.close);
      view.footer.append(done);
      const update = () => {
        const percent = parseInt(
          document.getElementById('sb-zoom-val')?.textContent ??
            trigger.textContent ??
            '100',
          10,
        );
        current.textContent = `현재 ${percent}%`;
        presets.forEach((item) =>
          item.button.setAttribute(
            'aria-pressed',
            String(percent === item.percent),
          ),
        );
      };
      const stop = bus.on('zoom-level-display', () => queueMicrotask(update));
      view.dialog.addEventListener('close', stop, { once: true });
      update();
    },
    true,
  );
}
