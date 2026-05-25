import { trpc } from "@/lib/trpc";

export function useBrandAuth() {
  const { data, isLoading, refetch } = trpc.brandAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  return {
    brand: data ?? null,
    loading: isLoading,
    isAuthenticated: !!data,
    isVerified: !!data?.emailVerified,
    refetch,
  };
}
