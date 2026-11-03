import type { WasmBridge } from '@/core/wasm-bridge';
import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';
import type { DocumentDirtyState } from '@/core/document-dirty-state';
import {
  workspaceIcon as icon,
  installWorkspaceToolbarIcons,
} from './workspace-icons';

export function installWorkspaceShell(
  wasm: WasmBridge,
  eventBus: EventBus,
  dispatcher: CommandDispatcher,
  state: DocumentDirtyState,
): void {
  const root = document.getElementById('studio-root')!;
  const top = document.createElement('div');
  top.className = 'workspace-topbar';
  top.innerHTML = `<div class="workspace-brand"><button class="workspace-icon-button" id="workspace-nav-toggle" aria-label="문서 패널 열기" aria-expanded="false" aria-controls="workspace-sidebar">${icon('layout')}</button><span class="workspace-wordmark">글결</span></div><div class="workspace-document-meta"><span id="workspace-title">문서를 준비하고 있어요</span><span class="workspace-save-status" id="workspace-save-status" role="status">엔진 로딩 중</span></div><div class="workspace-actions"><button class="workspace-button workspace-new" data-workspace-command="file:new-doc">${icon('plus')}<span>새 문서</span></button><button class="workspace-button" data-workspace-command="file:open">${icon('folder')}<span>열기</span></button><button class="workspace-button workspace-primary" data-workspace-command="file:save">${icon('download')}<span>파일 저장</span></button></div>`;
  const side = document.createElement('aside');
  side.id = 'workspace-sidebar';
  side.setAttribute('aria-label', '문서 작업 도구');
  side.innerHTML = `<div class="workspace-section-label">문서</div><div class="workspace-current"><span class="workspace-file-icon">${icon('document')}</span><div><span id="workspace-current-name">새 문서</span><span class="workspace-current-note" id="workspace-document-summary">브라우저에서 편집</span></div></div><div class="workspace-section-label workspace-section-gap">편집 도구</div><button class="workspace-side-action" data-workspace-command="edit:find">${icon('search')}<span>문서에서 찾기</span><kbd>Ctrl F</kbd></button><button class="workspace-side-action" data-workspace-command="file:page-setup">${icon('page')}<span>편집 용지</span><kbd>F7</kbd></button><button class="workspace-side-action" data-workspace-command="file:print-to-pdf">${icon('download')}<span>PDF로 저장</span></button><div class="workspace-sidebar-bottom"><details class="workspace-help"><summary>이용 안내</summary><p>문서는 이 브라우저에서 편집해요. 파일 저장을 누르면 편집본을 내려받을 수 있어요.</p><p>Ctrl S 파일 저장<br>Ctrl Z 되돌리기<br>Ctrl Shift Z 다시 실행</p></details><a class="workspace-source" href="https://github.com/boclair98/rhwp-workspace" target="_blank" rel="noopener noreferrer"><span>RHWP 기반 · MIT 라이선스</span>${icon('external')}</a></div>`;
  root.prepend(side);
  root.prepend(top);
  installWorkspaceToolbarIcons();
  const toggle = top.querySelector<HTMLButtonElement>('#workspace-nav-toggle')!;
  const close = () => {
    root.classList.remove('workspace-nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = root.classList.toggle('workspace-nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
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
          menu.querySelector<HTMLElement>('.menu-title')?.click();
        }
      });
    });
  update();
}
