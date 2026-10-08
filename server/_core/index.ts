import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { processMonnifyWebhook } from "../monnify";
import { processRobaseWebhook, RobaseWebhookError } from "../robase";
import { registerAccountAvatarRoute } from "./accountAvatar";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp({ serveClient = true }: { serveClient?: boolean } = {}) {
  const app = express();
  const server = createServer(app);
  app.post("/api/payments/monnify/webhook", express.raw({ type: "application/json", limit: "5mb" }), async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body ?? {});
      const result = await processMonnifyWebhook(rawBody, req.header("monnify-signature"));
      res.status(200).json({ ok: true, result });
    } catch (error) {
      console.error("[Monnify] Webhook rejected:", error);
      res.status(400).json({ ok: false });
    }
  });
  app.post("/api/webhooks/robus", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ ok: false });
      return;
    }
    try {
      const result = await processRobaseWebhook(
        req.body,
        req.header("x-robase-signature"),
        req.header("x-robase-event"),
      );
      if ("unknownMessage" in result && result.unknownMessage) {
        res.status(503).json({ ok: false });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof RobaseWebhookError) {
        if (error.kind === "signature") {
          console.warn("[Robase] Invalid webhook signature");
          res.status(403).json({ ok: false });
          return;
        }
        if (error.kind === "malformed") {
          console.warn("[Robase] Malformed webhook");
          res.status(400).json({ ok: false });
          return;
        }
        if (error.kind === "configuration") {
          console.error("[Robase] Webhook secret is not configured");
          res.status(503).json({ ok: false });
          return;
        }
      }
      console.error("[Robase] Webhook processing failed");
      res.status(500).json({ ok: false });
    }
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerAccountAvatarRoute(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else if (serveClient) {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  }
  return { app, server };
}

async function startServer() {
  const { app, server } = await createApp();
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer().catch(console.error);
}
