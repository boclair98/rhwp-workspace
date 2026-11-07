import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { initSync, HwpDocument } from '../pkg/rhwp.js';

// Deterministic provider fixtures only. The browser, RHWP edits, undo and downloaded HWP are real.
initSync({ module: fs.readFileSync(new URL('../pkg/rhwp_bg.wasm', import.meta.url)) });
const out = path.resolve('test-results/ui-ai');
fs.mkdirSync(out, { recursive: true });
const textOf = file => {
  const doc = new HwpDocument(fs.readFileSync(file));
  try { return JSON.parse(doc.getTextFileText()); } finally { doc.free(); }
};

test('AI browser regression: focus, direct edits, cancellation, preservation, HWP round trip and responsive UI', { timeout: 240000 }, async t => {
  const port = 7733;
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), AI_ENABLED: 'false' }, stdio: 'ignore', windowsHide: true });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let n = 0; n < 80; n++) {
    if (await fetch(base + '/healthz').then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {}) });
  t.after(async () => { await context.close(); await browser.close(); });
  const errors = [];
  const context = await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  context.setDefaultTimeout(15000);
  let nextText = '모임 안내\n12월 3일 주민센터에서 만나요.';
  let delayed = false, pending, calls = 0, failure = false;
  const waitPending = async () => {
    for (let n=0; n<100 && !pending; n++) await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(typeof pending, 'function', 'Provider fixture must receive the request');
  };
  await context.route('**/api/ai/status', r => r.fulfill({json:{configured:true, provider:'OpenAI', maxTextLength:2000}}));
  await context.route(/\/api\/ai\/(draft|rewrite)$/, async r => {
    calls++;
    const body = r.request().postDataJSON();
    const text = nextText;
    const reply = async () => {
      if (failure) await r.fulfill({status:503,json:{error:{code:'AI_UNAVAILABLE',message:'AI 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'}}});
      else await r.fulfill({json:{[r.request().url().endsWith('rewrite')?'revisedText':'draftText']:text, explanation:''}});
    };
    if (delayed) await new Promise(resolve => { pending = async () => { await reply().catch(()=>{}); resolve(); }; });
    else await reply();
    assert.equal(body.consent, true);
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const start = async p => {
    await p.goto(base);
    await p.getByRole('textbox',{name:'문서 편집 입력',exact:true}).waitFor({state:'attached'});
    await p.waitForFunction(()=>document.querySelector('#editor-area')?.getAttribute('aria-busy') !== 'true' && !document.querySelector('#editor-area')?.inert);
  };
  await start(page);
  const prompt = page.locator('#workspace-ai-prompt');
  const editor = page.getByRole('textbox',{name:'문서 편집 입력',exact:true});
  let saveCount = 0;
  const save = async name => {
    const promise = page.waitForEvent('download');
    await page.locator('[data-workspace-command="file:save"]').click();
    if (saveCount++ === 0) {
      await page.getByRole('textbox',{name:'파일 이름',exact:true}).fill('회귀 검증');
      await page.getByRole('button',{name:'확인',exact:true}).click();
    }
    const file = path.join(out, name + '.hwp');
    await (await promise).saveAs(file);
    return {file,text:textOf(file)};
  };
  await prompt.fill('모임 안내를 써 주세요.');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-ai-prompt');
  assert.equal(await page.locator('.caret').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  await prompt.press('Shift+Enter');
  assert.match(await prompt.inputValue(), /\n$/);
  await prompt.dispatchEvent('compositionstart');
  await prompt.press('Enter');
  assert.equal(calls,0,'IME Enter must not submit');
  await prompt.dispatchEvent('compositionend');
  await page.waitForTimeout(65);
  delayed = true; pending = undefined;
  await prompt.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('[data-ai-cancel]').hidden);
  await waitPending();
  await editor.focus(); await page.keyboard.press('Home');
  await prompt.fill('다음 요청은 지우지 마세요.');
  await pending(); delayed=false;
  await page.locator('[data-ai-receipt]').waitFor({state:'visible'});
  assert.equal(await prompt.inputValue(),'다음 요청은 지우지 마세요.');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-ai-prompt');
  assert.equal(calls,1);
  assert.equal(await page.locator('[data-ai-undo]').isEnabled(),true);
  console.log('PASS stage: direct');
  const first = await save('direct'); assert.match(first.text,/모임 안내/); assert.match(first.text,/12월 3일/);
  await page.locator('[data-ai-undo]').click();
  assert.equal((await save('undo')).text.trim(),'');
  await page.getByRole('button',{name:'다시 실행 (Ctrl+Shift+Z)',exact:true}).click();
  assert.match((await save('redo')).text,/모임 안내/);
  console.log('PASS stage: undo/redo');
  nextText='두 번째 안내'; await prompt.fill('두 번째 안내를 써 주세요.'); await prompt.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-ai-receipt-text]').textContent==='두 번째 안내');
  assert.match((await save('append')).text,/만나요\.\s+두 번째 안내/);
  console.log('PASS stage: append');
  await editor.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End');
  await page.getByRole('button',{name:'문장 다듬기',exact:true}).click();
  nextText='주민 모임 안내'; await prompt.fill('알기 쉽게 다듬어 주세요.'); await prompt.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-ai-receipt-text]').textContent==='주민 모임 안내');
  assert.match((await save('rewrite')).text,/주민 모임 안내/);
  console.log('PASS stage: rewrite');
  await page.getByRole('button',{name:'새 글 쓰기',exact:true}).click();
  await editor.focus(); await page.keyboard.press('Control+End');
  delayed=true; pending = undefined; nextText='보존할 AI 응답'; await prompt.fill('응답 대기 중 수정 시험'); await prompt.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('[data-ai-cancel]').hidden);
  await waitPending();
  await editor.focus(); await page.keyboard.insertText('사용자 추가 내용');
  await pending(); delayed=false;
  await page.locator('[data-ai-preview-section]').waitFor({state:'visible'});
  assert.equal(await page.locator('#workspace-review-text').inputValue(),'보존할 AI 응답');
  assert.equal(await page.locator('[data-ai-apply]').isEnabled(),false);
  const protectedDoc=await save('protected'); assert.match(protectedDoc.text,/사용자 추가 내용/); assert.doesNotMatch(protectedDoc.text,/보존할 AI 응답/);
  await editor.focus(); await page.keyboard.press('ArrowLeft');
  await page.locator('[data-review-rebind]').click();
  await page.locator('[data-ai-apply]').click();
  assert.match((await save('rebound')).text,/보존할 AI 응답/);
  console.log('PASS stage: rebind');
  await page.locator('[data-writing-continue]').click();
  delayed=true; pending = undefined; nextText='취소한 글'; await prompt.fill('취소 시험'); await prompt.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('[data-ai-cancel]').hidden);
  await waitPending();
  await page.locator('[data-ai-cancel]').click(); await pending(); delayed=false;
  assert.equal(await prompt.inputValue(),'취소 시험');
  assert.doesNotMatch((await save('cancelled')).text,/취소한 글/);
  console.log('PASS stage: cancel');
  failure=true; await prompt.fill('실패 시험'); await prompt.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-ai-feedback]').textContent.includes('서버에 연결'));
  assert.equal(await prompt.inputValue(),'실패 시험');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-ai-prompt'); failure=false;
  await page.locator('[data-ai-auto]').uncheck(); nextText='선택한 미리보기'; await prompt.fill('미리보기 시험'); await prompt.press('Enter');
  await page.locator('[data-ai-preview-section]').waitFor({state:'visible'});
  await page.locator('[data-ai-apply]').click();
  const reviewed=await save('reviewed'); assert.match(reviewed.text,/선택한 미리보기/);
  await page.locator('#file-input').setInputFiles(reviewed.file);
  await page.waitForFunction(()=>document.querySelector('#workspace-title').textContent.includes('reviewed'));
  assert.match((await save('reopened')).text,/선택한 미리보기/);
  console.log('PASS stage: reopen');
  delayed=true; pending = undefined; nextText='이전 문서에만 쓰려던 글'; await prompt.fill('문서 교체 시험'); await prompt.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('[data-ai-cancel]').hidden);
  await waitPending();
  await page.locator('#file-input').setInputFiles([]);
  await page.locator('#file-input').setInputFiles(reviewed.file);
  await page.waitForFunction(()=>document.querySelector('[data-ai-cancel]').hidden);
  await pending(); delayed=false;
  assert.doesNotMatch((await save('switched')).text,/이전 문서에만 쓰려던 글/);
  await page.screenshot({path:path.join(out,'desktop.png')});
  console.log('PASS stage: file switch');
  for (const [width,height] of [[360,800],[390,844],[768,1024],[390,480]]) {
    const mobile=await context.newPage(); mobile.on('pageerror', e=>errors.push(e.message));
    await mobile.setViewportSize({width,height}); await start(mobile);
    await mobile.locator('#workspace-ai-toggle').click();
    await mobile.locator('#workspace-ai-prompt').fill('모바일 안내문'); nextText='모바일 안내문\n모두 환영합니다.';
    await mobile.locator('#workspace-ai-prompt').press('Enter');
    await mobile.locator('[data-ai-receipt]').waitFor({state:'visible'});
    const layout=await mobile.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,focus:document.activeElement.id,send:document.querySelector('[data-ai-generate]').getBoundingClientRect().toJSON()}));
    assert.equal(layout.overflow,0); assert.equal(layout.focus,'workspace-ai-prompt'); assert.ok(layout.send.width>=44&&layout.send.height>=44);
    await mobile.screenshot({path:path.join(out,`mobile-${width}-${height}.png`)});
    await mobile.locator('[data-ai-document]').click();
    await mobile.locator('.workspace-ai-sheet').waitFor({state:'detached'});
    assert.equal(await mobile.getByRole('textbox',{name:'문서 편집 입력',exact:true}).evaluate(e=>e===document.activeElement),true);
    await mobile.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: direct writing, focus, IME guard, cursor movement, subsequent prompt, undo/redo, append, rewrite, edit protection, cancel, API failure, preview, HWP save/reopen, four mobile/tablet sizes');
});
