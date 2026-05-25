export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Falls back gracefully when OAuth env vars are missing (e.g. local dev without
// a configured portal) so pages that import this helper don't crash on first render.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Tulistica] OAuth not configured (VITE_OAUTH_PORTAL_URL / VITE_APP_ID missing). Login flow disabled."
      );
    }
    return "/login";
  }

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[Tulistica] Failed to build login URL:", error);
    }
    return "/login";
  }
};
