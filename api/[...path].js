// Single Vercel serverless function handling every /api/* route. The server logic is
// imported dynamically inside the handler so that ANY failure (e.g. a bundling/module
// issue) surfaces as a readable JSON 500 instead of an opaque FUNCTION_INVOCATION_FAILED.
export default async function handler(req, res) {
  try {
    const { handleRequest } = await import('../server.mjs');
    return await handleRequest(req, res);
  } catch (error) {
    console.error('API function error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Server function error',
        detail: String((error && error.message) || error),
        stack: (error && error.stack) ? String(error.stack).split('\n').slice(0, 4) : undefined
      }));
    }
  }
}
