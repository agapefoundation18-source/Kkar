import { createApp } from "../dist/index.js";

const appPromise = createApp({ serveClient: false }).then(({ app }) => app);

export default async function handler(req, res) {
  const requestUrl = new URL(req.url ?? "/", "http://vercel.local");
  const routedPath = requestUrl.searchParams.get("__route");

  if (routedPath !== null) {
    requestUrl.searchParams.delete("__route");
    const normalizedPath = routedPath.replace(/^\/+/, "");
    if (!normalizedPath || normalizedPath.split("/").includes("..")) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid API route." }));
      return;
    }
    req.url = `/api/${normalizedPath}${requestUrl.search}`;
  }

  const app = await appPromise;
  return app(req, res);
}
