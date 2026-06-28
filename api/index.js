// The one and only Vercel serverless function. vercel.json routes ALL requests here,
// and handleRequest serves both static files and the API - exactly like the local server.
// server.mjs is imported (a plain module), so Vercel never treats it as a function itself.
export default async function handler(req, res) {
  try {
    const { handleRequest } = await import('../server.mjs');
    return await handleRequest(req, res);
  } catch (error) {
    console.error('API function error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Server function error', detail: String((error && error.message) || error) }));
    }
  }
}
