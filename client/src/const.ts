export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Primary login URL — points to the local email+password sign-in page.
// External OAuth (when configured) is offered as a button on that page.
export const SIGNIN_PATH = "/signin";

export const getLoginUrl = (): string => SIGNIN_PATH;

// Optional: third-party OAuth portal URL, kept for future re-integration.
export const getOAuthPortalUrl = (): string | null => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (!oauthPortalUrl || !appId) return null;

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl.replace(/\/+$/, "")}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch (error) {
    console.error("[auth] Failed to build OAuth URL:", error);
    return null;
  }
};
