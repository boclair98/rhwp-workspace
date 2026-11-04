import type { WasmBridge } from '@/core/wasm-bridge';
import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';
import type { DocumentDirtyState } from '@/core/document-dirty-state';
import {
  workspaceIcon as icon,
  installWorkspaceToolbarIcons,
} from './workspace-icons';
import { installEditorTools } from './workspace-editor-tools';

export function installWorkspaceShell(
  wasm: WasmBridge,
  eventBus: EventBus,
  dispatcher: CommandDispatcher,
  state: DocumentDirtyState,
): void {
  const root = document.getElementById('studio-root')!;
  const top = document.createElement('div');
  top.className = 'workspace-topbar';
  top.innerHTML = `<div class="workspace-brand"><button class="workspace-icon-button" id="workspace-nav-toggle" aria-label="문서 패널 열기" aria-expanded="false" aria-controls="workspace-sidebar">${icon('layout')}</button><span class="workspace-wordmark">오픈소스 한글</span></div><div class="workspace-document-meta"><span id="workspace-title">문서를 준비하고 있어요</span><span class="workspace-save-status" id="workspace-save-status" role="status">엔진 로딩 중</span></div><div class="workspace-actions"><button class="workspace-button workspace-new" data-workspace-command="file:new-doc">${icon('plus')}<span>새 문서</span></button><button class="workspace-button" data-workspace-command="file:open">${icon('folder')}<span>열기</span></button><button class="workspace-button workspace-primary" data-workspace-command="file:save">${icon('download')}<span>파일 저장</span></button></div>`;
  const side = document.createElement('aside');
  side.id = 'workspace-sidebar';
  side.setAttribute('aria-label', '문서 작업 도구');
  side.innerHTML = `<div class="workspace-section-label">문서</div><div class="workspace-current"><span class="workspace-file-icon">${icon('document')}</span><div><span id="workspace-current-name">새 문서</span><span class="workspace-current-note" id="workspace-document-summary">브라우저에서 편집</span></div></div><div class="workspace-section-label workspace-section-gap">편집 도구</div><button class="workspace-side-action" data-workspace-command="edit:find">${icon('search')}<span>문서에서 찾기</span><kbd>Ctrl F</kbd></button><button class="workspace-side-action" data-workspace-command="file:page-setup">${icon('page')}<span>편집 용지</span><kbd>F7</kbd></button><button class="workspace-side-action" data-workspace-command="file:print-to-pdf">${icon('download')}<span>PDF로 저장</span></button><div class="workspace-sidebar-bottom"><details class="workspace-help"><summary>이용 안내</summary><p>RHWP 기반 독립 오픈소스 편집기입니다. 한컴의 공식 제품이나 제휴 서비스가 아닙니다.</p><p>문서는 이 브라우저에서 편집해요. 파일 저장을 누르면 편집본을 내려받을 수 있어요.</p><p>Ctrl S 파일 저장<br>Ctrl Z 되돌리기<br>Ctrl Shift Z 다시 실행</p></details><a class="workspace-source" href="https://github.com/boclair98/rhwp-workspace" target="_blank" rel="noopener noreferrer"><span>RHWP 기반 · MIT 라이선스</span>${icon('external')}</a></div>`;
  root.prepend(side);
  root.prepend(top);
  installWorkspaceToolbarIcons();
  installEditorTools(wasm, eventBus, dispatcher);
  const toggle = top.querySelector<HTMLButtonElement>('#workspace-nav-toggle')!;
  const smallScreen = matchMedia('(max-width:900px)');
  try {
    root.classList.toggle(
      'workspace-sidebar-collapsed',
      localStorage.getItem('geulgyeol-sidebar') === 'collapsed',
    );
  } catch {}
  const scrim = document.createElement('div');
  scrim.className = 'workspace-nav-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  root.append(scrim);
  const syncNavigation = () => {
    const modal =
      smallScreen.matches && root.classList.contains('workspace-nav-open');
    const expanded = smallScreen.matches
      ? modal
      : !root.classList.contains('workspace-sidebar-collapsed');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute(
      'aria-label',
      expanded ? '문서 패널 닫기' : '문서 패널 열기',
    );
    side.setAttribute('role', modal ? 'dialog' : 'complementary');
    if (modal) side.setAttribute('aria-modal', 'true');
    else side.removeAttribute('aria-modal');
    document.getElementById('editor-area')!.inert = modal;
    document.getElementById('studio-header')!.inert = modal;
  };
  const close = () => {
    root.classList.remove('workspace-nav-open');
    syncNavigation();
  };
  toggle.addEventListener('click', () => {
    if (smallScreen.matches) {
      const open = root.classList.toggle('workspace-nav-open');
      syncNavigation();
      if (open)
        side.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    } else {
      const collapsed = root.classList.toggle('workspace-sidebar-collapsed');
      try {
        localStorage.setItem(
          'geulgyeol-sidebar',
          collapsed ? 'collapsed' : 'open',
        );
      } catch {}
      syncNavigation();
    }
  });
  scrim.addEventListener('click', () => {
    close();
    toggle.focus();
  });
  side.addEventListener('keydown', (event) => {
    if (
      !smallScreen.matches ||
      !root.classList.contains('workspace-nav-open') ||
      event.key !== 'Tab'
    )
      return;
    const targets = [
      ...side.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],summary',
      ),
    ].filter((node) => node.getClientRects().length > 0);
    if (event.shiftKey && document.activeElement === targets[0]) {
      event.preventDefault();
      targets.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === targets.at(-1)) {
      event.preventDefault();
      targets[0]?.focus();
    }
  });
  smallScreen.addEventListener('change', syncNavigation);
  new MutationObserver(syncNavigation).observe(root, {
    attributes: true,
    attributeFilter: ['class'],
  });
  syncNavigation();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('workspace-nav-open')) {
      close();
      toggle.focus();
    }
  });
  const buttons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-workspace-command]'),
  );
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      dispatcher.dispatch(button.dataset.workspaceCommand!);
      if (matchMedia('(max-width:900px)').matches) close();
    }),
  );
  const update = () => {
    const ready = wasm.hasLoadedDocument();
    const file = ready ? wasm.fileName : '문서를 준비하고 있어요';
    const title = top.querySelector<HTMLElement>('#workspace-title')!;
    title.textContent = file;
    title.title = file;
    side.querySelector('#workspace-current-name')!.textContent = ready
      ? file
      : '새 문서';
    side.querySelector('#workspace-document-summary')!.textContent = ready
      ? `${wasm.pageCount}쪽 · ${wasm.getSourceFormat().toUpperCase()}`
      : '브라우저에서 편집';
    const status = top.querySelector<HTMLElement>('#workspace-save-status')!;
    status.textContent = !ready
      ? '엔진 로딩 중'
      : state.isDirty()
        ? '수정됨 · 파일 저장 필요'
        : '파일 변경 없음';
    status.classList.toggle('is-dirty', state.isDirty());
    buttons.forEach((button) => {
      button.disabled = !dispatcher.isEnabled(button.dataset.workspaceCommand!);
    });
  };
  [
    'command-state-changed',
    'document-changed',
    'document-loaded',
    'document-dirty-changed',
  ].forEach((name) => eventBus.on(name, update));
  new MutationObserver(update).observe(document.querySelector('title')!, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document
    .querySelectorAll<HTMLElement>('#menu-bar > .menu-item')
    .forEach((menu) => {
      menu.tabIndex = 0;
      menu.setAttribute('role', 'menuitem');
      menu.addEventListener('keydown', (e) => {
        if (e.target === menu && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          menu
            .querySelector<HTMLElement>('.menu-title')
            ?.dispatchEvent(
              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
            );
          e.stopPropagation();
        }
      });
    });
  update();
}
