import type { WritingDraft } from '../workspace/writing-draft-store';
import {
  listWritingDrafts, saveNamedWritingDraft, deleteNamedWritingDraft,
  exportWritingDrafts, importWritingDrafts, WRITING_DRAFT_LIMIT, WRITING_DRAFT_BACKUP_LIMIT, WRITING_DRAFT_LIBRARY_KEY,
  type SavedWritingDraft,
} from '../workspace/writing-draft-library';
import { WRITING_TEMPLATES } from '../workspace/writing-templates';

interface WritingLibraryOptions {
  current(): WritingDraft;
  restore(draft: WritingDraft): void;
  onOpenChange(open: boolean): void;
}

export function installWritingLibrary(host: HTMLElement, options: WritingLibraryOptions) {
  host.innerHTML = `
    <details class="workspace-draft-tools">
      <summary>초안 보관함 <span data-library-count></span></summary>
      <p class="workspace-ai-caption">여러 글을 이름별로 보관하고 이어 쓰세요.</p>
      <label for="writing-draft-name">초안 이름</label>
      <input id="writing-draft-name" type="text" maxlength="120" placeholder="예: 주말 모임 안내" autocomplete="off">
      <p class="workspace-ai-caption" data-library-active></p>
      <div class="workspace-draft-actions"><button type="button" class="workspace-button workspace-primary" data-library-save>초안 보관</button><button type="button" class="workspace-button" data-library-copy hidden>새 초안으로 보관</button></div>
      <p class="workspace-library-feedback" data-library-feedback role="status" aria-live="polite" tabindex="-1"></p>
      <section class="workspace-draft-confirm" data-library-confirm hidden aria-label="초안 작업 확인">
        <h3 data-library-confirm-title></h3><p data-library-confirm-message></p>
        <div class="workspace-draft-actions"><button type="button" class="workspace-button workspace-primary" data-library-accept></button><button type="button" class="workspace-button" data-library-cancel>취소</button></div>
      </section>
      <div class="workspace-library-heading"><h3>보관한 초안</h3><span data-library-total></span></div>
      <label for="writing-draft-search" class="workspace-library-search-label">초안 찾기</label>
      <input id="writing-draft-search" type="search" placeholder="이름으로 찾기" autocomplete="off">
      <ul class="workspace-writing-list" aria-label="보관한 초안" data-library-list></ul>
      <p class="workspace-ai-caption" data-library-empty></p>
      <details class="workspace-draft-transfer"><summary>초안 백업·이전</summary>
        <p class="workspace-ai-caption">글과 요청 문구가 담긴 초안 파일을 내려받아 다른 PC에서 가져올 수 있어요. 한글 문서 파일 저장은 별도예요.</p>
        <div class="workspace-draft-actions"><button type="button" class="workspace-button" data-library-export>초안 백업</button><button type="button" class="workspace-button" data-library-import>초안 가져오기</button></div>
        <input type="file" accept=".json,application/json" aria-label="초안 백업 파일" data-library-file hidden>
      </details>
      <p class="workspace-ai-caption workspace-library-footnote">최대 ${WRITING_DRAFT_LIMIT}개 · 이 브라우저에만 보관돼요.</p>
    </details>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const details = find<HTMLDetailsElement>('.workspace-draft-tools');
  const summary = find<HTMLElement>('.workspace-draft-tools > summary');
  const name = find<HTMLInputElement>('#writing-draft-name');
  const search = find<HTMLInputElement>('#writing-draft-search');
  const list = find<HTMLUListElement>('[data-library-list]');
  const feedback = find('[data-library-feedback]');
  const save = find<HTMLButtonElement>('[data-library-save]');
  const copy = find<HTMLButtonElement>('[data-library-copy]');
  const confirm = find('[data-library-confirm]');
  const accept = find<HTMLButtonElement>('[data-library-accept]');
  const cancel = find<HTMLButtonElement>('[data-library-cancel]');
  const file = find<HTMLInputElement>('[data-library-file]');
  let active: SavedWritingDraft | null = null;
  let entries: SavedWritingDraft[] = [];
  let pending: { kind: 'load' | 'delete'; entry: SavedWritingDraft; trigger: HTMLElement } | null = null;

  const say = (message: string, error = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', error);
    if (error) { feedback.focus({ preventScroll: true }); feedback.scrollIntoView({ block: 'nearest' }); }
  };
  const syncActive = () => {
    save.textContent = active ? '변경 보관' : '초안 보관';
    copy.hidden = !active;
    find('[data-library-active]').textContent = active ? `이어서 쓰는 초안 · ${active.name}` : '보관 버튼을 눌러야 작성한 내용이 남아요.';
  };
  const cancelPending = () => { pending = null; confirm.hidden = true; };
  const close = (restoreFocus = true) => {
    cancelPending();
    details.open = false;
    options.onOpenChange(false);
    if (restoreFocus) summary.focus();
  };
  const ask = (kind: 'load' | 'delete', entry: SavedWritingDraft, trigger: HTMLElement) => {
    pending = { kind, entry, trigger };
    confirm.hidden = false;
    find('[data-library-confirm-title]').textContent = entry.name;
    find('[data-library-confirm-message]').textContent = kind === 'load'
      ? '지금 작성 중인 내용을 이 초안으로 바꿀까요? 보관하지 않은 작성 내용은 바뀌고, 문서 내용은 그대로예요.'
      : '보관함에서 이 초안을 삭제할까요? 문서와 지금 작성 중인 내용은 그대로예요.';
    accept.textContent = kind === 'load' ? '불러오기' : '삭제하기';
    accept.classList.toggle('workspace-library-danger', kind === 'delete');
    (kind === 'delete' ? cancel : accept).focus();
  };
  const renderList = () => {
    const query = search.value.trim().toLocaleLowerCase('ko');
    const visible = entries.filter(entry => entry.name.toLocaleLowerCase('ko').includes(query));
    list.replaceChildren();
    find('[data-library-count]').textContent = entries.length ? String(entries.length) : '';
    find('[data-library-total]').textContent = `${entries.length} / ${WRITING_DRAFT_LIMIT}`;
    find('[data-library-empty]').textContent = !entries.length ? '아직 보관한 초안이 없어요. 작성 중인 글부터 보관해 보세요.' : !visible.length ? '이름이 맞는 초안이 없어요. 다른 이름으로 찾아보세요.' : '';
    find<HTMLButtonElement>('[data-library-export]').disabled = entries.length === 0;
    for (const entry of visible) {
      const row = document.createElement('li'); row.className = 'workspace-writing-list-row';
      const load = document.createElement('button'); load.type = 'button'; load.className = 'workspace-writing-list-open';
      load.setAttribute('aria-label', `${entry.name} 불러오기`);
      const title = document.createElement('strong'); title.textContent = entry.name;
      const meta = document.createElement('span');
      const kind = entry.draft.mode === 'rewrite' ? '문장 다듬기' : WRITING_TEMPLATES.find(item => item.id === entry.draft.templateId)?.label ?? '새 글';
      meta.textContent = `${kind} · ${entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '이전 버전에서 보관'}`;
      load.append(title, meta);
      load.addEventListener('click', () => ask('load', entry, load));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'workspace-button workspace-writing-list-delete'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${entry.name} 삭제`);
      remove.addEventListener('click', () => ask('delete', entry, remove));
      row.append(load, remove); list.append(row);
    }
  };
  const refresh = () => {
    try { entries = listWritingDrafts(); renderList(); return true; }
    catch (error) { say((error as Error).message, details.open); return false; }
  };
  const store = (asNew: boolean) => {
    cancelPending();
    if (!name.value.trim()) { say('나중에 찾기 쉽도록 초안 이름을 적어 주세요.'); name.focus(); return; }
    try {
      const saved = saveNamedWritingDraft({ name: name.value, draft: options.current(),
        ...(!asNew && active ? { id: active.id, expectedUpdatedAt: active.updatedAt } : {}) });
      active = saved; name.value = saved.name; syncActive(); refresh();
      say(`‘${saved.name}’ 초안을 보관했어요.`);
    } catch (error) { say((error as Error).message, true); }
  };
  save.addEventListener('click', () => store(false));
  copy.addEventListener('click', () => store(true));
  search.addEventListener('input', renderList);
  const cancelConfirmation = () => {
    const trigger = pending?.trigger; cancelPending(); (trigger?.isConnected ? trigger : search).focus();
  };
  cancel.addEventListener('click', cancelConfirmation);
  host.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || !details.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (pending) cancelConfirmation(); else close();
  });
  accept.addEventListener('click', () => {
    if (!pending) return;
    const action = pending;
    try {
      if (action.kind === 'delete') {
        deleteNamedWritingDraft(action.entry.id, action.entry.updatedAt);
        if (active?.id === action.entry.id) { active = null; syncActive(); }
        cancelPending(); refresh(); search.focus(); say(`‘${action.entry.name}’ 초안을 삭제했어요.`);
      } else {
        const current = listWritingDrafts().find(entry => entry.id === action.entry.id);
        if (!current || current.updatedAt !== action.entry.updatedAt) throw new Error('다른 창에서 이 초안이 바뀌었어요. 목록에서 다시 골라 주세요.');
        close(false);
        options.restore(current.draft);
        active = current; name.value = current.name; syncActive(); say('');
      }
    } catch (error) { details.open = true; cancelPending(); refresh(); say((error as Error).message, true); }
  });
  find('[data-library-export]').addEventListener('click', () => {
    try {
      const json = exportWritingDrafts();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = '오픈소스한글-초안백업.json';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      say('초안 백업 파일을 내려받도록 요청했어요. 다운로드 목록에서 확인해 주세요.');
    } catch (error) { say((error as Error).message, true); }
  });
  find('[data-library-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; file.value = '';
    if (!selected) return;
    const button = find<HTMLButtonElement>('[data-library-import]'); button.disabled = true;
    try {
      if (selected.size > WRITING_DRAFT_BACKUP_LIMIT) throw new Error('초안 백업 파일은 500KB 이하로 골라 주세요.');
      const result = importWritingDrafts(await selected.text());
      cancelPending(); refresh();
      say(`초안 ${result.added}개를 가져왔어요.${result.skipped ? ` 같은 초안 ${result.skipped}개는 건너뛰었어요.` : ''} 작성 중인 글과 문서는 그대로예요.`);
    } catch (error) { say((error as Error).message, true); }
    finally {
      button.disabled = false;
      if (details.open && document.activeElement === document.body) button.focus();
    }
  });
  details.addEventListener('toggle', () => {
    options.onOpenChange(details.open);
    if (!details.open) { cancelPending(); return; }
    refresh();
    if (!name.value) {
      const draft = options.current();
      const fields = draft.templateValues[draft.templateId];
      const suggestion = draft.preview?.text.split('\n')[0] || fields?.title || fields?.name || draft.manual.split('\n')[0];
      if (suggestion) name.value = Array.from(suggestion.trim()).slice(0, 60).join('');
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === WRITING_DRAFT_LIBRARY_KEY || event.key === 'rhwp.writing-draft' || event.key === null) {
      cancelPending(); refresh();
      if (active && !entries.some(entry => entry.id === active!.id && entry.updatedAt === active!.updatedAt)) {
        say('다른 창에서 보관함이 바뀌었어요. 작성한 글은 남아 있어요. 새 초안으로 보관하거나 다시 불러와 주세요.');
      }
    }
  });
  syncActive(); refresh();
  return { close, resetActive() { active = null; name.value = ''; cancelPending(); syncActive(); } };
}
