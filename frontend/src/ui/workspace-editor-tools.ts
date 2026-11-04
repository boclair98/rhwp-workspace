import type { WasmBridge } from '../core/wasm-bridge';
import type { EventBus } from '../core/event-bus';
import type { CommandDispatcher } from '../command/dispatcher';
import { workspaceIcon } from './workspace-icons';
import { workspaceDialog } from './workspace-dialog';

type Binding = {
  button: HTMLButtonElement;
  command?: string;
  nativeId?: string;
};
export function installEditorTools(
  wasm: WasmBridge,
  bus: EventBus,
  dispatcher: CommandDispatcher,
) {
  const root = document.getElementById('studio-root')!;
  const header = document.getElementById('studio-header')!;
  const bar = document.createElement('div');
  bar.id = 'workspace-quickbar';
  bar.setAttribute('aria-label', '간편 편집');
  const bindings: Binding[] = [];
  const mirrors: (() => void)[] = [];
  let scheduled = false;
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        sync();
      });
    }
  };
  const button = (label: string, icon: string, run: () => void, text = '') => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'workspace-tool-button';
    node.setAttribute('aria-label', label);
    node.title = label;
    node.innerHTML = workspaceIcon(icon);
    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      node.append(span);
    }
    node.addEventListener('mousedown', (event) => event.preventDefault());
    node.addEventListener('click', () => {
      run();
      schedule();
    });
    return node;
  };
  const command = (label: string, icon: string, id: string, text = '') => {
    const node = button(label, icon, () => dispatcher.dispatch(id), text);
    bindings.push({ button: node, command: id });
    return node;
  };
  const nativeButton = (label: string, icon: string, nativeId: string) => {
    const node = button(label, icon, () =>
      document.getElementById(nativeId)?.click(),
    );
    bindings.push({ button: node, nativeId });
    return node;
  };
  const group = (label: string, controls: HTMLButtonElement[]) => {
    const node = document.createElement('div');
    node.className = 'workspace-tool-group';
    node.setAttribute('role', 'toolbar');
    node.setAttribute('aria-label', label);
    controls.forEach((control, index) => {
      control.tabIndex = index === 0 ? 0 : -1;
      control.addEventListener('focus', () =>
        controls.forEach((item) => (item.tabIndex = item === control ? 0 : -1)),
      );
    });
    node.addEventListener('keydown', (event) => {
      if (
        !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
        !(event.target instanceof HTMLButtonElement)
      )
        return;
      const enabled = controls.filter((control) => !control.disabled);
      if (!enabled.length) return;
      event.preventDefault();
      event.stopPropagation();
      const index = enabled.indexOf(event.target);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) %
              enabled.length;
      enabled[next].focus();
    });
    node.append(...controls);
    return node;
  };
  const fontFields = (mobile = false) => {
    const fields = document.createElement('div');
    fields.className = 'workspace-font-fields';
    const fontLabel = document.createElement('label');
    fontLabel.textContent = '글꼴';
    const font = document.createElement('select');
    font.setAttribute('aria-label', '글꼴');
    fontLabel.append(font);
    font.addEventListener('change', () => {
      const source = document.getElementById(
        'font-name',
      ) as HTMLSelectElement | null;
      if (source) {
        source.value = font.value;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        schedule();
      }
    });
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = '크기';
    const size = document.createElement('input');
    size.type = 'text';
    size.inputMode = 'decimal';
    size.setAttribute('aria-label', '글자 크기');
    size.title = '1~4096pt · Enter로 적용';
    const suffix = document.createElement('span');
    suffix.textContent = 'pt';
    const sizeWrap = document.createElement('span');
    sizeWrap.className = 'workspace-size-field';
    sizeWrap.append(size, suffix);
    sizeLabel.append(sizeWrap);
    const apply = () => {
      const value = Number(size.value);
      if (
        !/^\d+(\.\d+)?$/.test(size.value.trim()) ||
        value < 1 ||
        value > 4096
      ) {
        size.setCustomValidity('글자 크기는 1~4096pt로 입력해 주세요.');
        size.setAttribute('aria-invalid', 'true');
        size.reportValidity();
        return;
      }
      size.setCustomValidity('');
      size.removeAttribute('aria-invalid');
      const source = document.getElementById(
        'font-size',
      ) as HTMLInputElement | null;
      if (source) {
        source.value = String(value);
        source.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          }),
        );
        schedule();
      }
    };
    size.addEventListener('change', apply);
    size.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        apply();
      }
      if (event.key === 'Escape') {
        size.setCustomValidity('');
        size.removeAttribute('aria-invalid');
        size.value =
          (document.getElementById('font-size') as HTMLInputElement)?.value ??
          '';
      }
    });
    let signature = '';
    mirrors.push(() => {
      if (!fields.isConnected) return;
      const source = document.getElementById(
        'font-name',
      ) as HTMLSelectElement | null;
      const originalSize = document.getElementById(
        'font-size',
      ) as HTMLInputElement | null;
      font.disabled = size.disabled = !wasm.hasLoadedDocument();
      if (source) {
        const next = [...source.options]
          .map((option) => option.value + ':' + option.text)
          .join('|');
        if (next !== signature) {
          font.replaceChildren(
            ...[...source.options].map((option) => {
              const item = document.createElement('option');
              item.value = option.value;
              item.textContent = option.text.replace(/^◆\s*/, '대표 글꼴 · ');
              return item;
            }),
          );
          signature = next;
        }
        if (document.activeElement !== font) font.value = source.value;
      }
      if (
        originalSize &&
        document.activeElement !== size &&
        !size.hasAttribute('aria-invalid')
      )
        size.value = originalSize.value;
    });
    fields.append(fontLabel, sizeLabel);
    if (mobile)
      fields.append(button('입력한 글자 크기 적용', 'check', apply, '적용'));
    return fields;
  };
  const charGroup = () =>
    group('글자 서식', [
      nativeButton('굵게 (Ctrl+B)', 'bold', 'btn-bold'),
      nativeButton('기울임 (Ctrl+I)', 'italic', 'btn-italic'),
      nativeButton('밑줄 (Ctrl+U)', 'underline', 'btn-underline'),
    ]);
  const alignGroup = () =>
    group('문단 정렬', [
      nativeButton('왼쪽 정렬', 'align', 'btn-align-left'),
      nativeButton('가운데 정렬', 'align-center', 'btn-align-center'),
      nativeButton('오른쪽 정렬', 'align-right', 'btn-align-right'),
    ]);
  bar.append(
    group('실행 취소와 다시 실행', [
      command('되돌리기 (Ctrl+Z)', 'undo', 'edit:undo'),
      command('다시 실행 (Ctrl+Shift+Z)', 'redo', 'edit:redo'),
    ]),
  );
  const desktop = document.createElement('div');
  desktop.className = 'workspace-desktop-tools';
  desktop.append(
    fontFields(),
    charGroup(),
    alignGroup(),
    command('표 만들기', 'table', 'table:create', '표'),
    command('문서에서 찾기 (Ctrl+F)', 'search', 'edit:find'),
  );
  bar.append(desktop);
  const mobile = document.createElement('div');
  mobile.className = 'workspace-mobile-tools';
  const format = button(
    '글자와 문단 서식',
    'settings',
    () => {
      const bindingStart = bindings.length,
        mirrorStart = mirrors.length;
      const view = workspaceDialog('글자와 문단', format);
      view.dialog.addEventListener(
        'close',
        () => {
          bindings.splice(bindingStart);
          mirrors.splice(mirrorStart);
        },
        { once: true },
      );
      view.dialog.classList.add('workspace-format-dialog');
      view.body.append(fontFields(true), charGroup(), alignGroup());
      const zooms = document.createElement('div');
      zooms.className = 'workspace-format-zoom';
      zooms.append(
        command('원본 배율 100%', 'zoom', 'view:zoom-100', '100%'),
        command('문서 폭 맞춤', 'fit', 'view:zoom-fit-width', '폭 맞춤'),
      );
      view.body.append(zooms);
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'workspace-button workspace-primary';
      done.textContent = '완료';
      done.addEventListener('click', view.close);
      view.footer.append(done);
      sync();
    },
    '서식',
  );
  mobile.append(
    format,
    command('문서 폭 맞춤', 'fit', 'view:zoom-fit-width', '폭 맞춤'),
  );
  bar.append(mobile);
  const advanced = button(
    '전체 도구 펼치기',
    'settings',
    () => setAdvanced(!root.classList.contains('workspace-advanced')),
    '전체 도구',
  );
  advanced.id = 'workspace-tools-toggle';
  advanced.setAttribute('aria-expanded', 'false');
  advanced.setAttribute('aria-controls', 'menu-bar icon-toolbar style-bar');
  bar.append(advanced);
  const setAdvanced = (open: boolean) => {
    root.classList.toggle('workspace-advanced', open);
    advanced.setAttribute('aria-expanded', String(open));
    advanced.setAttribute(
      'aria-label',
      open ? '전체 도구 접기' : '전체 도구 펼치기',
    );
    advanced.title = open ? '전체 도구 접기' : '전체 도구 펼치기';
    advanced.lastElementChild!.textContent = open ? '간편 도구' : '전체 도구';
  };
  header.prepend(bar);
  root.classList.add('workspace-compact');
  header.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      root.classList.contains('workspace-advanced') &&
      !header.querySelector('.menu-item.open')
    ) {
      setAdvanced(false);
      advanced.focus();
      event.stopPropagation();
    }
  });
  function sync() {
    for (const binding of bindings) {
      if (!binding.button.isConnected) continue;
      const source = binding.nativeId
        ? (document.getElementById(
            binding.nativeId,
          ) as HTMLButtonElement | null)
        : null;
      binding.button.disabled = binding.command
        ? !dispatcher.isEnabled(binding.command)
        : !wasm.hasLoadedDocument() || !!source?.disabled;
      if (source) {
        const active = source.classList.contains('active');
        binding.button.classList.toggle('active', active);
        binding.button.setAttribute('aria-pressed', String(active));
      }
    }
    for (const toolbar of bar.querySelectorAll<HTMLElement>(
      '[role="toolbar"]',
    )) {
      const enabled = [
        ...toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      ];
      if (enabled.length && !enabled.some((node) => node.tabIndex === 0))
        enabled[0].tabIndex = 0;
    }
    format.disabled = !wasm.hasLoadedDocument();
    mirrors.forEach((mirror) => mirror());
  }
  [
    'command-state-changed',
    'document-changed',
    'document-swapped',
    'cursor-format-changed',
    'cursor-para-changed',
    'document-loaded',
  ].forEach((name) => bus.on(name, schedule));
  new MutationObserver(schedule).observe(
    document.getElementById('style-bar')!,
    { subtree: true, attributes: true, childList: true },
  );
  const narrowScreen = matchMedia('(max-width:900px)');
  const fitNewDocument = () => {
    if (narrowScreen.matches && wasm.hasLoadedDocument())
      requestAnimationFrame(() => dispatcher.dispatch('view:zoom-fit-width'));
  };
  bus.on('document-loaded', fitNewDocument);
  narrowScreen.addEventListener('change', fitNewDocument);
  fitNewDocument();
  sync();
}
