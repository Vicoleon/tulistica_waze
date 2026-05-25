import "dotenv/config";
import crypto from "crypto";

// Polyfill for Node < 21
if (typeof (crypto as any).hash !== 'function') {
  (crypto as any).hash = (algorithm: string, data: any, outputEncoding: any) => {
    return crypto.createHash(algorithm).update(data).digest(outputEncoding);
  };
}

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoutes } from "./devAuth";
import { registerLocalAuthRoutes } from "./localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { initializeSocketServer } from "../services/socketService";

// 10mb covers base64-encoded camera photos for the AI scanner (max ~8MB raw).
const BODY_LIMIT = "10mb";

function isPortAvailable(port: number): Promise<boolean> {
  // Bind to 127.0.0.1 explicitly — binding to 0.0.0.0 succeeds even when
  // another process holds 127.0.0.1:port, causing the dev server to silently
  // shadow another loopback service.
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function applySecurityHeaders(app: express.Express) {
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=(self), payment=()"
    );
    if (ENV.isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }
    next();
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  applySecurityHeaders(app);

  // Initialize WebSocket server for real-time features
  initializeSocketServer(server);

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Local email+password (primary auth path, always available)
  registerLocalAuthRoutes(app);
  // OAuth callback under /api/oauth/callback (only used if OAuth env is configured)
  registerOAuthRoutes(app);
  // Dev-mode mock login (only active when NODE_ENV=development AND MOCK_AUTH=true)
  registerDevAuthRoutes(app);

  // Mock-mode shim: /api/oauth/login is used by the marketing pages when
  // VITE_OAUTH_PORTAL_URL isn't set. In MOCK_AUTH mode it just redirects
  // home — createContext binds the mock user via cookie/header inspection.
  if (ENV.mockAuth) {
    app.get("/api/oauth/login", (_req, res) => res.redirect("/"));
  }

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
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = await findAvailablePort(ENV.port);

  if (port !== ENV.port) {
    console.log(`Port ${ENV.port} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(err => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
