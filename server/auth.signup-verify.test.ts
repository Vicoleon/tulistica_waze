import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => {
  const userTokenStore = new Map<string, any>();
  const users = new Map<number, any>();
  let nextId = 1;

  return {
    getDb: vi.fn(async () => null),
    getUserById: vi.fn(async (id: number) => users.get(id) ?? null),
    upsertUser: vi.fn(async (u: any) => {
      const id = nextId++;
      users.set(id, { id, ...u, emailVerified: false });
      return id;
    }),
    createUserToken: vi.fn(async (data: any) => {
      userTokenStore.set(data.token, { ...data, usedAt: null });
    }),
    consumeUserToken: vi.fn(async (token: string, expectedType: string) => {
      const t = userTokenStore.get(token);
      if (!t || t.type !== expectedType || t.usedAt) return null;
      if (t.expiresAt.getTime() < Date.now()) return null;
      t.usedAt = new Date();
      return { userId: t.userId };
    }),
    invalidateUserTokensOfType: vi.fn(),
    markUserEmailVerified: vi.fn(async (userId: number) => {
      const u = users.get(userId);
      if (u) u.emailVerified = true;
    }),
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
import * as db from "./db";
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
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  } finally {
    server.close();
  }
}

describe("verify-email flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verify-email rejects an unknown token with 400", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/verify-email", {
      token: "deadbeef".repeat(8),
    });
    expect(res.status).toBe(400);
  });

  it("verify-email rejects an empty token with 400", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/verify-email", { token: "" });
    expect(res.status).toBe(400);
  });
});
