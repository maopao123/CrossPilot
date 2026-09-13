export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
  const headers = new Headers();
  headers.set('Accept', 'text/event-stream');
  headers.set('Content-Type', 'application/json');
  const auth = request.headers.get('authorization');
  const workspaceId = request.headers.get('x-workspace-id');
  if (auth) headers.set('Authorization', auth);
  if (workspaceId) headers.set('x-workspace-id', workspaceId);

  const upstream = await fetch(`${api}/api/v1/listings/generate/stream`, {
    method: 'POST',
    headers,
    body: await request.text(),
  });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
