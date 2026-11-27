const ALLOWED_ORIGINS = ['https://leejy9.github.io', 'http://localhost:5173', 'http://localhost:4173'];

const AUDIO_MIME_TYPES = new Set(['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac']);
const SCORE_MIME_TYPES = new Set(['application/pdf']);

const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_SCORE_SIZE = 20 * 1024 * 1024; // 20MB

const EXT_BY_MIME = {
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
};

const OBJECT_KEY_REGEX = /^\d{4}\/(audio|score)\/[a-z0-9]{16}\.(m4a|mp3|aac|pdf)$/;

/** R2 range와 전체 크기로 응답 범위를 계산한다. 계산할 수 없으면 null. */
export function computeContentRange(range, size) {
  if (!range || !Number.isFinite(size) || size <= 0) return null;
  let start;
  let end;
  if (range.suffix !== undefined) {
    start = Math.max(size - range.suffix, 0);
    end = size - 1;
  } else {
    start = range.offset ?? 0;
    end = range.length !== undefined ? start + range.length - 1 : size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end) return null;
  return { start, end, header: `bytes ${start}-${end}/${size}`, length: end - start + 1 };
}

/** Supabase RPC fn_authorize_media_upload를 호출하여 관리자 권한을 검증한다. */
export async function authorizeAdmin(token, env) {
  if (!token || typeof token !== 'string') return false;
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  try {
    const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/fn_authorize_media_upload`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return false;
    const text = (await res.text()).trim();
    return text === 'true';
  } catch {
    return false;
  }
}

/** 16자 소문자 영숫자 난수 키를 생성한다. */
export function generateKey(kind, contentType) {
  const ext = EXT_BY_MIME[contentType];
  const year = new Date().getUTCFullYear();
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += chars[randomBytes[i] % chars.length];
  }
  return `${year}/${kind}/${rand}.${ext}`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, If-Range, X-Admin-Token, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Bad Request', { status: 400, headers: corsHeaders });
    }

    // 1. POST /upload?kind=audio|score
    if (request.method === 'POST') {
      if (url.pathname !== '/upload') {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }

      const kind = url.searchParams.get('kind');
      if (kind !== 'audio' && kind !== 'score') {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      const adminToken = request.headers.get('X-Admin-Token');
      const isAuthorized = await authorizeAdmin(adminToken, env);
      if (!isAuthorized) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }

      const contentLengthHeader = request.headers.get('Content-Length');
      if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader.trim())) {
        return new Response('Length Required', { status: 411, headers: corsHeaders });
      }
      const size = Number(contentLengthHeader);

      const rawContentType = (request.headers.get('Content-Type') || '').toLowerCase().split(';')[0].trim();
      const validTypes = kind === 'audio' ? AUDIO_MIME_TYPES : SCORE_MIME_TYPES;
      if (!validTypes.has(rawContentType)) {
        return new Response('Unsupported Media Type', { status: 415, headers: corsHeaders });
      }

      const maxSize = kind === 'audio' ? MAX_AUDIO_SIZE : MAX_SCORE_SIZE;
      if (size <= 0 || size > maxSize) {
        return new Response('Payload Too Large', { status: 413, headers: corsHeaders });
      }

      const key = generateKey(kind, rawContentType);
      await env.MEDIA_BUCKET.put(key, request.body, {
        httpMetadata: { contentType: rawContentType },
      });

      return new Response(JSON.stringify({ key, size }), {
        status: 201,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // 2. DELETE /object/{key}
    if (request.method === 'DELETE') {
      const adminToken = request.headers.get('X-Admin-Token');
      const isAuthorized = await authorizeAdmin(adminToken, env);
      if (!isAuthorized) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }

      let key;
      try {
        const decodedPath = decodeURIComponent(url.pathname);
        if (decodedPath.startsWith('/object/')) {
          key = decodedPath.slice('/object/'.length);
        } else {
          key = decodedPath.replace(/^\/+/, '');
        }
      } catch {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      if (!key || !OBJECT_KEY_REGEX.test(key)) {
        return new Response('Bad Request', { status: 400, headers: corsHeaders });
      }

      await env.MEDIA_BUCKET.delete(key);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 3. GET / HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    let key;
    try {
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch {
      return new Response('Bad Request', { status: 400, headers: corsHeaders });
    }
    if (!key) return new Response('Not Found', { status: 404, headers: corsHeaders });

    const object = await env.MEDIA_BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response('Not Found', { status: 404, headers: corsHeaders });

    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=604800, immutable');

    if (!('body' in object)) return new Response(null, { status: 304, headers });
    if (object.range) {
      const cr = computeContentRange(object.range, object.size);
      if (!cr) {
        headers.set('Content-Range', `bytes */${object.size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', cr.header);
      headers.set('Content-Length', String(cr.length));
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
    }
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  },
};
