import { BRAND_CONTEXT_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request, Response } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);
  // Browsers silently drop `SameSite=None` cookies that aren't `Secure`,
  // which causes a redirect loop in local HTTP dev. Fall back to `lax` over
  // plain HTTP and only opt into cross-site `none` when we're on HTTPS.
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

export function getActiveBrandIdFromRequest(req: Request): number | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const parsed = parseCookieHeader(cookieHeader);
  const raw = parsed[BRAND_CONTEXT_COOKIE_NAME];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setActiveBrandCookie(res: Response, req: Request, brandId: number): void {
  const opts = getSessionCookieOptions(req);
  res.cookie(BRAND_CONTEXT_COOKIE_NAME, String(brandId), {
    ...opts,
    maxAge: THIRTY_DAYS_MS,
  });
}

export function clearActiveBrandCookie(res: Response, req: Request): void {
  const opts = getSessionCookieOptions(req);
  res.cookie(BRAND_CONTEXT_COOKIE_NAME, "", {
    ...opts,
    maxAge: -1,
  });
}
