'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error(`[cortex] Query failed [${String(query.queryKey)}]:`, error.message);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            console.error('[cortex] Mutation failed:', error.message);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30000,
            refetchInterval: 10000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
