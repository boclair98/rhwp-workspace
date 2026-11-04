import { workspaceDialog as panel } from '../ui/workspace-dialog';
import type { WasmBridge } from '../core/wasm-bridge';
import type { EventBus } from '../core/event-bus';
import type { DocumentDirtyState } from '../core/document-dirty-state';
import type { CommandDispatcher } from '../command/dispatcher';
import { listAutosaveDrafts } from '../recovery/autosave-store';
import {
  createLibraryDocument,
  MAX_BACKUP_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_LIBRARY_BYTES,
  MAX_DOCUMENTS,
  normalizeFileName,
  type LibraryDocument,
} from './library-model';
import {
  deleteDocument,
  importWorkspace,
  listDocuments,
  saveDocument,
  listArchivedHistory,
} from './library-store';
import {
  createArchivedHistory,
  decodeWorkspaceBackup,
  encodeWorkspaceBackup,
  type ArchivedHistory,
} from './history-backup';
import { listHistoryMeta, getHistoryPayload } from '../history/idb-store';
import { workspaceIcon } from '../ui/workspace-icons';

function withIcon(button: HTMLButtonElement, name: string): HTMLButtonElement {
  const icon = document.createElement('span');
  icon.className = 'workspace-action-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = workspaceIcon(name);
  button.prepend(icon);
  return button;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(
  text: string,
  action: () => void,
  className = 'workspace-button',
): HTMLButtonElement {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function download(data: Blob, name: string): void {
  const url = URL.createObjectURL(data);
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '작업을 완료하지 못했습니다. 파일 저장으로 내려받고 다시 시도해 주세요.';
}
const formatTime = (time: number) =>
  new Date(time).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function installDocumentLibrary(
  wasm: WasmBridge,
  eventBus: EventBus,
  state: DocumentDirtyState,
  dispatcher: CommandDispatcher,
  openDocument: (doc: LibraryDocument) => Promise<boolean>,
): void {
  const actions = document.querySelector('.workspace-actions')!;
  const side = document.getElementById('workspace-sidebar')!;
  function closeNavigation(): void {
    document
      .getElementById('studio-root')
      ?.classList.remove('workspace-nav-open');
    document
      .getElementById('workspace-nav-toggle')
      ?.setAttribute('aria-expanded', 'false');
  }
  let currentId: string | null = null;
  let generation = wasm.documentGeneration;
  let revision = 0,
    savedRevision = -1,
    savedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  let saving = false,
    lastError = '';
  const status = el('div', '', 'workspace-library-status');
  status.setAttribute('role', 'status');
  const notice = el('div', '', 'workspace-notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.querySelector('.workspace-document-meta')!.append(status);
  const current = document.querySelector('.workspace-current')!;
  current.after(notice);
  const storeButton = button(
    '보관',
    () => {
      void saveCurrent().catch(showFailure);
    },
    'workspace-button workspace-store',
  );
  storeButton.title = '현재 문서를 이 브라우저에 보관';
  withIcon(storeButton, 'save');
  actions.prepend(storeButton);
  const libraryButton = button(
    '내 문서',
    () => {
      void showLibrary();
    },
    'workspace-side-action workspace-library-open',
  );
  side.querySelector('.workspace-section-label')!.after(libraryButton);
  withIcon(libraryButton, 'folder');
  const renameButton = button('이름 변경', rename, 'workspace-rename');
  renameButton.title = '현재 문서 이름 변경';
  document.querySelector('.workspace-document-meta')!.append(renameButton);
  const hwpxButton = button(
    'HWPX로 내보내기',
    () => {
      closeNavigation();
      dispatcher.dispatch('file:save-as-hwpx');
    },
    'workspace-side-action',
  );
  side.querySelector('.workspace-sidebar-bottom')!.before(hwpxButton);
  const historyButton = button(
    '작업 이력',
    () => {
      closeNavigation();
      dispatcher.dispatch('edit:document-history');
    },
    'workspace-side-action',
  );
  hwpxButton.before(historyButton);
  withIcon(historyButton, 'history');
  withIcon(hwpxButton, 'download');
  function sync(): void {
    if (generation !== wasm.documentGeneration) {
      generation = wasm.documentGeneration;
      currentId = null;
      revision = 0;
      savedRevision = -1;
      savedAt = 0;
      lastError = '';
      clearTimeout(timer);
    }
    const ready = wasm.hasLoadedDocument();
    storeButton.disabled = !ready || saving;
    renameButton.disabled = !ready;
    hwpxButton.disabled = !ready;
    historyButton.disabled = !ready;
    status.textContent = lastError
      ? '보관 실패 · 파일 저장 필요'
      : saving
        ? '브라우저에 보관 중…'
        : currentId && savedRevision === revision
          ? `브라우저 보관됨 · ${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
          : currentId
            ? '브라우저 보관 대기'
            : '브라우저 미보관';
    if (state.isDirty()) status.textContent += ' · 파일 저장 필요';
    status.title = savedAt ? new Date(savedAt).toLocaleString('ko-KR') : '';
    status.classList.toggle('has-error', !!lastError);
  }
  function showFailure(error: unknown): void {
    lastError = errorText(error);
    notice.textContent = lastError;
    notice.hidden = false;
    sync();
  }
  function saveCurrent(): Promise<void> {
    clearTimeout(timer);
    const work = queue.then(async () => {
      sync();
      if (!wasm.hasLoadedDocument())
        throw new Error('문서가 준비된 뒤 다시 시도해 주세요.');
      if (wasm.requiresPasswordForSave)
        throw new Error(
          '암호 문서는 브라우저에 평문으로 보관하지 않습니다. 파일 저장을 사용해 주세요.',
        );
      const format = wasm.getSourceFormat();
      if (format !== 'hwp' && format !== 'hwpx')
        throw new Error('HWP/HWPX로 파일 저장한 뒤 다시 열어 보관해 주세요.');
      saving = true;
      sync();
      try {
        const artifact =
          format === 'hwpx'
            ? wasm.exportHwpxWithReport()
            : wasm.exportHwpWithReport();
        if (artifact.contentLoss.count)
          throw new Error(
            '보관 과정에서 내용 손실 가능성이 발견됐습니다. 원본을 유지하고 파일 메뉴에서 내보내기 안내를 확인해 주세요.',
          );
        const docGeneration = generation,
          docRevision = revision;
        const id = currentId ?? crypto.randomUUID();
        const row = await createLibraryDocument(
          wasm.fileName,
          artifact.bytes,
          format,
          id,
        );
        await saveDocument(row);
        if (wasm.documentGeneration === docGeneration) {
          currentId = id;
          savedRevision = docRevision;
          savedAt = row.updatedAt;
          lastError = '';
          notice.hidden = true;
        }
      } finally {
        saving = false;
        sync();
      }
    });
    queue = work.catch(() => {});
    return work;
  }
  function rename(): void {
    if (!wasm.hasLoadedDocument()) return;
    const format = wasm.getSourceFormat();
    if (format !== 'hwp' && format !== 'hwpx') {
      showFailure(
        new Error('HWP/HWPX로 저장한 문서의 이름을 변경할 수 있습니다.'),
      );
      return;
    }
    const view = panel('문서 이름 변경');
    const label = el('label', '문서 이름');
    const input = el('input');
    input.value = wasm.fileName;
    input.maxLength = 120;
    input.id = 'workspace-rename-input';
    label.htmlFor = input.id;
    const message = el('p', '', 'workspace-inline-error');
    message.setAttribute('role', 'alert');
    view.body.append(
      label,
      input,
      el('p', '확장자는 현재 문서 형식으로 유지됩니다.', 'workspace-muted'),
      message,
    );
    const apply = () => {
      try {
        wasm.fileName = normalizeFileName(input.value, format);
        state.markDirty('workspace-rename');
        eventBus.emit('command-state-changed');
        view.close();
        if (currentId) void saveCurrent().catch(showFailure);
      } catch (error) {
        message.textContent = errorText(error);
      }
    };
    view.footer.append(
      button('취소', view.close),
      button('이름 변경', apply, 'workspace-button workspace-primary'),
    );
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply();
      }
    });
    input.focus();
    input.select();
  }
  async function showLibrary(): Promise<void> {
    const view = panel('내 문서');
    const intro = el(
      'p',
      '이 브라우저에 보관한 문서입니다. 파일을 선택하면 이어서 편집할 수 있어요.',
      'workspace-muted',
    );
    const search = el('input');
    search.type = 'search';
    search.placeholder = '문서 이름으로 검색';
    search.setAttribute('aria-label', '보관 문서 검색');
    const summary = el('p', '', 'workspace-muted');
    const list = el('div', '', 'workspace-library-list');
    const options = el('div', '', 'workspace-library-options');
    const filters = el('div', '', 'workspace-library-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '문서 형식 필터');
    let format: 'all' | 'hwp' | 'hwpx' = 'all';
    const filterButtons = (['all', 'hwp', 'hwpx'] as const).map((value) => {
      const node = button(
        value === 'all' ? '전체' : value.toUpperCase(),
        () => {
          format = value;
          render();
        },
        'workspace-filter-button',
      );
      node.setAttribute('aria-pressed', String(value === 'all'));
      filters.append(node);
      return { value, node };
    });
    const sort = el('select');
    sort.setAttribute('aria-label', '문서 정렬');
    for (const [value, label] of [
      ['recent', '최근 수정순'],
      ['name', '이름순'],
    ]) {
      const option = el('option', label);
      option.value = value;
      sort.append(option);
    }
    sort.addEventListener('change', render);
    options.append(filters, sort);
    const message = el('p', '', 'workspace-inline-message');
    message.setAttribute('role', 'status');
    view.body.append(intro, search, options, summary, list, message);
    let rows: LibraryDocument[] = [];
    let history: ArchivedHistory[] = [];
    function render(): void {
      const usedBytes = [...rows, ...history].reduce(
        (n, row) => n + row.data.length,
        0,
      );
      const used =
        usedBytes < 1024 * 1024
          ? `${(usedBytes / 1024).toFixed(0)}KB`
          : `${(usedBytes / 1024 / 1024).toFixed(1)}MB`;
      summary.textContent = `문서 ${rows.length}개 · 이전 이력 ${history.length}개 · ${used} / 50MB`;
      list.replaceChildren();
      filterButtons.forEach((item) =>
        item.node.setAttribute('aria-pressed', String(format === item.value)),
      );
      const filtered = rows.filter(
        (row) =>
          (format === 'all' || row.format === format) &&
          row.fileName
            .toLocaleLowerCase()
            .includes(search.value.trim().toLocaleLowerCase()),
      );
      filtered.sort((a, b) =>
        sort.value === 'name'
          ? a.fileName.localeCompare(b.fileName, 'ko')
          : b.updatedAt - a.updatedAt,
      );
      if (!filtered.length) {
        list.append(
          el(
            'div',
            !rows.length
              ? '아직 보관한 문서가 없어요. 문서를 가져오거나 편집 화면에서 보관해 보세요.'
              : search.value.trim()
                ? '검색한 이름의 문서가 없어요. 다른 이름으로 찾아보세요.'
                : `${format.toUpperCase()} 문서가 없어요. 문서 가져오기로 추가해 보세요.`,
            'workspace-empty',
          ),
        );
        return;
      }
      for (const row of filtered) {
        const item = el('div', '', 'workspace-library-row');
        const fileIcon = el('span', '', 'workspace-library-file-icon');
        fileIcon.innerHTML = workspaceIcon('document');
        fileIcon.setAttribute('aria-hidden', 'true');
        const info = el('div', '', 'workspace-library-info');
        info.append(
          el('strong', row.fileName),
          el(
            'small',
            `${row.format.toUpperCase()} · ${(row.data.length / 1024).toFixed(1)}KB · ${formatTime(row.updatedAt)}`,
          ),
        );
        const open = button('열기', () => {
          void (async () => {
            view.close();
            try {
              await queue;
              const latest = (await listDocuments()).find(
                (item) => item.id === row.id,
              );
              if (!latest)
                throw new Error(
                  '보관본이 변경되었습니다. 내 문서에서 다시 선택해 주세요.',
                );
              if (await openDocument(latest)) {
                generation = wasm.documentGeneration;
                currentId = latest.id;
                savedRevision = revision;
                savedAt = latest.updatedAt;
                lastError = '';
                closeNavigation();
                sync();
              } else await showLibrary();
            } catch (error) {
              showFailure(error);
            }
          })();
        });
        open.setAttribute('aria-label', `${row.fileName} 열기`);
        open.textContent = '';
        open.className = 'workspace-library-open';
        open.append(fileIcon, info);
        const remove = button('', () => {
          void confirmRemove(row);
        });
        remove.setAttribute('aria-label', `${row.fileName} 보관본 삭제`);
        remove.title = '보관본 삭제';
        remove.classList.add('workspace-library-delete');
        remove.innerHTML = workspaceIcon('trash');
        item.append(open, remove);
        list.append(item);
      }
    }
    async function refresh(): Promise<void> {
      await queue;
      [rows, history] = await Promise.all([
        listDocuments(),
        listArchivedHistory(),
      ]);
      render();
    }
    async function collectHistory(): Promise<ArchivedHistory[]> {
      const entries = await listHistoryMeta();
      return Promise.all(
        entries.map(async (entry) => {
          const payload = await getHistoryPayload(entry.id);
          if (!payload)
            throw new Error(
              '내용을 읽을 수 없는 작업 이력이 있습니다. 기존 이력 목록을 확인해 주세요.',
            );
          const bytes =
            payload.kind === 'legacy'
              ? payload.bytes
              : new TextEncoder().encode(JSON.stringify(payload.snapshot));
          return createArchivedHistory(
            entry.label,
            entry.sourceFileName,
            entry.createdAt,
            payload.kind,
            bytes,
          );
        }),
      );
    }
    async function run(action: () => Promise<string>): Promise<void> {
      controls.forEach((node) => (node.disabled = true));
      message.classList.remove('has-error');
      message.textContent = '작업 중…';
      try {
        message.textContent = await action();
        await refresh();
      } catch (error) {
        message.textContent = errorText(error);
        message.classList.add('has-error');
      } finally {
        controls.forEach((node) => (node.disabled = false));
      }
    }
    async function confirmRemove(row: LibraryDocument): Promise<void> {
      const confirm = el('div', '', 'workspace-delete-confirm');
      confirm.append(
        el(
          'p',
          `‘${row.fileName}’의 브라우저 보관본을 삭제할까요? 내려받은 원본 파일은 유지됩니다.`,
        ),
      );
      confirm.append(
        button('취소', () => confirm.remove()),
        button('보관본 삭제', () => {
          void run(async () => {
            await deleteDocument(row.id);
            if (currentId === row.id) {
              currentId = null;
              savedRevision = -1;
              sync();
            }
            confirm.remove();
            return '브라우저 보관본을 삭제했습니다.';
          });
        }),
      );
      view.body.append(confirm);
    }
    const exportButton = button('백업 내보내기', () => {
      void run(async () => {
        const all = await listDocuments();
        const snapshots = await collectHistory();
        if (!all.length && !snapshots.length)
          throw new Error('먼저 문서를 보관하거나 작업 이력을 남겨 주세요.');
        const data = await encodeWorkspaceBackup(all, snapshots);
        download(
          new Blob([data], { type: 'application/json' }),
          '오픈소스 한글-문서백업.json',
        );
        return `문서 ${all.length}개 · 작업 이력 ${snapshots.length}개 백업 다운로드를 시작했습니다.`;
      });
    });
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.id = 'workspace-backup-input';
    const importButton = button('백업 가져오기', () => file.click());
    file.addEventListener('change', () => {
      const selected = file.files?.[0];
      if (!selected) return;
      void run(async () => {
        if (selected.size > MAX_BACKUP_BYTES)
          throw new Error('백업은 72MB까지 가져올 수 있습니다.');
        const validated = await decodeWorkspaceBackup(await selected.text());
        const result = await importWorkspace(
          validated.documents,
          validated.history,
        );
        return `문서 ${result.added}개·이력 ${result.historyAdded}개 추가, 동일 항목 ${result.skipped + result.historySkipped}개 건너뜀. 기존 내용은 유지됩니다.`;
      });
      file.value = '';
    });
    const documentsInput = el('input');
    documentsInput.type = 'file';
    documentsInput.accept = '.hwp,.hwpx';
    documentsInput.multiple = true;
    documentsInput.hidden = true;
    documentsInput.id = 'workspace-documents-input';
    const documentsButton = button('문서 가져오기', () =>
      documentsInput.click(),
    );
    documentsInput.addEventListener('change', () => {
      const files = Array.from(documentsInput.files ?? []);
      documentsInput.value = '';
      if (!files.length) return;
      void run(async () => {
        if (
          files.length > MAX_DOCUMENTS ||
          files.reduce((size, item) => size + item.size, 0) >
            MAX_LIBRARY_BYTES ||
          files.some((item) => item.size > MAX_DOCUMENT_BYTES)
        )
          throw new Error(
            '한 번에 50개·합계 50MB, 파일당 20MB까지 가져올 수 있습니다.',
          );
        const docs = await Promise.all(
          files.map(async (item) => {
            const format = item.name.toLowerCase().endsWith('.hwpx')
              ? 'hwpx'
              : item.name.toLowerCase().endsWith('.hwp')
                ? 'hwp'
                : null;
            if (!format) throw new Error('HWP 또는 HWPX 문서를 선택해 주세요.');
            const row = await createLibraryDocument(
              item.name,
              new Uint8Array(await item.arrayBuffer()),
              format,
            );
            if (item.lastModified > 0) row.updatedAt = item.lastModified;
            return row;
          }),
        );
        const result = await importWorkspace(docs, []);
        return `문서 ${result.added}개 추가, 동일 문서 ${result.skipped}개 건너뜀. 실제 문서 해석은 열 때 확인합니다.`;
      });
    });
    const recovery = button('이전 작업 가져오기', () => {
      void run(async () => {
        const drafts = await listAutosaveDrafts();
        const snapshots = await collectHistory();
        if (!drafts.length && !snapshots.length)
          return '이 브라우저에서 이전 RHWP 복구본·작업 이력을 찾지 못했습니다. 원본 파일 또는 백업을 가져와 주세요.';
        const docs = await Promise.all(
          drafts.map(async (draft) => {
            const doc = await createLibraryDocument(
              draft.fileName.replace(/\.[^.]+$/, '') + '-복구본.hwp',
              draft.data,
              'hwp',
            );
            doc.updatedAt = draft.savedAt;
            return doc;
          }),
        );
        const result = await importWorkspace(docs, snapshots);
        return `복구본 ${result.added}개·작업 이력 ${result.historyAdded}개 추가. 기존 복구본과 이력은 유지됩니다.`;
      });
    });
    const viewHistory = button('작업 이력 보기', () => {
      view.close();
      closeNavigation();
      dispatcher.dispatch('edit:document-history');
    });
    const controls = [
      documentsButton,
      exportButton,
      importButton,
      recovery,
      viewHistory,
    ];
    documentsButton.classList.add('workspace-primary');
    const backupPanel = el('section', '', 'workspace-backup-panel');
    backupPanel.id = 'workspace-backup-panel';
    backupPanel.hidden = true;
    backupPanel.append(
      el('h3', '백업과 문서 이전'),
      el(
        'p',
        '브라우저 데이터를 지우거나 기기를 옮기기 전에 백업을 내려받으세요. 백업에는 문서 내용과 저장된 작업 이력이 포함됩니다.',
        'workspace-muted',
      ),
    );
    const backupActions = el('div', '', 'workspace-backup-actions');
    backupActions.append(exportButton, importButton, recovery);
    backupPanel.append(backupActions);
    view.body.append(backupPanel);
    const backupToggle = button('백업·이전', () => {
      backupPanel.hidden = !backupPanel.hidden;
      backupToggle.setAttribute('aria-expanded', String(!backupPanel.hidden));
      if (!backupPanel.hidden) {
        backupPanel.scrollIntoView({ block: 'nearest' });
        exportButton.focus();
      }
    });
    backupToggle.setAttribute('aria-expanded', 'false');
    backupToggle.setAttribute('aria-controls', backupPanel.id);
    controls.push(backupToggle);
    view.footer.append(
      documentsButton,
      viewHistory,
      backupToggle,
      file,
      documentsInput,
    );
    search.addEventListener('input', render);
    message.textContent = '보관 목록을 불러오는 중…';
    try {
      await refresh();
      message.textContent = '';
    } catch (error) {
      message.textContent = errorText(error);
    }
  }
  eventBus.on('document-changed', () => {
    sync();
    revision++;
    if (currentId) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void saveCurrent().catch(showFailure);
      }, 1600);
    }
    sync();
  });
  [
    'document-swapped',
    'document-dirty-changed',
    'command-state-changed',
  ].forEach((name) => eventBus.on(name, sync));
  new MutationObserver(sync).observe(document.querySelector('title')!, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  sync();
}
