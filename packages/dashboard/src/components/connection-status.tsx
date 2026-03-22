'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function ConnectionStatus() {
  const { isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 5000,
    retry: 1,
  });

  if (!isError) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--red)] text-white text-center py-2 text-sm font-medium">
      Cortex daemon is offline. Run: <code className="bg-white/20 px-2 py-0.5 rounded">cortex doctor --fix</code>
    </div>
  );
}
