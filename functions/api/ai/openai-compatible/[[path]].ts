const PROVIDER_DEFAULT_BASE_URLS: Record<string, string> = {
  kimi: 'https://api.kimi.com/coding',
  moonshot: 'https://api.moonshot.cn',
};

const PROVIDER_BASE_URL_ENV: Record<string, string> = {
  kimi: 'KIMI_OPENAI_BASE_URL',
  moonshot: 'MOONSHOT_OPENAI_BASE_URL',
};

const corsHeaders = (request: Request): HeadersInit => {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const jsonResponse = (request: Request, status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const normalizeCatchAllPath = (path: unknown): string[] => {
  if (Array.isArray(path)) return path.map(String).filter(Boolean);
  if (typeof path === 'string') return path.split('/').filter(Boolean);
  return [];
};

const resolveAuthorization = (request: Request): string | null => {
  const incoming = request.headers.get('Authorization');
  const incomingToken = incoming?.replace(/^Bearer\s+/i, '').trim();

  if (!incomingToken || incomingToken === 'proxy' || incomingToken === 'dummy') {
    return null;
  }

  return incoming?.startsWith('Bearer ') ? incoming : `Bearer ${incomingToken}`;
};

const resolveUpstreamBaseUrl = (env: Record<string, string | undefined>, provider: string): string | null => {
  const configured = env[PROVIDER_BASE_URL_ENV[provider]];
  const baseUrl = configured || PROVIDER_DEFAULT_BASE_URLS[provider];
  return baseUrl ? baseUrl.replace(/\/+$/, '') : null;
};

export async function onRequest(context: any): Promise<Response> {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'method_not_allowed', message: 'Only POST is supported.' });
  }

  const pathParts = normalizeCatchAllPath(params.path);
  const provider = pathParts.shift()?.toLowerCase();

  if (!provider) {
    return jsonResponse(request, 400, {
      error: 'missing_provider',
      message: 'Use /api/ai/openai-compatible/:provider/v1/chat/completions.',
    });
  }

  const upstreamBaseUrl = resolveUpstreamBaseUrl(env, provider);
  if (!upstreamBaseUrl) {
    return jsonResponse(request, 404, {
      error: 'unknown_provider',
      message: `Provider "${provider}" is not configured for this proxy.`,
    });
  }

  const authorization = resolveAuthorization(request);
  if (!authorization) {
    return jsonResponse(request, 401, {
      error: 'missing_api_key',
      message: 'Missing API key. Configure the provider API key in NovelIDE settings so the browser can send it to this proxy.',
    });
  }

  const upstreamPath = pathParts.join('/');
  if (!upstreamPath) {
    return jsonResponse(request, 400, {
      error: 'missing_upstream_path',
      message: 'Missing OpenAI-compatible upstream path, for example v1/chat/completions.',
    });
  }

  const upstreamUrl = new URL(`${upstreamBaseUrl}/${upstreamPath}`);
  upstreamUrl.search = new URL(request.url).search;

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('Authorization', authorization);
  upstreamHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
  upstreamHeaders.set('Accept', request.headers.get('Accept') || 'application/json');

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: 'POST',
    headers: upstreamHeaders,
    body: request.body,
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    responseHeaders.set(key, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
