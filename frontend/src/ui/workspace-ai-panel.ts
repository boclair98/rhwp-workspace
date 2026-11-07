import type { WasmBridge } from '../core/wasm-bridge';
import type { EventBus } from '../core/event-bus';
import type { InputHandler } from '../engine/input-handler';
import { AiEditor } from '../workspace/ai-editor';
import { revisionDifference, validateDraft, validateRevision, codePointLength, type AiEditTarget } from '../workspace/ai-edit';
import { AiAccessError, isCodersSite, readAiConnection, makeAiWriting, type AiConnection, type AiWritingRequest } from '../workspace/ai-client';
import { WRITING_TEMPLATES, renderWritingTemplate, type WritingTemplateId } from '../workspace/writing-templates';
import { workspaceDialog } from './workspace-dialog';
import { showToast } from './toast';
import type { CommandDispatcher } from '../command/dispatcher';
import { installWritingLibrary } from './workspace-writing-library';

const panelTitle = '한글 글쓰기 도우미';
type Proposal = { text: string; source: 'manual' | 'ai' | 'template'; explanation?: string };

export function installWorkspaceAi(wasm: WasmBridge, bus: EventBus, getInput: () => InputHandler | null, dispatcher: CommandDispatcher): void {
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
      <div><h2>${panelTitle}</h2></div>
      <button type="button" class="workspace-button" data-ai-close aria-label="${panelTitle} 닫기">닫기</button>
    </header>
    <div class="workspace-ai-body">
      <div data-ai-compose>
      <button type="button" data-ai-settings-toggle aria-expanded="false" aria-controls="workspace-ai-settings" hidden>AI 연결 설정</button>
      <section class="workspace-ai-settings" id="workspace-ai-settings" data-ai-settings hidden aria-label="AI 연결 설정">
        <h3>로컬 API 연결</h3><p>API 키는 이 컴퓨터의 서버에서 관리해요. 아래 값을 프로젝트의 <code>.env.local</code>에 설정하고 서버를 다시 실행해 주세요.</p>
        <dl><dt>AI_ENABLED</dt><dd><code>true</code></dd><dt>OPENAI_API_KEY</dt><dd>발급받은 키 · 화면에 입력하지 않아요</dd><dt>OPENAI_MODEL</dt><dd>사용할 모델 ID</dd></dl>
        <p>현재 요청은 OpenAI Responses API로 연결돼요. 실제 호출 전에는 키와 모델 접근 권한을 확인해야 해요.</p><button type="button" class="workspace-button" data-ai-refresh>연결 상태 다시 확인</button>
      </section>
      <section class="workspace-ai-selection" data-ai-selection aria-labelledby="workspace-ai-target-title" hidden>
        <div class="workspace-ai-label-row"><h3 id="workspace-ai-target-title">다듬을 문장</h3><button type="button" data-ai-capture>선택 가져오기</button></div>
        <p data-ai-selected class="workspace-ai-selected"></p><p class="workspace-ai-caption" data-ai-count></p>
      </section>
      <section class="workspace-ai-request" id="workspace-ai-request" data-ai-request aria-labelledby="workspace-ai-prompt-title">
        <h3 id="workspace-ai-prompt-title" data-ai-prompt-label>무엇을 도와드릴까요?</h3>
        <div class="workspace-ai-composer">
          <textarea id="workspace-ai-prompt" rows="3" maxlength="1000" aria-labelledby="workspace-ai-prompt-title" aria-describedby="workspace-ai-prompt-note"></textarea>
          <div class="workspace-ai-composer-actions" data-ai-composer-actions></div>
        </div>
        <p class="workspace-ai-caption" id="workspace-ai-prompt-note" data-ai-prompt-note role="status"></p>
        <label class="workspace-ai-auto"><input type="checkbox" data-ai-auto checked>완성되면 문서에 바로 쓰기</label>
        <div class="workspace-ai-presets" data-ai-rewrite-examples hidden aria-label="문장 다듬기 예시">
          <button type="button" data-ai-prompt="뜻을 유지하고 더 쉬운 말로 다듬어 주세요.">쉬운 말로</button>
          <button type="button" data-ai-prompt="뜻을 유지하고 짧고 분명하게 다듬어 주세요.">짧게</button>
          <button type="button" data-ai-prompt="의미는 바꾸지 않고 맞춤법과 띄어쓰기만 고쳐 주세요.">맞춤법</button>
        </div>
      </section>
      <section class="workspace-ai-receipt" data-ai-receipt hidden aria-label="최근 문서 반영">
        <strong data-ai-receipt-title>문서에 작성했어요</strong>
        <p data-ai-receipt-note></p>
        <details><summary>작성한 글 보기</summary><p data-ai-receipt-text></p></details>
        <div class="workspace-ai-receipt-actions"><button type="button" class="workspace-button" data-ai-document>문서 보기</button><button type="button" class="workspace-button" data-ai-undo>방금 작성한 글 되돌리기</button></div>
      </section>
      <section class="workspace-ai-account" data-ai-account hidden aria-label="AI 사용 안내">
        <p class="workspace-ai-caption" data-ai-account-message role="status"></p>
        <div class="workspace-ai-account-actions">
          <a class="workspace-button workspace-primary" data-ai-login target="_blank" rel="noopener noreferrer" hidden>코더스 로그인</a>
          <button type="button" class="workspace-button" data-ai-account-refresh>로그인 확인</button>
        </div>
      </section>
      <div class="workspace-ai-switches" role="group" aria-label="다른 글쓰기 방법">
        <button type="button" data-writing-chat aria-expanded="false" aria-controls="workspace-writing-templates">양식으로 쓰기</button>
        <button type="button" data-ai-mode="draft" hidden>새 글 쓰기</button>
        <button type="button" data-ai-mode="rewrite">문장 다듬기</button>
      </div>
      <section class="workspace-writing-templates" id="workspace-writing-templates" data-writing-templates aria-labelledby="workspace-template-title" hidden>
        <h3 id="workspace-template-title">어떤 글을 쓸까요?</h3>
        <p class="workspace-ai-caption">종류를 고르고 아는 내용만 적어 주세요.</p>
        <div class="workspace-ai-presets" data-template-choices role="group" aria-label="글 종류"></div>
        <form data-template-form aria-label="글에 넣을 내용" novalidate></form>
        <button type="button" class="workspace-button" data-template-preview>양식 미리보기</button>
      </section>
      <details class="workspace-ai-manual"><summary>직접 쓴 글 넣기</summary><label for="workspace-ai-manual-text" data-ai-manual-label>넣을 글</label><textarea id="workspace-ai-manual-text" rows="3"></textarea><button type="button" class="workspace-button" data-ai-preview>미리보기</button></details>
      <button type="button" class="workspace-button workspace-resume" data-review-resume hidden>이전에 만든 글 계속 보기</button>
      </div>
      <section class="workspace-ai-preview" data-ai-preview-section hidden aria-label="글 미리보기" tabindex="-1">
        <div class="workspace-ai-label-row"><h3>글 미리보기</h3><span data-ai-source></span></div>
        <p class="workspace-ai-caption">고치고 싶은 부분은 여기서 바로 바꿔 주세요.</p>
        <label for="workspace-review-text" class="workspace-review-label">문서에 넣을 글</label><textarea id="workspace-review-text" rows="9" aria-describedby="workspace-review-count workspace-review-error"></textarea>
        <p class="workspace-ai-caption" id="workspace-review-count"></p><p id="workspace-review-error" class="workspace-ai-feedback is-error" role="status"></p>
        <details data-ai-original><summary>원문과 비교</summary><h4>원래 문장</h4><p data-ai-before></p><h4 data-ai-result-label>다듬은 문장</h4><p data-ai-after></p></details>
        <p class="workspace-ai-caption" data-ai-explanation></p>
        <div class="workspace-review-location" data-review-location><p>글은 남아 있어요. 넣을 위치를 확인해 주세요.</p><button type="button" class="workspace-button" data-review-rebind>현재 위치 다시 확인</button></div>
      </section>
      <section class="workspace-writing-done" data-writing-done hidden tabindex="-1" aria-label="문서 반영 완료"><span aria-hidden="true">✓</span><h3>문서에 넣었어요</h3><p>문서에서 서식을 더 다듬거나,<br>한글 파일로 저장할 수 있어요.</p><p class="workspace-ai-caption">되돌리기는 Ctrl+Z 또는 상단 화살표를 눌러 주세요.</p></section>
      <p class="workspace-ai-feedback" role="status" aria-live="polite" tabindex="-1" data-ai-feedback></p>
      <div class="workspace-writing-tools"><div data-writing-library></div><button type="button" data-ai-size aria-pressed="false">글자 크게</button></div>
    </div>
    <footer class="workspace-ai-footer"><p id="workspace-ai-action-note" data-ai-footer-hint>만든 글은 미리보기에서 확인할 수 있어요.</p><div data-ai-footer-actions>
      <button type="button" class="workspace-button" data-ai-discard hidden>입력 수정</button>
      <button type="button" class="workspace-button" data-ai-cancel hidden>취소</button>
      <button type="button" class="workspace-button workspace-primary" data-ai-generate aria-describedby="workspace-ai-action-note" disabled>
        <span data-ai-generate-label>초안 만들기</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M12 19V5m-6 6 6-6 6 6"/></svg>
      </button>
      <button type="button" class="workspace-button workspace-primary" data-ai-apply hidden disabled>문서에 넣기</button>
      <button type="button" class="workspace-button" data-writing-continue hidden>계속 작성</button><button type="button" class="workspace-button workspace-primary" data-writing-download hidden>파일 저장</button>
      <button type="button" class="workspace-button workspace-primary" data-writing-library-close hidden>글쓰기로 돌아가기</button>
    </div></footer>`;
  root.append(panel);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const prompt = find<HTMLTextAreaElement>('#workspace-ai-prompt');
  const autoApply = find<HTMLInputElement>('[data-ai-auto]');
  const receipt = find('[data-ai-receipt]');
  const undo = find<HTMLButtonElement>('[data-ai-undo]');
  let appliedRevision: number | null = null;
  const manual = find<HTMLTextAreaElement>('#workspace-ai-manual-text');
  const generate = find<HTMLButtonElement>('[data-ai-generate]');
  const generateLabel = find('[data-ai-generate-label]');
  const sendIcon = generate.querySelector('svg')!;
  const composerActions = find('[data-ai-composer-actions]');
  const footerActions = find('[data-ai-footer-actions]');
  const promptNote = find('[data-ai-prompt-note]');
  const apply = find<HTMLButtonElement>('[data-ai-apply]');
  const discard = find<HTMLButtonElement>('[data-ai-discard]');
  const cancel = find<HTMLButtonElement>('[data-ai-cancel]');
  const preview = find('[data-ai-preview-section]');
  const feedback = find('[data-ai-feedback]');
  const footer = find('.workspace-ai-footer');
  const footerHint = find('[data-ai-footer-hint]');
  const account = find('[data-ai-account]');
  const login = find<HTMLAnchorElement>('[data-ai-login]');
  const accountRefresh = find<HTMLButtonElement>('[data-ai-account-refresh]');
  const localRefresh = find<HTMLButtonElement>('[data-ai-refresh]');
  const loginUrl = new URL('https://mcp.coders.kr/sso/login');
  loginUrl.searchParams.set('return_to', location.origin + '/');
  login.href = loginUrl.href;
  const managedSite = () => connection?.deployment === 'coders' || isCodersSite();
  const manualPreview = find<HTMLButtonElement>('[data-ai-preview]');
  const reviewText = find<HTMLTextAreaElement>('#workspace-review-text');
  const continueWriting = find<HTMLButtonElement>('[data-writing-continue]');
  const download = find<HTMLButtonElement>('[data-writing-download]');
  const returnToWriting = find<HTMLButtonElement>('[data-writing-library-close]');
  const modeButtons = [...panel.querySelectorAll<HTMLButtonElement>('[data-ai-mode]')];
  const templateForm = find<HTMLFormElement>('[data-template-form]');
  const templatePreview = find<HTMLButtonElement>('[data-template-preview]');
  const chat = find<HTMLButtonElement>('[data-writing-chat]');
  const templateValues: Partial<Record<WritingTemplateId, Record<string, string>>> = {};
  let templateId: WritingTemplateId = 'notice';
  let method: 'template' | 'ai' = 'ai';
  const inputs: Record<'draft' | 'rewrite', { prompt: string; manual: string; preview?: Proposal }> = { draft: { prompt: '', manual: '' }, rewrite: { prompt: '', manual: '' } };
  let mode: keyof typeof inputs = 'draft';
  let target: AiEditTarget | null = null;
  let proposal: Proposal | null = null;
  let stage: 'compose' | 'review' | 'done' = 'compose';
  let reviewTarget: AiEditTarget | null = null;
  let reviewError = '';
  let loading = false;
  let stale = false;
  let applying = false;
  let request: AbortController | null = null;
  let connection: AiConnection | null = null;
  let sheet: ReturnType<typeof workspaceDialog> | null = null;
  let open = !narrow.matches;
  let connectionEpoch = 0;
  let libraryOpen = false;
  let checkingLoginOnReturn = false;

  const focusInput = () => {
    const field = mode === 'draft' && method === 'template'
      ? templateForm.querySelector<HTMLInputElement>('input, textarea')
      : mode === 'rewrite' && !connection?.configured ? manual : prompt;
    field?.focus();
  };
  const say = (message: string, error = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', error);
    if (error && open) {
      feedback.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  };
  const abort = () => { request?.abort(); request = null; };
  const sync = () => {
    const draft = mode === 'draft';
    autoApply.disabled = !!request || loading;
    undo.disabled = appliedRevision === null || appliedRevision !== editor.revision || loading || !!request;
    receipt.hidden = !find('[data-ai-receipt-text]').textContent || libraryOpen || stage !== 'compose';
    const template = draft && method === 'template';
    const ai = connection?.configured === true;
    const direct = !draft && !ai;
    const composer = !template && !direct;
    const composing = !libraryOpen && stage === 'compose';
    const missingSelection = !draft && (!target || stale);
    const missingText = !template && !(direct ? manual.value : prompt.value).trim();
    const actions = composer ? composerActions : footerActions;
    if (generate.parentElement !== actions) actions.append(cancel, generate);
    footer.hidden = composing && composer;
    generate.hidden = !composing;
    generate.disabled = !composing || loading || missingSelection || !!request || missingText || (composer && !ai);
    generateLabel.hidden = composer;
    sendIcon.toggleAttribute('hidden', !composer);
    if (composer) {
      generate.setAttribute('aria-label', '요청 보내기');
      generate.title = '요청 보내기 (Enter)';
    } else {
      generate.removeAttribute('aria-label');
      generate.removeAttribute('title');
      if (request) generateLabel.textContent = '글을 쓰고 있어요…';
      else if (ai) generateLabel.textContent = 'AI로 초안 만들기';
      else generateLabel.textContent = draft ? '양식 미리보기' : '다듬은 글 미리보기';
    }
    generate.setAttribute('aria-describedby', composer ? promptNote.id : footerHint.id);
    let note = draft ? '요청을 OpenAI로 보내 글을 작성해요.' : '선택한 문장과 요청을 OpenAI로 보내요.';
    if (autoApply.checked) note += ' 완성되면 문서에 반영해요.';
    if (request) note = '글을 쓰고 있어요…';
    else if (missingSelection) note = targetHint();
    else if (!ai) note = 'AI에 연결하면 요청을 보낼 수 있어요.';
    if (promptNote.textContent !== note) promptNote.textContent = note;
    templatePreview.hidden = !template || !ai;
    templatePreview.disabled = loading || !!request;
    cancel.hidden = libraryOpen || !request;
    apply.hidden = libraryOpen || stage !== 'review';
    apply.disabled = loading || !proposal || !reviewTarget || !!reviewError || !!request;
    discard.hidden = libraryOpen || stage !== 'review';
    continueWriting.hidden = download.hidden = libraryOpen || stage !== 'done';
    returnToWriting.hidden = !libraryOpen;
    download.disabled = loading;
    if (libraryOpen) footerHint.textContent = '보관한 초안은 이 브라우저에서 이어 쓸 수 있어요.';
    else if (stage === 'done') footerHint.textContent = '현재 문서를 한글 파일로 저장해요.';
    else if (stage === 'review') footerHint.textContent = reviewError || (!reviewTarget ? '문서에서 글을 넣을 위치를 골라 주세요.' : '글을 확인한 뒤 문서에 넣으세요.');
    else if (missingSelection) footerHint.textContent = targetHint();
    else if (ai) footerHint.textContent = draft ? '버튼을 누르면 입력한 내용을 OpenAI로 보내요.' : '버튼을 누르면 선택한 문장과 요청을 OpenAI로 보내요.';
    else if (template) footerHint.textContent = '입력한 내용을 양식으로 미리 볼 수 있어요.';
    else footerHint.textContent = draft ? 'AI에 연결한 뒤 채팅으로 글을 쓸 수 있어요.' : '고친 글을 먼저 확인할 수 있어요.';
    find('[data-ai-compose]').hidden = libraryOpen || stage !== 'compose';
    preview.hidden = libraryOpen || stage !== 'review';
    find('[data-writing-done]').hidden = libraryOpen || stage !== 'done';
    feedback.hidden = libraryOpen;
    find('[data-review-resume]').hidden = !proposal;
    prompt.setAttribute('aria-busy', String(!!request));
    find('[data-review-location]').hidden = !!reviewTarget;
    if (!reviewTarget) find('[data-ai-explanation]').textContent = '';
    find('[data-ai-original]').hidden = mode === 'draft' || !reviewTarget;
    find('[data-review-rebind]').textContent = target && !stale ? '현재 위치 다시 확인' : '문서에서 위치 고르기';
    find('[data-ai-size]').hidden = libraryOpen;
    manualPreview.disabled = loading || missingSelection || !!request || !manual.value.trim();
    manualPreview.hidden = direct;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', `${panelTitle} ${open ? '닫기' : '열기'}`);
    trigger.classList.toggle('active', open);
    panel.setAttribute('aria-busy', String(!!request && !composer));
  };
  const clearProposal = () => { proposal = null; reviewTarget = null; reviewError = ''; stage = 'compose'; sync(); };
  const detachReview = () => { reviewTarget = null; sync(); };
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
    find('[data-writing-templates]').hidden = !draft || method !== 'template';
    find('[data-ai-request]').hidden = draft ? method !== 'ai' : !connection?.configured;
    find('[data-ai-selection]').hidden = draft;
    chat.hidden = !draft;
    chat.setAttribute('aria-expanded', String(draft && method === 'template'));
    chat.textContent = method === 'ai' ? '양식으로 쓰기' : '입력창으로 돌아가기';
    if (!draft && !connection?.configured) find<HTMLDetailsElement>('.workspace-ai-manual').open = true;
    for (const button of modeButtons) button.hidden = button.dataset.aiMode === mode;
    find('[data-ai-prompt-label]').textContent = draft ? '무엇을 도와드릴까요?' : '어떻게 다듬을까요?';
    find('[data-ai-rewrite-examples]').hidden = draft;
    prompt.placeholder = draft ? '예: 다음 주 주민센터 모임 안내문을 써 주세요.' : '예: 읽기 쉬운 말로 바꿔 주세요.';
    manual.placeholder = draft ? '문서에 넣을 글을 여기에 적어 주세요.' : '선택한 문장을 대신할 글을 적어 주세요.';
    find('[data-ai-manual-label]').textContent = draft ? '넣을 글' : '다듬은 글';
    showTarget(); sync();
  };
  const capture = (force = false) => {
    if (loading || request || applying) return;
    try {
      const next = mode === 'draft' ? editor.captureDraft() : editor.capture();
      if (target && !stale && target.generation === next.generation && target.revision === next.revision
        && JSON.stringify(target.start) === JSON.stringify(next.start) && JSON.stringify(target.end) === JSON.stringify(next.end)) return;
      abort(); target = next; stale = false;
      detachReview(); showTarget();
    } catch (error) {
      abort(); target = null; stale = false;
      detachReview(); showTarget();
      if (force) say((error as Error).message, true);
    }
    sync();
  };
  const refreshReviewText = () => {
    if (!proposal) return;
    find('[data-ai-result-label]').textContent = mode === 'draft' ? '문서에 넣을 글' : '다듬은 문장';
    find('[data-ai-source]').textContent = proposal.source === 'ai' ? 'AI에서 시작' : proposal.source === 'template' ? '양식에서 시작' : '직접 작성';
    find('[data-ai-explanation]').textContent = reviewTarget ? proposal.explanation ?? '' : '';
    proposal.text = reviewText.value;
    try {
      if (mode === 'draft') validateDraft(proposal.text);
      else validateRevision(reviewTarget?.text ?? '', proposal.text);
      reviewError = '';
    } catch (error) { reviewError = (error as Error).message; }
    reviewText.setAttribute('aria-invalid', String(!!reviewError));
    find('#workspace-review-error').textContent = reviewError;
    find('#workspace-review-count').textContent = `${codePointLength(proposal.text).toLocaleString()} / 2,000자${mode === 'draft' ? ` · ${proposal.text.split('\n').length} / 64줄` : ''}`;
    find('[data-ai-original]').hidden = mode === 'draft' || !reviewTarget;
    if (mode === 'rewrite' && reviewTarget) {
      const diff = revisionDifference(reviewTarget.text, proposal.text);
      const removed = document.createElement('del'); removed.textContent = diff.removed;
      const added = document.createElement('mark'); added.textContent = diff.added;
      find('[data-ai-before]').replaceChildren(document.createTextNode(diff.prefix), removed, document.createTextNode(diff.suffix));
      find('[data-ai-after]').replaceChildren(document.createTextNode(diff.prefix), added, document.createTextNode(diff.suffix));
    }
    sync();
  };
  const showPreview = (text: string, source: 'manual' | 'ai' | 'template', explanation = '', bind = true) => {
    if (bind && (!target || stale || loading)) throw new Error(targetHint());
    if (bind) editor.assertCurrentPosition(target!, mode);
    const draft = mode === 'draft';
    text = draft ? validateDraft(text) : validateRevision(bind ? target!.text : '', text);
    proposal = { text, source, explanation };
    reviewText.value = text; reviewTarget = bind ? target : null; stage = 'review';
    say('');
    refreshReviewText();
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const showDraftPreview = (text: string, source: Proposal['source'], explanation = '') => {
    if (target && !stale) {
      try { editor.assertCurrentPosition(target, 'draft'); }
      catch { target = null; showTarget(); }
    }
    showPreview(text, source, explanation, !!target && !stale);
  };
  const refreshConnection = async () => {
    const epoch = ++connectionEpoch;
    localRefresh.disabled = accountRefresh.disabled = true;
    let status: AiConnection | null = null;
    let errorMessage = '';
    try {
      status = await readAiConnection(AbortSignal.timeout(10000));
    } catch (error) {
      errorMessage = (error as Error).message;
    }
    if (epoch !== connectionEpoch) return;
    const wasInAccount = account.contains(document.activeElement);
    connection = status;
    const configured = status?.configured === true;
    const managed = managedSite();
    const needsLogin = managed && (status?.reason === 'login_required' || status?.reason === 'platform_gate');
    find('[data-ai-settings-toggle]').hidden = managed || configured || !status || status.reason === 'local_only';
    if (managed || configured) {
      find('[data-ai-settings]').hidden = true;
      find('[data-ai-settings-toggle]').setAttribute('aria-expanded', 'false');
    }
    account.hidden = !managed || configured;
    login.hidden = !needsLogin;
    accountRefresh.textContent = needsLogin ? '로그인 확인' : '다시 확인';
    find('[data-ai-account-message]').textContent = status?.reason === 'platform_gate'
      ? '코더스 로그인 또는 이용 한도를 확인해 주세요. 로그인은 새 탭에서 열려요.'
      : needsLogin ? 'AI로 글을 쓰려면 코더스에 로그인해 주세요. 로그인은 새 탭에서 열려요.'
        : errorMessage || '지금 AI에 연결할 수 없어요. 잠시 후 다시 확인해 주세요.';
    localRefresh.disabled = accountRefresh.disabled = false;
    showMode();
    if (wasInAccount && configured) focusInput();
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
      if (input instanceof HTMLTextAreaElement) input.rows = 2;
      input.addEventListener('invalid', () => { if (input.validity.valueMissing) input.setCustomValidity(`${field.label}: 내용을 입력해 주세요.`); });
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        values[field.id] = input.value;
        const wasWriting = !!request;
        abort();
        if (proposal?.source === 'template' || proposal?.source === 'ai') detachReview();
        else sync();
        say(wasWriting ? '내용이 바뀌어 초안 만들기를 취소했어요.' : '');
      });
      wrap.append(label, input); (field.required ? templateForm : optional).append(wrap);
    }
    if (optional.children.length > 1) templateForm.append(optional);
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-template-id]')) button.setAttribute('aria-pressed', String(button.dataset.templateId === templateId));
  };
  for (const template of WRITING_TEMPLATES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.templateId = template.id;
    const label = document.createElement('strong'); label.textContent = template.label;
    const hint = document.createElement('span'); hint.textContent = template.hint;
    button.append(label, hint);
    button.addEventListener('click', () => {
      if (templateId === template.id) return;
      templateId = template.id;
      cancelRequest(); detachReview(); say(''); renderTemplateFields();
    });
    find('[data-template-choices]').append(button);
  }
  templateForm.addEventListener('submit', event => event.preventDefault());
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
    if (stage === 'compose') focusInput();
  };
  trigger.addEventListener('pointerdown', () => capture());
  trigger.addEventListener('click', () => open ? close() : show());
  find('[data-ai-close]').addEventListener('click', close);
  const setLargeText = (large: boolean) => {
    panel.classList.toggle('workspace-writing-large', large);
    find('[data-ai-size]').setAttribute('aria-pressed', String(large));
    find('[data-ai-size]').textContent = large ? '기본 글자' : '글자 크게';
  };
  try { setLargeText(localStorage.getItem('rhwp.writing-large-text') === 'true'); } catch { /* The default size works without storage. */ }
  find('[data-ai-size]').addEventListener('click', () => {
    const large = !panel.classList.contains('workspace-writing-large');
    setLargeText(large);
    try { localStorage.setItem('rhwp.writing-large-text', String(large)); }
    catch { say('글자 크기는 바꿨어요. 브라우저 설정 때문에 다음 방문까지 기억하지 못해요.'); }
  });
  find('[data-ai-settings-toggle]').addEventListener('click', () => {
    const settings = find('[data-ai-settings]'); settings.hidden = !settings.hidden;
    find('[data-ai-settings-toggle]').setAttribute('aria-expanded', String(!settings.hidden));
  });
  localRefresh.addEventListener('click', () => void refreshConnection());
  accountRefresh.addEventListener('click', () => void refreshConnection());
  login.addEventListener('click', () => { checkingLoginOnReturn = true; });
  window.addEventListener('focus', () => {
    if (!checkingLoginOnReturn) return;
    checkingLoginOnReturn = false;
    void refreshConnection();
  });
  find('[data-ai-capture]').addEventListener('click', () => capture(true));
  reviewText.addEventListener('input', () => { abort(); refreshReviewText(); });
  find('[data-review-rebind]').addEventListener('click', () => {
    if (!target || stale) { close(); getInput()?.focus(); return; }
    try {
      const pending = proposal!;
      capture(true);
      showPreview(pending.text, pending.source, '현재 위치를 확인했어요. 글을 읽고 반영해 주세요.');
    } catch (error) { detachReview(); say((error as Error).message, true); }
  });
  find('[data-review-resume]').addEventListener('click', () => {
    if (proposal) {
      abort();
      stage = 'review'; refreshReviewText(); preview.focus();
    }
  });
  const writingLibrary = installWritingLibrary(find('[data-writing-library]'), {
    current: () => ({ mode, method, templateId, templateValues, prompt: prompt.value, manual: manual.value,
      ...(proposal ? { preview: { text: proposal.text, source: proposal.source } } : {}) }),
    onOpenChange: isOpen => {
      libraryOpen = isOpen;
      if (isOpen && request) { abort(); say('요청을 취소했어요. 작성하던 글은 그대로예요.'); }
      sync();
    },
    restore: restored => {
      abort(); mode = restored.mode; method = restored.method; templateId = restored.templateId;
      for (const key of Object.keys(templateValues)) delete templateValues[key as WritingTemplateId];
      Object.assign(templateValues, restored.templateValues);
      prompt.value = restored.prompt; manual.value = restored.manual;
      inputs[mode] = { prompt: restored.prompt, manual: restored.manual, preview: restored.preview };
      target = null; stale = false; clearProposal();
      renderTemplateFields(); showMode(); capture();
      if (restored.preview) showPreview(restored.preview.text, restored.preview.source, '', false);
      else focusInput();
      say('초안을 불러왔어요. 문서 내용은 바뀌지 않았어요.');
    },
  });
  returnToWriting.addEventListener('click', () => writingLibrary.close());
  chat.addEventListener('click', () => {
    abort(); method = method === 'template' ? 'ai' : 'template'; detachReview(); say(''); showMode();
    if (method === 'ai') prompt.focus();
    else find<HTMLButtonElement>(`[data-template-id="${templateId}"]`).focus();
  });
  for (const button of modeButtons) button.addEventListener('click', () => {
    const next = button.dataset.aiMode as keyof typeof inputs;
    if (next === mode) return;
    writingLibrary.resetActive();
    inputs[mode] = { prompt: prompt.value, manual: manual.value, ...(proposal ? { preview: { ...proposal } } : {}) };
    abort(); mode = next; target = null; stale = false;
    prompt.value = inputs[mode].prompt;
    manual.value = inputs[mode].manual;
    clearProposal();
    const previous = inputs[mode].preview;
    if (previous) { proposal = { ...previous }; reviewText.value = previous.text; }
    say(''); showMode(); capture(); focusInput();
  });
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-ai-prompt]')) button.addEventListener('click', () => {
    prompt.value = button.dataset.aiPrompt!; prompt.dispatchEvent(new Event('input')); prompt.focus();
  });
  prompt.addEventListener('input', () => {
    // Keep the in-flight request and its captured destination while the next prompt is typed.
    if (proposal?.source === 'ai') { detachReview(); say('이전에 만든 글은 남아 있어요. 새 요청으로 만들 수도 있어요.'); }
    sync();
  });
  autoApply.addEventListener('change', sync);
  let composingText = false;
  let compositionEndedAt = -Infinity;
  prompt.addEventListener('compositionstart', () => { composingText = true; });
  prompt.addEventListener('compositionend', () => { composingText = false; compositionEndedAt = performance.now(); });
  prompt.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229
      || composingText || performance.now() - compositionEndedAt < 50
      || event.repeat || generate.disabled || generate.parentElement !== composerActions) return;
    event.preventDefault();
    generate.click();
  });
  manual.addEventListener('input', () => { if (proposal?.source === 'manual') detachReview(); sync(); });
  manualPreview.addEventListener('click', () => {
    try {
      if (mode === 'draft') showDraftPreview(manual.value, 'manual');
      else showPreview(manual.value, 'manual');
    } catch (error) { say((error as Error).message, true); }
  });
  const readTemplate = () => {
    if (!templateForm.reportValidity()) return null;
    try { return renderWritingTemplate(templateId, templateValues[templateId] ?? {}); }
    catch (error) { say((error as Error).message, true); return null; }
  };
  const previewTemplate = () => {
    const text = readTemplate();
    if (text) showDraftPreview(text, 'template');
  };
  templatePreview.addEventListener('click', previewTemplate);
  generate.addEventListener('click', async () => {
    if (stage !== 'compose' || generate.disabled) return;
    if (!connection?.configured) {
      if (mode === 'draft') previewTemplate();
      else {
        try { showPreview(manual.value, 'manual'); }
        catch (error) { say((error as Error).message, true); }
      }
      return;
    }
    capture();
    if (!target || stale) { say(targetHint(), true); return; }
    let input: AiWritingRequest;
    if (mode === 'draft') {
      if (method === 'template') {
        const details = readTemplate();
        if (!details) return;
        input = { mode, template: templateId, details };
      } else {
        input = { mode, prompt: prompt.value };
      }
    } else {
      if (!target) return;
      try { editor.assertCurrentPosition(target, mode); }
      catch (error) { stale = true; say((error as Error).message, true); sync(); return; }
      input = { mode, text: target.text, prompt: prompt.value };
    }
    detachReview();
    const controller = new AbortController(); request = controller;
    const captured = target;
    const applyImmediately = autoApply.checked;
    const submittedPrompt = prompt.value;
    if (generate.parentElement === composerActions) prompt.focus({ preventScroll: true });
    say(generate.parentElement === composerActions ? '' : '글을 준비하고 있어요. 잠시만 기다려 주세요.');
    sync();
    try {
      const result = await makeAiWriting(input, AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]));
      if (request !== controller) return;
      // Keep the exact request destination. Moving the cursor does not cancel generation.
      // A changed document is never overwritten: preserve the answer for explicit review instead.
      const keepPromptFocus = document.activeElement === prompt || document.activeElement === generate;
      if (applyImmediately) {
        try {
          editor.assertCurrent(captured);
          applying = true;
          if (input.mode === 'draft') editor.applyDraft(captured, result.text, true);
          else editor.apply(captured, result.text);
          proposal = null; reviewTarget = null; reviewError = ''; stage = 'compose';
          target = null; stale = false;
          appliedRevision = editor.revision;
          find('[data-ai-receipt-title]').textContent = input.mode === 'draft' ? '문서에 작성했어요' : '선택한 문장을 다듬었어요';
          find('[data-ai-receipt-text]').textContent = result.text;
          find('[data-ai-receipt-note]').textContent = result.explanation || '요청을 계속 입력하거나 문서에서 직접 편집하세요.';
          if (prompt.value === submittedPrompt) prompt.value = '';
          say('문서에 반영했어요. 잘못된 내용은 되돌릴 수 있어요.');
          if (keepPromptFocus) prompt.focus({ preventScroll: true });
        } catch (error) {
          showPreview(result.text, 'ai', result.explanation, false);
          say('작성한 글은 아래에 남겨 두었어요. ' + (error as Error).message, true);
        } finally { applying = false; }
      } else {
        let safe = false;
        try { editor.assertCurrentPosition(captured, input.mode); safe = true; } catch { /* Review after a document change. */ }
        target = captured;
        showPreview(result.text, 'ai', result.explanation, safe);
      }
    } catch (error) {
      if (request !== controller) return;
      say(controller.signal.aborted ? '요청을 취소했어요. 문장은 그대로예요.' : (error as Error).message, !controller.signal.aborted);
      if (error instanceof AiAccessError) void refreshConnection();
    } finally { if (request === controller) request = null; sync(); }
  });
  cancel.addEventListener('click', () => {
    cancelRequest();
    say('요청을 취소했어요. 적은 내용은 남아 있어요.');
    focusInput();
  });
  discard.addEventListener('click', () => {
    stage = 'compose'; sync(); say('만든 글은 ‘이전에 만든 글 계속 보기’에 남아 있어요.');
    if (proposal?.source === 'manual') {
      find<HTMLDetailsElement>('.workspace-ai-manual').open = true;
      manual.focus();
    } else focusInput();
  });
  apply.addEventListener('click', () => {
    if (!reviewTarget || !proposal || apply.disabled) return;
    try {
      editor.assertCurrentPosition(reviewTarget, mode);
      applying = true;
      if (mode === 'draft') editor.applyDraft(reviewTarget, proposal.text);
      else editor.apply(reviewTarget, proposal.text);
      target = null; stale = false; manual.value = '';
      reviewTarget = null; stage = 'done'; sync(); showTarget(); say('');
      showToast({ message: '문서에 넣었어요.' });
      find('[data-writing-done]').focus();
    } catch (error) { stale = true; detachReview(); say((error as Error).message, true); }
    finally { applying = false; sync(); }
  });
  find('[data-ai-document]').addEventListener('click', () => {
    if (sheet) {
      sheet.dialog.addEventListener('close', () => requestAnimationFrame(() => getInput()?.focus()), { once: true });
      close();
    } else getInput()?.focus();
  });
  undo.addEventListener('click', () => {
    if (undo.disabled || appliedRevision !== editor.revision) return;
    if (dispatcher.dispatch('edit:undo')) {
      find('[data-ai-receipt-title]').textContent = '방금 작성한 글을 되돌렸어요';
      appliedRevision = null; sync(); say('방금 작성한 글을 되돌렸어요. 요청을 다시 입력할 수 있어요.'); prompt.focus({ preventScroll: true });
    }
  });
  continueWriting.addEventListener('click', () => { writingLibrary.resetActive(); clearProposal(); say(''); capture(); if (sheet) close(); else getInput()?.focus(); });
  download.addEventListener('click', () => {
    const save = () => { if (!dispatcher.dispatch('file:save')) showToast({ message: '문서가 준비된 뒤 상단 파일 저장을 눌러 주세요.' }); };
    if (sheet) { sheet.dialog.addEventListener('close', () => requestAnimationFrame(save), { once: true }); close(); }
    else save();
  });
  panel.addEventListener('keydown', event => {
    if (!event.isComposing && event.key === 'Escape' && !sheet) { event.preventDefault(); close(); }
    if (!sheet) event.stopPropagation();
  });
  bus.on('document-changed', () => {
    editor.revision++;
    if (applying) return;
    appliedRevision = null;
    if (stage === 'done') stage = 'compose';
    // An in-flight answer remains useful even when its original document location becomes stale.
    if (target) {
      const reviewing = stage === 'review';
      target = null; stale = true;
      detachReview(); showTarget();
      if (reviewing) say('문서가 바뀌었지만 작성한 글은 남아 있어요. 넣을 위치를 다시 확인해 주세요.');
    }
    sync();
  });
  bus.on('document-loading', busy => {
    loading = busy === true;
    sync();
    if (busy !== true) return;
    appliedRevision = null;
    find('[data-ai-receipt-text]').textContent = '';
    receipt.hidden = true;
    cancelRequest(); target = null; detachReview(); stale = false;
    if (stage === 'done') stage = 'compose';
    find('[data-ai-selected]').textContent = '문서를 여는 중이에요. 준비가 끝나면 문장을 선택해 주세요.';
    if (sheet) close();
  });
  bus.on('document-loaded', () => {
    loading = false; target = null; stale = false; detachReview();
    showTarget();
    if (proposal) say('새 문서에 넣을 위치를 확인해 주세요. 작성한 글은 유지했어요.'); else say('');
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
