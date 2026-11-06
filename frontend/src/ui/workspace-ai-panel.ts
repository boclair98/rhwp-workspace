import type { WasmBridge } from '../core/wasm-bridge';
import type { EventBus } from '../core/event-bus';
import type { InputHandler } from '../engine/input-handler';
import { AiEditor } from '../workspace/ai-editor';
import { revisionDifference, validateDraft, validateRevision, codePointLength, type AiEditTarget } from '../workspace/ai-edit';
import { readAiConnection, makeAiWriting, type AiConnection } from '../workspace/ai-client';
import { WRITING_TEMPLATES, renderWritingTemplate, type WritingTemplateId } from '../workspace/writing-templates';
import { workspaceDialog } from './workspace-dialog';
import { showToast } from './toast';

const panelTitle = '한글 글쓰기 도우미';

export function installWorkspaceAi(wasm: WasmBridge, bus: EventBus, getInput: () => InputHandler | null): void {
  const root = document.getElementById('studio-root')!;
  const editor = new AiEditor(wasm, getInput);
  const narrow = matchMedia('(max-width:1100px)');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'workspace-ai-toggle';
  trigger.className = 'workspace-tool-button workspace-ai-toggle';
  trigger.setAttribute('aria-label', `${panelTitle} 열기`);
  trigger.setAttribute('aria-controls', 'workspace-ai-panel');
  trigger.innerHTML = '<span class="workspace-ai-long">글쓰기 도우미</span><span class="workspace-ai-short" aria-hidden="true">글쓰기</span>';
  document.getElementById('workspace-quickbar')!.append(trigger);
  const panel = document.createElement('aside');
  panel.id = 'workspace-ai-panel';
  panel.setAttribute('aria-label', panelTitle);
  panel.innerHTML = `
    <header class="workspace-ai-heading">
      <span class="workspace-ai-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 20h8M17 4a2.1 2.1 0 0 1 3 3L9 18l-5 1 1-5Z"/><path d="m15 6 3 3"/></svg></span>
      <div><h2>${panelTitle}</h2><p>한 칸씩 채우면, 내 글이 완성돼요.</p></div>
      <button type="button" class="workspace-button" data-ai-close aria-label="${panelTitle} 닫기">닫기</button>
    </header>
    <div class="workspace-ai-body">
      <div class="workspace-ai-connection"><span data-ai-connection role="status">양식으로 바로 쓸 수 있어요</span><button type="button" data-ai-size aria-pressed="false">글자 크게</button></div>
      <button type="button" data-ai-settings-toggle aria-expanded="false" aria-controls="workspace-ai-settings" hidden>AI 연결 설정</button>
      <section class="workspace-ai-settings" id="workspace-ai-settings" data-ai-settings hidden aria-label="AI 연결 설정">
        <h3>로컬 API 연결</h3><p>API 키는 이 컴퓨터의 서버에서 관리해요. 아래 값을 프로젝트의 <code>.env.local</code>에 설정하고 서버를 다시 실행해 주세요.</p>
        <dl><dt>AI_ENABLED</dt><dd><code>true</code></dd><dt>OPENAI_API_KEY</dt><dd>발급받은 키 · 화면에 입력하지 않아요</dd><dt>OPENAI_MODEL</dt><dd>사용할 모델 ID</dd></dl>
        <p>현재 요청은 OpenAI Responses API로 연결돼요. 실제 호출 전에는 키와 모델 접근 권한을 확인해야 해요.</p><button type="button" class="workspace-button" data-ai-refresh>연결 상태 다시 확인</button>
      </section>
      <div class="workspace-ai-modes" role="group" aria-label="글쓰기 작업">
        <button type="button" data-ai-mode="draft" aria-pressed="true"><strong>새 글 쓰기</strong><span>처음부터 작성</span></button>
        <button type="button" data-ai-mode="rewrite" aria-pressed="false"><strong>문장 다듬기</strong><span>선택한 글 수정</span></button>
      </div>
      <div class="workspace-writing-methods" data-writing-methods role="group" aria-label="새 글 작성 방법">
        <button type="button" data-writing-method="template" aria-pressed="true">양식으로 쓰기</button>
        <button type="button" data-writing-method="ai" aria-pressed="false">AI에 부탁하기</button>
      </div>
      <section class="workspace-writing-templates" data-writing-templates aria-labelledby="workspace-template-title">
        <h3 id="workspace-template-title">어떤 글을 쓸까요?</h3>
        <div class="workspace-ai-presets" data-template-choices role="group" aria-label="글 양식"></div>
        <form data-template-form aria-label="양식 내용" novalidate></form>
        <p class="workspace-ai-caption">입력한 내용을 양식에 맞춰 정리해요. 외부로 보내지 않아요.</p>
      </section>
      <section class="workspace-ai-selection" aria-labelledby="workspace-ai-target-title">
        <div class="workspace-ai-label-row"><h3 id="workspace-ai-target-title" data-ai-target-title>글을 넣을 곳</h3><button type="button" data-ai-capture>위치 확인</button></div>
        <p data-ai-selected class="workspace-ai-selected">문서에서 글을 넣을 곳을 눌러 주세요.</p><p class="workspace-ai-caption" data-ai-count></p>
      </section>
      <section class="workspace-ai-request" data-ai-request aria-label="글쓰기 요청" hidden>
        <div data-ai-request-fields>
        <label for="workspace-ai-prompt" data-ai-prompt-label>어떤 글을 쓸까요?</label>
        <p class="workspace-ai-caption">아래 예시를 골라 고쳐 써도 좋아요.</p>
        <div class="workspace-ai-presets" data-ai-draft-examples aria-label="새 글 예시">
          <button type="button" data-ai-prompt="[누구]에게 [알릴 내용]을 전할 안내문을 써 주세요. 꼭 알아야 할 내용이 잘 보이게 해 주세요.">안내문</button>
          <button type="button" data-ai-prompt="[받는 사람]에게 [전하고 싶은 마음]을 담은 짧은 편지를 써 주세요.">편지</button>
          <button type="button" data-ai-prompt="[신청하는 일]에 대한 신청 사유를 써 주세요. 제가 신청하는 이유는 [이유]입니다.">신청 사유</button>
          <button type="button" data-ai-prompt="[모임 이름] 공지를 써 주세요. 날짜는 [날짜], 장소는 [장소], 준비물은 [준비물]입니다.">모임 공지</button>
        </div>
        <div class="workspace-ai-presets" data-ai-rewrite-examples hidden aria-label="문장 다듬기 예시">
          <button type="button" data-ai-prompt="뜻을 유지하고 더 쉬운 말로 다듬어 주세요.">쉬운 말로</button>
          <button type="button" data-ai-prompt="뜻을 유지하고 짧고 분명하게 다듬어 주세요.">짧게</button>
          <button type="button" data-ai-prompt="의미는 바꾸지 않고 맞춤법과 띄어쓰기만 고쳐 주세요.">맞춤법</button>
        </div>
        <textarea id="workspace-ai-prompt" rows="4" maxlength="1000" aria-describedby="workspace-ai-prompt-count"></textarea>
        <p class="workspace-ai-prompt-count" id="workspace-ai-prompt-count">0 / 1,000</p>
        <label class="workspace-ai-consent" data-ai-consent-wrap hidden><input type="checkbox" data-ai-consent><span data-ai-consent-text></span></label>
        </div>
        <p class="workspace-ai-caption" data-ai-api-hint>AI 연결 상태를 확인하고 있어요.</p>
      </section>
      <details class="workspace-ai-manual"><summary>직접 쓴 글 넣기</summary><label for="workspace-ai-manual-text" data-ai-manual-label>넣을 글</label><textarea id="workspace-ai-manual-text" rows="3"></textarea><button type="button" class="workspace-button" data-ai-preview>미리보기</button></details>
      <section class="workspace-ai-preview" data-ai-preview-section hidden aria-label="글 미리보기" tabindex="-1">
        <div class="workspace-ai-label-row"><h3>글 미리보기</h3><span data-ai-source></span></div>
        <div data-ai-original><h4>원래 문장</h4><p data-ai-before></p></div>
        <h4 data-ai-result-label>문서에 넣을 글</h4><p data-ai-after></p><p class="workspace-ai-caption" data-ai-explanation></p>
      </section>
      <p class="workspace-ai-feedback" role="status" aria-live="polite" tabindex="-1" data-ai-feedback></p>
    </div>
    <footer class="workspace-ai-footer"><p data-ai-footer-hint>만든 글은 미리보기에서 확인할 수 있어요.</p><div>
      <button type="button" class="workspace-button" data-ai-discard hidden>내용 고치기</button>
      <button type="button" class="workspace-button" data-ai-cancel hidden>취소</button>
      <button type="button" class="workspace-button workspace-primary" data-ai-generate disabled>초안 만들기</button>
      <button type="button" class="workspace-button workspace-primary" data-ai-apply hidden disabled>문서에 넣기</button>
    </div></footer>`;
  root.append(panel);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  find('[data-ai-request]').append(find('[data-ai-settings-toggle]'), find('[data-ai-settings]'));
  const prompt = find<HTMLTextAreaElement>('#workspace-ai-prompt');
  const manual = find<HTMLTextAreaElement>('#workspace-ai-manual-text');
  const generate = find<HTMLButtonElement>('[data-ai-generate]');
  const apply = find<HTMLButtonElement>('[data-ai-apply]');
  const discard = find<HTMLButtonElement>('[data-ai-discard]');
  const cancel = find<HTMLButtonElement>('[data-ai-cancel]');
  const preview = find('[data-ai-preview-section]');
  const feedback = find('[data-ai-feedback]');
  const footer = find('.workspace-ai-footer');
  const footerHint = find('[data-ai-footer-hint]');
  const consent = find<HTMLInputElement>('[data-ai-consent]');
  const manualPreview = find<HTMLButtonElement>('[data-ai-preview]');
  const modeButtons = [...panel.querySelectorAll<HTMLButtonElement>('[data-ai-mode]')];
  const templateForm = find<HTMLFormElement>('[data-template-form]');
  const methodButtons = [...panel.querySelectorAll<HTMLButtonElement>('[data-writing-method]')];
  const templateValues: Partial<Record<WritingTemplateId, Record<string, string>>> = {};
  let templateId: WritingTemplateId = 'notice';
  let method: 'template' | 'ai' = 'template';
  const inputs = { draft: { prompt: '', manual: '' }, rewrite: { prompt: '', manual: '' } };
  let mode: keyof typeof inputs = 'draft';
  let target: AiEditTarget | null = null;
  let proposal: { text: string; source: 'manual' | 'ai' | 'template' } | null = null;
  let stale = false;
  let applying = false;
  let request: AbortController | null = null;
  let connection: AiConnection | null = null;
  let sheet: ReturnType<typeof workspaceDialog> | null = null;
  let open = !narrow.matches;
  let connectionEpoch = 0;

  const say = (message: string, error = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', error);
    if (error && open) {
      if (panel.contains(document.activeElement) || footer.contains(document.activeElement)) feedback.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  };
  const abort = () => { request?.abort(); request = null; };
  const sync = () => {
    const draft = mode === 'draft';
    const template = draft && method === 'template';
    const direct = !draft && !connection?.configured;
    generate.disabled = !target || stale || !!request || (!template && (direct ? !manual.value.trim() : !connection?.configured || !prompt.value.trim() || !consent.checked));
    generate.textContent = request ? '글을 쓰고 있어요…' : template ? '글 미리보기' : direct ? '다듬은 글 미리보기' : draft ? 'AI로 초안 만들기' : 'AI로 다듬기';
    generate.hidden = !!proposal;
    cancel.hidden = !request;
    apply.hidden = !proposal;
    apply.disabled = !proposal || !target || stale || !!request;
    discard.hidden = !proposal;
    footerHint.textContent = !target || stale ? targetHint() : proposal ? '읽어 보고 마음에 들면 문서에 넣어 주세요.' : '만든 글은 미리보기에서 확인할 수 있어요.';
    manualPreview.disabled = !target || stale || !!request || !manual.value.trim();
    manualPreview.hidden = direct;
    find('#workspace-ai-prompt-count').textContent = `${prompt.value.length.toLocaleString()} / 1,000`;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', `${panelTitle} ${open ? '닫기' : '열기'}`);
    trigger.classList.toggle('active', open);
    panel.setAttribute('aria-busy', String(!!request));
  };
  const clearProposal = () => { proposal = null; preview.hidden = true; sync(); };
  const cancelRequest = () => { abort(); sync(); };
  const targetHint = () => mode === 'draft' ? '문서에서 글을 넣을 곳을 한 번 눌러 주세요.' : '문서에서 다듬을 문장을 선택해 주세요.';
  const showTarget = () => {
    find('[data-ai-selected]').textContent = target
      ? mode === 'draft' ? '문서의 입력 위치에 넣을 준비가 됐어요.' : target.text
      : targetHint();
    find('[data-ai-count]').textContent = target && mode === 'rewrite'
      ? `${codePointLength(target.text).toLocaleString()}자 · ${target.start.parentParaIndex === undefined ? '본문' : '표 셀'}`
      : '';
  };
  const showMode = () => {
    const draft = mode === 'draft';
    find('[data-writing-methods]').hidden = !draft;
    find('[data-writing-templates]').hidden = !draft || method !== 'template';
    find('[data-ai-request]').hidden = draft && method === 'template';
    find('[data-ai-request-fields]').hidden = !draft && !connection?.configured;
    for (const button of methodButtons) button.setAttribute('aria-pressed', String(button.dataset.writingMethod === method));
    if (!draft && !connection?.configured) find<HTMLDetailsElement>('.workspace-ai-manual').open = true;
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.aiMode === mode));
    find('[data-ai-target-title]').textContent = draft ? '글을 넣을 곳' : '다듬을 문장';
    find('[data-ai-capture]').textContent = draft ? '위치 확인' : '선택 가져오기';
    find('[data-ai-prompt-label]').textContent = draft ? '어떤 글을 쓸까요?' : '어떻게 다듬을까요?';
    find('[data-ai-draft-examples]').hidden = !draft;
    find('[data-ai-rewrite-examples]').hidden = draft;
    prompt.placeholder = draft ? '예: 다음 주에 있을 모임 안내문을 써 주세요.' : '예: 어르신도 읽기 쉽게 다듬어 주세요.';
    manual.placeholder = draft ? '문서에 넣을 글을 여기에 적어 주세요.' : '선택한 문장을 대신할 글을 적어 주세요.';
    find('[data-ai-manual-label]').textContent = draft ? '넣을 글' : '다듬은 글';
    find('[data-ai-consent-text]').textContent = draft ? '요청에 적은 내용을 OpenAI에 보내도 좋아요.' : '선택한 문장과 요청을 OpenAI에 보내도 좋아요.';
    showTarget(); sync();
  };
  const capture = (force = false) => {
    try {
      const next = mode === 'draft' ? editor.captureDraft() : editor.capture();
      if (target && !stale && target.generation === next.generation && target.revision === next.revision
        && JSON.stringify(target.start) === JSON.stringify(next.start) && JSON.stringify(target.end) === JSON.stringify(next.end)) return;
      abort(); target = next; stale = false; consent.checked = false;
      clearProposal(); showTarget(); say('');
    } catch (error) {
      abort(); target = null; stale = false; consent.checked = false;
      clearProposal(); showTarget();
      if (force) say((error as Error).message, true);
    }
    sync();
  };
  const showPreview = (text: string, source: 'manual' | 'ai' | 'template', explanation = '') => {
    if (!target || stale) throw new Error(targetHint());
    editor.assertCurrent(target);
    const draft = mode === 'draft';
    text = draft ? validateDraft(text) : validateRevision(target.text, text);
    const before = find('[data-ai-before]'), after = find('[data-ai-after]');
    find('[data-ai-original]').hidden = draft;
    if (draft) {
      after.textContent = text;
    } else {
      const diff = revisionDifference(target.text, text);
      const removed = document.createElement('del'); removed.textContent = diff.removed;
      const added = document.createElement('mark'); added.textContent = diff.added;
      before.replaceChildren(document.createTextNode(diff.prefix), removed, document.createTextNode(diff.suffix));
      after.replaceChildren(document.createTextNode(diff.prefix), added, document.createTextNode(diff.suffix));
    }
    find('[data-ai-result-label]').textContent = draft ? '문서에 넣을 글' : '다듬은 문장';
    find('[data-ai-source]').textContent = source === 'ai' ? 'AI가 쓴 글' : source === 'template' ? '양식으로 만든 글' : '직접 입력';
    find('[data-ai-explanation]').textContent = explanation;
    proposal = { text, source };
    preview.hidden = false;
    say('');
    sync();
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const refreshConnection = async () => {
    const epoch = ++connectionEpoch;
    const button = find<HTMLButtonElement>('[data-ai-refresh]');
    button.disabled = true;
    try {
      const status = await readAiConnection(AbortSignal.timeout(5000));
      if (epoch !== connectionEpoch) return;
      connection = status;
      find('[data-ai-connection]').textContent = status.configured ? 'AI도 사용할 수 있어요' : '양식으로 바로 쓸 수 있어요';
      find('[data-ai-settings-toggle]').hidden = status.reason === 'local_only';
      panel.classList.toggle('workspace-ai-ready', status.configured);
      find('[data-ai-api-hint]').textContent = status.configured
        ? '날짜, 장소, 이름은 미리보기에서 확인해 주세요.'
        : '아직 AI가 연결되지 않았어요. 새 글은 양식으로 쓰고, 문장은 직접 고쳐 넣을 수 있어요.';
      find('[data-ai-consent-wrap]').hidden = !status.configured;
    } catch (error) {
      if (epoch !== connectionEpoch) return;
      connection = null;
      panel.classList.remove('workspace-ai-ready');
      find('[data-ai-connection]').textContent = '양식으로 바로 쓸 수 있어요';
      find('[data-ai-api-hint]').textContent = (error as Error).message;
      find('[data-ai-consent-wrap]').hidden = true;
    } finally { if (epoch === connectionEpoch) { button.disabled = false; showMode(); } }
  };

  const renderTemplateFields = () => {
    const template = WRITING_TEMPLATES.find(item => item.id === templateId)!;
    const values = templateValues[templateId] ??= {};
    templateForm.replaceChildren();
    const optional = document.createElement('details');
    optional.className = 'workspace-template-optional';
    const summary = document.createElement('summary'); summary.textContent = '더 적을 내용 (선택)'; optional.append(summary);
    for (const field of template.fields) {
      const wrap = document.createElement('div'); wrap.className = 'workspace-template-field';
      const label = document.createElement('label'); label.htmlFor = `writing-${field.id}`; label.textContent = field.label;
      const input = document.createElement(field.multiline ? 'textarea' : 'input');
      input.id = label.htmlFor; input.name = field.id; input.required = field.required;
      input.maxLength = field.maxLength; input.placeholder = field.placeholder; input.value = values[field.id] ?? '';
      if (input instanceof HTMLTextAreaElement) input.rows = 3;
      input.addEventListener('invalid', () => { if (input.validity.valueMissing) input.setCustomValidity(`${field.label}: 내용을 입력해 주세요.`); });
      input.addEventListener('input', () => { input.setCustomValidity(''); values[field.id] = input.value; if (proposal?.source === 'template') clearProposal(); say(''); });
      wrap.append(label, input); (field.required ? templateForm : optional).append(wrap);
    }
    if (optional.children.length > 1) templateForm.append(optional);
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-template-id]')) button.setAttribute('aria-pressed', String(button.dataset.templateId === templateId));
  };
  for (const template of WRITING_TEMPLATES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.templateId = template.id;
    button.textContent = template.label;
    button.addEventListener('click', () => { templateId = template.id; clearProposal(); say(''); renderTemplateFields(); });
    find('[data-template-choices]').append(button);
  }
  templateForm.addEventListener('submit', event => { event.preventDefault(); generate.click(); });
  renderTemplateFields();

  const layout = () => {
    root.classList.toggle('workspace-ai-open', open && !narrow.matches);
    panel.hidden = !open;
    sync();
    bus.emit('zoom-settle');
  };
  const close = () => {
    cancelRequest();
    if (sheet) { sheet.close(); return; }
    open = false; layout(); trigger.focus();
  };
  const show = () => {
    capture(); open = true;
    if (narrow.matches && !sheet) {
      const view = workspaceDialog(panelTitle, trigger);
      sheet = view;
      view.dialog.classList.add('workspace-ai-sheet');
      panel.hidden = false;
      view.body.append(panel);
      view.footer.append(footer);
      view.dialog.addEventListener('close', () => {
        cancelRequest(); panel.append(footer); root.append(panel); sheet = null;
        open = !narrow.matches; layout();
      }, { once: true });
    }
    layout();
    if (!narrow.matches) (mode === 'draft' && method === 'template' ? templateForm.querySelector<HTMLInputElement>('input') : prompt)?.focus();
  };
  trigger.addEventListener('pointerdown', () => capture());
  trigger.addEventListener('click', () => open ? close() : show());
  find('[data-ai-close]').addEventListener('click', close);
  find('[data-ai-size]').addEventListener('click', () => {
    const large = panel.classList.toggle('workspace-writing-large');
    find('[data-ai-size]').setAttribute('aria-pressed', String(large));
    find('[data-ai-size]').textContent = large ? '기본 글자' : '글자 크게';
  });
  find('[data-ai-settings-toggle]').addEventListener('click', () => {
    const settings = find('[data-ai-settings]'); settings.hidden = !settings.hidden;
    find('[data-ai-settings-toggle]').setAttribute('aria-expanded', String(!settings.hidden));
  });
  find('[data-ai-refresh]').addEventListener('click', () => void refreshConnection());
  find('[data-ai-capture]').addEventListener('click', () => capture(true));
  for (const button of methodButtons) button.addEventListener('click', () => {
    abort(); method = button.dataset.writingMethod as typeof method; clearProposal(); say(''); showMode();
  });
  for (const button of modeButtons) button.addEventListener('click', () => {
    const next = button.dataset.aiMode as keyof typeof inputs;
    if (next === mode) return;
    inputs[mode] = { prompt: prompt.value, manual: manual.value };
    abort(); mode = next; target = null; stale = false; consent.checked = false;
    prompt.value = inputs[mode].prompt;
    manual.value = inputs[mode].manual;
    clearProposal(); say(''); showMode(); capture();
  });
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-ai-prompt]')) button.addEventListener('click', () => {
    prompt.value = button.dataset.aiPrompt!; prompt.dispatchEvent(new Event('input')); prompt.focus();
  });
  prompt.addEventListener('input', () => {
    if (request) { cancelRequest(); say('요청이 바뀌어 이전 생성을 취소했어요.'); }
    if (proposal?.source === 'ai') { clearProposal(); say('요청이 바뀌었어요. 수정안을 다시 만들어 주세요.'); }
    sync();
  });
  consent.addEventListener('change', () => { if (!consent.checked && request) cancelRequest(); sync(); });
  manual.addEventListener('input', () => { if (proposal?.source === 'manual') clearProposal(); sync(); });
  find('[data-ai-preview]').addEventListener('click', () => {
    try { showPreview(manual.value, 'manual'); } catch (error) { clearProposal(); say((error as Error).message, true); }
  });
  generate.addEventListener('click', async () => {
    if (!target || generate.disabled) return;
    if (mode === 'draft' && method === 'template') {
      if (!templateForm.reportValidity()) return;
      try { showPreview(renderWritingTemplate(templateId, templateValues[templateId] ?? {}), 'template', '날짜, 이름, 내용을 확인한 뒤 문서에 넣어 주세요.'); }
      catch (error) { clearProposal(); say((error as Error).message, true); }
      return;
    }
    if (mode === 'rewrite' && !connection?.configured) {
      try { showPreview(manual.value, 'manual'); }
      catch (error) { clearProposal(); say((error as Error).message, true); }
      return;
    }
    try { editor.assertCurrent(target); } catch (error) { stale = true; say((error as Error).message, true); sync(); return; }
    clearProposal();
    const controller = new AbortController(); request = controller;
    const captured = target, originalPrompt = prompt.value;
    say('글을 준비하고 있어요. 잠시만 기다려 주세요.'); sync();
    try {
      const result = await makeAiWriting(mode, captured.text, originalPrompt, consent.checked, AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]));
      if (request !== controller || target !== captured || stale || prompt.value !== originalPrompt) return;
      showPreview(result.text, 'ai', result.explanation);
    } catch (error) {
      if (request !== controller) return;
      say(controller.signal.aborted ? '요청을 취소했어요. 문장은 그대로예요.' : (error as Error).message, !controller.signal.aborted);
    } finally { if (request === controller) request = null; sync(); }
  });
  cancel.addEventListener('click', () => { cancelRequest(); say('요청을 취소했어요. 문장은 그대로예요.'); });
  discard.addEventListener('click', () => {
    const field = proposal?.source === 'manual' ? manual : proposal?.source === 'template' ? templateForm.querySelector<HTMLInputElement>('input')! : prompt;
    clearProposal(); say(''); field.focus();
  });
  apply.addEventListener('click', () => {
    if (!target || !proposal || apply.disabled) return;
    try {
      applying = true;
      if (mode === 'draft') editor.applyDraft(target, proposal.text);
      else editor.apply(target, proposal.text);
      target = null; stale = false; consent.checked = false; manual.value = '';
      clearProposal(); showTarget(); say('문서에 넣었어요. 되돌리려면 Ctrl+Z를 누르세요.');
      showToast({ message: '문서에 넣었어요.' });
      if (sheet) close();
      else getInput()?.focus();
    } catch (error) { stale = true; clearProposal(); say((error as Error).message, true); }
    finally { applying = false; sync(); }
  });
  panel.addEventListener('keydown', event => {
    if (!event.isComposing) {
      if (event.key === 'Escape' && !sheet) { event.preventDefault(); close(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); generate.click(); }
    }
    if (!sheet) event.stopPropagation();
  });
  bus.on('document-changed', () => {
    editor.revision++;
    if (applying) return;
    cancelRequest();
    if (target) {
      const reviewing = !!proposal;
      target = null; stale = true; consent.checked = false;
      clearProposal(); showTarget();
      if (reviewing) say('문서가 바뀌었어요. 위치를 다시 고른 뒤 글을 만들어 주세요.', true);
    }
  });
  bus.on('document-loading', busy => {
    if (busy !== true) return;
    cancelRequest(); target = null; clearProposal(); stale = false;
    find('[data-ai-selected]').textContent = '문서를 여는 중이에요. 준비가 끝나면 문장을 선택해 주세요.';
    if (sheet) close();
  });
  bus.on('document-loaded', () => {
    target = null; stale = false; clearProposal();
    consent.checked = false; showTarget(); say('');
    queueMicrotask(() => capture());
  });
  // Canvas text is selected by RHWP, not by the browser's DOM Selection API.
  const editorArea = document.getElementById('editor-area')!;
  editorArea.addEventListener('pointerup', () => queueMicrotask(() => capture()));
  editorArea.addEventListener('keyup', () => queueMicrotask(() => capture()));
  let captureQueued = false;
  bus.on('cursor-format-changed', () => {
    if (captureQueued) return;
    captureQueued = true;
    queueMicrotask(() => { captureQueued = false; if (editorArea.contains(document.activeElement)) capture(); });
  });
  narrow.addEventListener('change', () => {
    if (sheet) { sheet.close(); return; }
    open = !narrow.matches; layout();
  });
  showMode(); layout();
  void refreshConnection();
}
