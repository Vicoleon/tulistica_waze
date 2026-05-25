import { trpc } from "@/lib/trpc";

export function useBrandAuth() {
  const { data, isLoading, refetch } = trpc.brandAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  // After the brand-cookie deprecation, brandAuth.me returns
  // { brand, memberships } instead of just brand.
  const brand = data?.brand ?? null;
  const memberships = data?.memberships ?? [];

  return {
    brand,
    memberships,
    loading: isLoading,
    isAuthenticated: !!brand,
    isVerified: !!brand?.emailVerified,
    refetch,
  };
}
