const ALLOWED_ORIGINS = ['https://leejy9.github.io', 'http://localhost:5173', 'http://localhost:4173'];

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, If-Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    let key;
    try {
      key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
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
