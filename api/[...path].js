// Single Vercel serverless function that handles every /api/* route by delegating to
// the same request handler used by the local server. Importing server.mjs does not start
// a listener on Vercel (it guards on process.env.VERCEL).
import { handleRequest } from '../server.mjs';

export default function handler(req, res) {
  return handleRequest(req, res);
}
