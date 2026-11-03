import type { WasmBridge } from '@/core/wasm-bridge';
import type { EventBus } from '@/core/event-bus';
import type { CommandDispatcher } from '@/command/dispatcher';
import type { DocumentDirtyState } from '@/core/document-dirty-state';

const paths: Record<string,string> = {
  document:'M7 3h7l4 4v14H7z M14 3v5h5 M10 12h5 M10 16h5',
  open:'M3 8h7l2 2h9l-3 10H3z M3 8V5h7l2 3',
  save:'M5 3h13l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8',
  plus:'M12 5v14 M5 12h14',
  search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  layout:'M3 4h18v16H3z M9 4v16',
  page:'M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h4',
  download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  arrow:'M7 17L17 7 M7 7h10v10',
  code:'M8 8l-4 4 4 4 M16 8l4 4-4 4 M14 4l-4 16',
};
function icon(name:string):string {return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.document}"/></svg>`;}

export function installWorkspaceShell(wasm:WasmBridge,eventBus:EventBus,dispatcher:CommandDispatcher,state:DocumentDirtyState):void {
  const root=document.getElementById('studio-root')!;
  const top=document.createElement('div');
  top.className='workspace-topbar';
  top.innerHTML=`<div class="workspace-brand"><button class="workspace-icon-button" id="workspace-nav-toggle" aria-label="문서 패널 열기" aria-expanded="false" aria-controls="workspace-sidebar">${icon('layout')}</button><span class="workspace-mark" aria-hidden="true">ㄱ</span><span class="workspace-wordmark">글결<span class="workspace-brand-note">문서 작업 공간</span></span></div><div class="workspace-document-meta"><span id="workspace-title">문서를 준비하고 있어요</span><span class="workspace-save-status" id="workspace-save-status" role="status">엔진 로딩 중</span></div><div class="workspace-actions"><button class="workspace-button workspace-new" data-workspace-command="file:new-doc">${icon('plus')}<span>새 문서</span></button><button class="workspace-button" data-workspace-command="file:open">${icon('open')}<span>열기</span></button><button class="workspace-button workspace-primary" data-workspace-command="file:save">${icon('save')}<span>파일 저장</span></button></div>`;
  const side=document.createElement('aside');
  side.id='workspace-sidebar';side.setAttribute('aria-label','문서 작업 도구');
  side.innerHTML=`<div class="workspace-section-label">작업 공간</div><div class="workspace-current"><span class="workspace-file-icon">${icon('document')}</span><div><span id="workspace-current-name">새 문서</span><span class="workspace-current-note" id="workspace-document-summary">브라우저에서 편집</span></div><span class="workspace-current-dot" aria-hidden="true"></span></div><div class="workspace-section-label workspace-section-gap">문서 도구</div><button class="workspace-side-action" data-workspace-command="edit:find">${icon('search')}<span>문서에서 찾기</span><kbd>Ctrl F</kbd></button><button class="workspace-side-action" data-workspace-command="file:page-setup">${icon('page')}<span>편집 용지</span><kbd>F7</kbd></button><button class="workspace-side-action" data-workspace-command="file:print-to-pdf">${icon('download')}<span>PDF로 저장</span></button><div class="workspace-sidebar-bottom"><details class="workspace-help"><summary>작업 공간 안내</summary><p>문서는 이 브라우저에서 편집합니다. 저장 버튼으로 파일을 내려받으세요.</p><p>Ctrl S 저장<br>Ctrl Z 되돌리기<br>Ctrl Shift Z 다시 실행</p></details><div class="workspace-local-note"><span></span>파일을 서버에 올리지 않아요</div><a class="workspace-source" href="https://github.com/boclair98/rhwp-workspace" target="_blank" rel="noopener noreferrer">${icon('code')}<span>오픈소스 프로젝트<small>RHWP 기반 · MIT 라이선스</small></span>${icon('arrow')}</a></div>`;
  root.prepend(side);root.prepend(top);
  const toggle=top.querySelector<HTMLButtonElement>('#workspace-nav-toggle')!;
  const close=()=>{root.classList.remove('workspace-nav-open');toggle.setAttribute('aria-expanded','false');};
  toggle.addEventListener('click',()=>{const open=root.classList.toggle('workspace-nav-open');toggle.setAttribute('aria-expanded',String(open));});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('workspace-nav-open')){close();toggle.focus();}});
  const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-workspace-command]'));
  buttons.forEach(button=>button.addEventListener('click',()=>{dispatcher.dispatch(button.dataset.workspaceCommand!);if(matchMedia('(max-width:900px)').matches)close();}));
  const update=()=>{
    const ready=wasm.hasLoadedDocument();
    const file=ready?wasm.fileName:'문서를 준비하고 있어요';
    const title=top.querySelector<HTMLElement>('#workspace-title')!;title.textContent=file;title.title=file;
    side.querySelector('#workspace-current-name')!.textContent=ready?file:'새 문서';
    side.querySelector('#workspace-document-summary')!.textContent=ready?`${wasm.pageCount}쪽 · ${wasm.getSourceFormat().toUpperCase()}`:'브라우저에서 편집';
    const status=top.querySelector<HTMLElement>('#workspace-save-status')!;
    status.textContent=!ready?'엔진 로딩 중':state.isDirty()?'수정됨 · 파일 저장 필요':'파일 변경 없음';
    status.classList.toggle('is-dirty',state.isDirty());
    buttons.forEach(button=>{button.disabled=!dispatcher.isEnabled(button.dataset.workspaceCommand!);});
  };
  ['command-state-changed','document-changed','document-loaded','document-dirty-changed'].forEach(name=>eventBus.on(name,update));
  new MutationObserver(update).observe(document.querySelector('title')!,{childList:true,subtree:true,characterData:true});
  document.querySelectorAll<HTMLElement>('#menu-bar > .menu-item').forEach(menu=>{
    menu.tabIndex=0;menu.setAttribute('role','menuitem');
    menu.addEventListener('keydown',e=>{if(e.target===menu&&(e.key==='Enter'||e.key===' ')){e.preventDefault();menu.querySelector<HTMLElement>('.menu-title')?.click();}});
  });
  update();
}
