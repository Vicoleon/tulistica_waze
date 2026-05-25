import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";
import type {
  AnalyticsEventName,
  AnalyticsProperties,
} from "../../../shared/analytics";

const SESSION_KEY = "tulistica.sessionId";

function readOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return `s_${Date.now()}`;
  }
}

/**
 * Tiny analytics hook. Use as:
 *
 *   const { track } = useAnalytics();
 *   track('product_search', { query: 'aceite', resultsCount: 12 });
 *
 * Fire-and-forget — the server swallows failures and we don't surface errors
 * to the caller. Avoid using `await track(...)` — never block UI on analytics.
 */
export function useAnalytics() {
  const mutation = trpc.analytics.track.useMutation({
    // Never let analytics show a toast or break a render. Errors are logged
    // server-side; the client is intentionally indifferent.
    retry: false,
  });

  const sessionId = useMemo(() => readOrCreateSessionId(), []);

  const track = useCallback(
    (eventName: AnalyticsEventName | string, properties?: AnalyticsProperties) => {
      mutation.mutate({
        eventName,
        properties: properties ?? {},
        sessionId,
      });
    },
    [mutation, sessionId]
  );

  return { track, sessionId };
}
