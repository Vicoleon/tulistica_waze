import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => {
  const tokenStore = new Map<string, any>();

  return {
    getDb: vi.fn(async () => null),
    getUserById: vi.fn(),
    upsertUser: vi.fn(),
    createUserToken: vi.fn(async (data: any) => {
      tokenStore.set(data.token, { ...data, usedAt: null });
    }),
    consumeUserToken: vi.fn(async (token: string, expectedType: string) => {
      const t = tokenStore.get(token);
      if (!t || t.type !== expectedType || t.usedAt) return null;
      if (t.expiresAt.getTime() < Date.now()) return null;
      t.usedAt = new Date();
      return { userId: t.userId };
    }),
    invalidateUserTokensOfType: vi.fn(),
    markUserEmailVerified: vi.fn(),
    setUserPasswordHash: vi.fn(),
  };
});

vi.mock("./services/userAuth", async () => {
  const actual = await vi.importActual<typeof import("./services/userAuth")>(
    "./services/userAuth",
  );
  return {
    ...actual,
    sendUserEmail: vi.fn(async () => ({ delivered: true })),
  };
});

import express from "express";
import { registerLocalAuthRoutes } from "./_core/localAuth";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  return app;
}

async function post(app: any, path: string, body: any) {
  const http = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

describe("forgot-password / reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forgot-password returns 200 for unknown email (no enumeration)", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/forgot-password", { email: "ghost@nowhere.cr" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("forgot-password returns 200 even for malformed email body (no enumeration)", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/forgot-password", { wrong: "field" });
    expect(res.status).toBe(200);
  });

  it("reset-password fails for unknown token", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/reset-password", {
      token: "deadbeef".repeat(8),
      newPassword: "newpassword123",
    });
    expect(res.status).toBe(400);
  });

  it("reset-password fails for short password", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/reset-password", {
      token: "deadbeef".repeat(8),
      newPassword: "short",
    });
    expect(res.status).toBe(400);
  });
});
