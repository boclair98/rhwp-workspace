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

test('양식 초안은 프롬프트 없이 글 종류와 기입 내용만 보내고 잘못된 요청을 거부한다', async () => {
  const details = `한글 교실 참가 신청\n\n신청 사유\n${'가'.repeat(1050)}`;
  const input = { template: 'application', details, consent: true };
  const result = await requestDraft(input, { env, fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(body.input[0].content), { documentType: '신청서', notes: details });
    assert.equal(body.store, false);
    return response({ draftText: '한글 교실 참가 신청서\n\n참가를 신청합니다.', explanation: '' });
  } });
  assert.match(result.draftText, /한글 교실 참가 신청서/);

  const noCall = { env, fetchImpl: () => assert.fail('No external call expected') };
  for (const change of [
    { template: 'unsupported' }, { details: '' }, { details: '가'.repeat(2001) },
    { details: Array(65).fill('가').join('\n') }, { details: '제목\x00내용' },
    { prompt: '양식과 함께 보낼 수 없음' }, { text: '문서 본문' },
  ]) {
    await assert.rejects(requestDraft({ ...input, ...change }, noCall), hasCode('INVALID_INPUT'));
  }
  await assert.rejects(requestDraft({ ...input, consent: false }, noCall), hasCode('CONSENT_REQUIRED'));
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

const managedEnv = {
  ...env,
  AI_RUNTIME: 'coders',
  CODERS_AI_ORIGIN: 'https://rhwp-workspace.coders.kr',
  CODERS_AI_BASE_URL: 'https://managed.example/llm/v1',
  CODERS_AI_TOKEN: 'managed-test-token',
  OPENAI_MODEL: 'gpt-4.1-mini',
};
const firstVisitor = 'f05d4379-ec4d-4bcc-b31e-148039c5e28d';
const secondVisitor = 'cb71d3a1-a844-4c81-b6ad-f945be544889';

async function nativeTestServer(t, fetchImpl, runtimeEnv = managedEnv) {
  const middleware = createAiMiddleware({ env: runtimeEnv, fetchImpl });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  // Simulate only the headers an internal Node service would receive from the gate.
  return {
    status: visitor => fetch(base + '/status', { headers: visitor ? { 'X-Coders-User': visitor } : {} }),
    post: (mode, value, visitor, headers = {}) => fetch(base + '/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(visitor ? { 'X-Coders-User': visitor } : {}), ...headers },
      body: JSON.stringify(value),
    }),
  };
}

test('Coders: 게이트 인증·동일 출처·전송 동의가 모두 있어야 생성한다', async t => {
  let calls = 0;
  const api = await nativeTestServer(t, async () => { calls++; return response(); });
  const anon = await api.status();
  assert.equal(anon.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await anon.json(), {
    configured: false, reason: 'login_required', provider: 'OpenAI', model: null, maxTextLength: 2000, deployment: 'coders',
  });
  const signedIn = await api.status(firstVisitor);
  assert.deepEqual(await signedIn.json(), {
    configured: true, reason: null, provider: 'OpenAI', model: managedEnv.OPENAI_MODEL, maxTextLength: 2000, deployment: 'coders',
  });
  const origin = { Origin: managedEnv.CODERS_AI_ORIGIN };
  for (const visitor of [null, 'forged', `${firstVisitor}, ${secondVisitor}`]) {
    assert.equal((await api.post('rewrite', input, visitor, origin)).status, 401);
  }
  for (const headers of [{}, { Origin: 'https://foreign.example' }, { ...origin, 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await api.post('rewrite', input, firstVisitor, headers)).status, 403);
  }
  assert.equal((await api.post('rewrite', { ...input, consent: false }, firstVisitor, origin)).status, 400);
  assert.equal((await api.post('draft', { prompt: input.prompt, consent: true, document: '전송 금지' }, firstVisitor, origin)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await api.post('rewrite', input, firstVisitor, origin)).status, 200);
  assert.equal(calls, 1);
});

test('Coders: 두 생성 경로가 프로젝트 토큰과 게이트 사용자만 전달하고 개인 키는 쓰지 않는다', async t => {
  const draft = { prompt: '모임 안내문을 작성해 주세요.', consent: true };
  const requests = [];
  const api = await nativeTestServer(t, async (url, options) => {
    requests.push({ url, options });
    const body = JSON.parse(options.body);
    return body.text.format.name === 'hangul_draft' ? response({ draftText: '모임 안내\n안녕하세요.', explanation: '' }) : response();
  });
  const headers = { Origin: managedEnv.CODERS_AI_ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
  const first = await api.post('draft', draft, firstVisitor, headers);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).draftText, '모임 안내\n안녕하세요.');
  const second = await api.post('rewrite', input, secondVisitor, headers);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).revisedText, '수정 문장');
  assert.equal(requests.length, 2);
  for (const [index, { url, options }] of requests.entries()) {
    assert.equal(url, 'https://managed.example/llm/v1/responses');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${managedEnv.CODERS_AI_TOKEN}`);
    assert.equal(options.headers['X-Coders-User'], index === 0 ? firstVisitor : secondVisitor);
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.model, managedEnv.OPENAI_MODEL);
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(JSON.parse(body.input[0].content), index === 0
      ? { request: draft.prompt }
      : { request: input.prompt, selectedText: input.text });
  }
});

test('Coders: 관리형 환경이 누락되면 개인 키로 우회하지 않는다', async t => {
  const api = await nativeTestServer(t, () => assert.fail('No provider request expected'), { ...managedEnv, CODERS_AI_TOKEN: '' });
  const status = await (await api.status(firstVisitor)).json();
  assert.equal(status.reason, 'service_unavailable');
  assert.equal(status.model, null);
  assert.equal((await api.post('rewrite', input, firstVisitor, { Origin: managedEnv.CODERS_AI_ORIGIN })).status, 503);
  assert.equal(aiConfiguration({ ...managedEnv, CODERS_AI_BASE_URL: 'https://managed.example/llm/v1?secret=ignored' }, firstVisitor).configured, false);
});

test('Coders: 한도는 사용자별로 적용하며 공급자 오류의 원문을 내보내지 않는다', async t => {
  const api = await nativeTestServer(t, async (_, options) => options.headers['X-Coders-User'] === secondVisitor
    ? new Response(managedEnv.CODERS_AI_TOKEN, { status: 402 }) : response());
  const origin = { Origin: managedEnv.CODERS_AI_ORIGIN };
  for (let i = 0; i < 6; i++) assert.equal((await api.post('rewrite', input, firstVisitor, origin)).status, 200);
  const limited = await api.post('rewrite', input, firstVisitor, origin);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'LOCAL_LIMIT');
  const quota = await api.post('rewrite', input, secondVisitor, origin);
  assert.equal(quota.status, 429);
  const body = await quota.json();
  assert.equal(body.error.code, 'AI_LIMIT');
  assert.equal(body.error.message.includes(managedEnv.CODERS_AI_TOKEN), false);
});

test('Coders 직접 연결: 전용 서버 키와 로그인에만 의존하고 식별자·키 노출 없이 하루 호출을 제한한다', async t => {
  const siteKey = 'site-test-secret';
  let calls = 0;
  const api = await nativeTestServer(t, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, `Bearer ${siteKey}`);
    assert.equal(options.headers['X-Coders-User'], undefined);
    assert.equal(JSON.parse(options.body).store, false);
    assert.equal(JSON.parse(options.body).max_output_tokens, 2048);
    return response();
  }, { ...managedEnv, CODERS_OPENAI_API_KEY: siteKey });
  assert.equal((await (await api.status()).json()).configured, false);
  const status = await (await api.status(firstVisitor)).json();
  assert.equal(status.configured, true);
  assert.equal(status.usage, 'site');
  assert.equal(JSON.stringify(status).includes(siteKey), false);
  const origin = { Origin: managedEnv.CODERS_AI_ORIGIN };
  assert.equal((await api.post('rewrite', input, null, origin)).status, 401);
  assert.equal((await api.post('rewrite', input, firstVisitor, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await api.post('rewrite', { ...input, consent: false }, firstVisitor, origin)).status, 400);
  assert.equal(calls, 0);
  for (let i = 0; i < 4; i++) assert.equal((await api.post('rewrite', input, firstVisitor, origin)).status, 200);
  const limited = await api.post('rewrite', input, firstVisitor, origin);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'SITE_DAILY_LIMIT');
  assert.equal(calls, 4);
  assert.equal((await api.post('rewrite', input, secondVisitor, origin)).status, 200);
});


test('일반 AI 안내문의 탭·다양한 줄바꿈을 안전하게 정규화하고 64줄까지 보존한다', async () => {
  const draftText = '안내문\r\n일시\t12월 3일\u2028장소: 주민센터\u2029' + Array(20).fill('내용').join('\n');
  const result = await requestDraft({prompt:'안내문',consent:true}, {env, fetchImpl: async () => response({draftText,explanation:''})});
  assert.equal(result.draftText.split('\n').length, 23);
  assert.match(result.draftText, /일시  12월 3일/);
  for (const text of [Array(65).fill('내용').join('\n'), '잘못된\x00글', '가'.repeat(2001)]) {
    await assert.rejects(requestDraft({prompt:'안내문',consent:true}, {env, fetchImpl: async () => response({draftText:text,explanation:''})}), hasCode('AI_INVALID_OUTPUT'));
  }
});
