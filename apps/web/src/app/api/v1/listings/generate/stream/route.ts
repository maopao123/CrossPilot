import http from 'node:http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const api = new URL(process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001');
  const body = Buffer.from(await request.arrayBuffer());

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const upstream = http.request(
        {
          hostname: api.hostname,
          port: Number(api.port || 80),
          path: '/api/v1/listings/generate/stream',
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            'Content-Length': String(body.length),
            Authorization: request.headers.get('authorization') || '',
            'x-workspace-id': request.headers.get('x-workspace-id') || '',
            Connection: 'keep-alive',
          },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          res.on('end', () => controller.close());
          res.on('error', (err) => controller.error(err));
        },
      );
      upstream.on('error', (err) => controller.error(err));
      upstream.write(body);
      upstream.end();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
