import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { aiConfiguration, requestDraft, requestRewrite, validateRewrite, createAiMiddleware } from '../server/ai-service.mjs';

// Only injected test transports are used. No request goes to a real AI provider.
const env = { AI_ENABLED: 'true', OPENAI_API_KEY: 'unit-test-secret', OPENAI_MODEL: 'configured-test-model' };
const input = { text: '원래 문장', prompt: '공문체로 다듬어줘.', consent: true };
const response = (result = { revisedText: '수정 문장', explanation: '표현을 정리했어요.' }) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }));
const hasCode = code => error => error.code === code;

test('기본은 비활성이고 상태 응답에 API 키를 포함하지 않는다', () => {
  assert.equal(aiConfiguration({}).configured, false);
  assert.equal(aiConfiguration({ ...env, AI_ENABLED: 'false' }).reason, 'disabled');
  assert.equal(aiConfiguration({ ...env, OPENAI_API_KEY: '' }).reason, 'missing_key');
  assert.equal(aiConfiguration({ ...env, OPENAI_MODEL: '' }).reason, 'missing_model');
  assert.equal(JSON.stringify(aiConfiguration(env)).includes(env.OPENAI_API_KEY), false);
});
test('선택 문장/요청/동의의 범위와 형식을 서버에서 검사한다', () => {
  assert.equal(validateRewrite(input).text, input.text);
  for (const altered of [{ consent: false }, { text: '가'.repeat(2001) }, { text: '줄\n바꿈' }, { prompt: '' }, { prompt: '가'.repeat(1001) }, { wholeDocument: '허용 안 함' }]) assert.throws(() => validateRewrite({ ...input, ...altered }));
});
test('키 미연결이면 외부 전송을 시도하지 않는다', async () => {
  let calls = 0;
  await assert.rejects(requestRewrite(input, { env: {}, fetchImpl: () => { calls++; } }), hasCode('AI_NOT_CONFIGURED'));
  assert.equal(calls, 0);
});
test('선택 문장만 strict 구조화 출력으로 요청하고 저장과 임의 도구 실행을 사용하지 않는다', async () => {
  const result = await requestRewrite(input, { env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined); assert.equal(body.model, env.OPENAI_MODEL);
    assert.deepEqual(JSON.parse(body.input[0].content), { request: input.prompt, selectedText: input.text });
    return response();
  } });
  assert.equal(result.revisedText, '수정 문장');
});
test('권한/사용 한도 오류를 비밀값이나 공급자 원문 없이 안내한다', async () => {
  for (const [status, code] of [[401, 'AI_AUTH'], [403, 'AI_AUTH'], [429, 'AI_LIMIT'], [500, 'AI_UNAVAILABLE']]) {
    await assert.rejects(requestRewrite(input, { env, fetchImpl: async () => new Response(env.OPENAI_API_KEY, { status }) }), error => error.code === code && !error.message.includes(env.OPENAI_API_KEY));
  }
});
test('거절·불완전·비정상·줄바꿈 응답을 수정안으로 처리하지 않는다', async () => {
  const bodies = [
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'test' }] }] }, 'AI_REFUSED'],
    [{ status: 'incomplete', output: [] }, 'AI_INCOMPLETE'],
    [null, 'AI_INVALID_OUTPUT'],
    [{ status: 'completed', output: [] }, 'AI_INVALID_OUTPUT'],
  ];
  for (const [body, code] of bodies) await assert.rejects(requestRewrite(input, { env, fetchImpl: async () => new Response(JSON.stringify(body)) }), hasCode(code));
  await assert.rejects(requestRewrite(input, { env, fetchImpl: async () => response({ revisedText: '문단\n변경', explanation: 'test' }) }), hasCode('AI_INVALID_OUTPUT'));
});
test('취소와 네트워크 오류는 문서 수정안으로 반환하지 않는다', async () => {
  const c = new AbortController(); c.abort();
  await assert.rejects(requestRewrite(input, { env, signal: c.signal, fetchImpl: async () => { throw new Error('aborted'); } }), hasCode('AI_TIMEOUT'));
  await assert.rejects(requestRewrite(input, { env, fetchImpl: async () => { throw new Error('network'); } }), hasCode('AI_UNAVAILABLE'));
});

test('초안은 요청만 전송하고 줄바꿈을 보존하며 문서 본문 전송을 거부한다', async () => {
  const prompt = '모임 안내문을 써 주세요.';
  const draftText = '모임 안내\n\n날짜: [날짜]';
  const result = await requestDraft({ prompt, consent: true }, { env, fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(body.input[0].content), { request: prompt });
    assert.equal(body.text.format.name, 'hangul_draft');
    return response({ draftText, explanation: '' });
  } });
  assert.equal(result.draftText, draftText);
  await assert.rejects(requestDraft({ prompt, consent: true, text: '문서 내용' }, { env, fetchImpl: () => assert.fail('No external call expected') }), hasCode('INVALID_INPUT'));
  await assert.rejects(requestDraft({ prompt, consent: false }, { env, fetchImpl: () => assert.fail('No external call expected') }), hasCode('CONSENT_REQUIRED'));
});

test('실제 로컬 HTTP 경로: 상태/성공/Origin·Host·동의·본문 제한·호출 제한', async t => {
  let calls = 0;
  const middleware = createAiMiddleware({ env, fetchImpl: async () => { calls++; return response(); } });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(base + '/api/ai/status');
  assert.equal(status.status, 200); assert.equal((await status.json()).configured, true);
  const post = (value = input, extra = {}) => fetch(base + '/api/ai/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) });
  assert.equal((await post(input, { Origin: 'https://foreign.example' })).status, 403);
  const foreignHost = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/ai/rewrite', { method: 'POST', headers: { Host: 'foreign.example', 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end(JSON.stringify(input));
  });
  assert.equal(foreignHost, 403);
  assert.equal(calls, 0);
  assert.equal((await post({ ...input, consent: false })).status, 400);
  assert.equal((await post({ ...input, prompt: 'x'.repeat(25000) })).status, 413);
  const done = await post(); assert.equal(done.status, 200); assert.equal((await done.json()).revisedText, '수정 문장');
  assert.equal(calls, 1);
  for (let i = 0; i < 3; i++) await post();
  assert.equal((await post()).status, 429);
});

test('공개 Host는 설정과 무관한 비활성 상태만 읽고 생성은 외부 전송 없이 거부한다', async t => {
  let calls = 0;
  const middleware = createAiMiddleware({ env, fetchImpl: async () => { calls++; return response(); } });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method) => new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers: { Host: 'rhwp-workspace.coders.kr', 'Content-Type': 'application/json' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); req.end(method === 'POST' ? JSON.stringify(input) : undefined);
  });
  const status = await request('/api/ai/status', 'GET');
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { configured: false, reason: 'local_only', provider: 'OpenAI', model: null, maxTextLength: 2000 });
  for (const route of ['draft', 'rewrite']) {
    const rejected = await request(`/api/ai/${route}`, 'POST');
    assert.equal(rejected.status, 403); assert.equal(rejected.body.error.code, 'LOCAL_ONLY');
  }
  assert.equal(calls, 0);
});
