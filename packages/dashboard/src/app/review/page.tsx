'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  decision: { bg: 'rgba(124,111,224,0.12)', text: 'var(--accent2)' },
  context: { bg: 'rgba(45,212,191,0.10)', text: 'var(--teal)' },
  preference: { bg: 'rgba(251,191,36,0.10)', text: 'var(--amber)' },
  thread: { bg: 'rgba(129,140,248,0.10)', text: 'var(--indigo)' },
  error: { bg: 'rgba(248,113,113,0.10)', text: 'var(--red)' },
  learning: { bg: 'rgba(52,211,153,0.10)', text: 'var(--green)' },
};

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

function formatAge(dateStr: string): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / MS_PER_DAY);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(ms / MS_PER_HOUR);
  if (hours > 0) return `${hours}h ago`;
  return 'recently';
}

export default function ReviewPage() {
  const queryClient = useQueryClient();

  const { data: stale, isLoading, error } = useQuery({
    queryKey: ['stale-memories'],
    queryFn: () => api.getStaleMemories(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.updateMemory(id, { stale: false, reviewed_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stale-memories'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.updateMemory(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stale-memories'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stale-memories'] }),
  });

  const memories = stale?.data ?? [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">REVIEW</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Stale Memories</h2>
        <p className="text-sm text-[var(--text3)] mt-1">
          {memories.length} memor{memories.length === 1 ? 'y' : 'ies'} flagged for review
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-[var(--text3)]">Loading stale memories...</div>
      )}

      {error && (
        <div className="bg-[rgba(248,113,113,0.08)] border border-[var(--red)] rounded-xl p-5 text-sm text-[var(--red)]">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {!isLoading && memories.length === 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <p className="text-lg font-serif text-[var(--text2)] mb-2">All clear</p>
          <p className="text-sm text-[var(--text3)]">
            No stale memories to review. Everything is up to date.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {memories.map((memory: any) => {
          const colors = TYPE_COLORS[memory.type] || TYPE_COLORS.context;
          const isActing =
            approveMutation.variables === memory.id ||
            archiveMutation.variables === memory.id ||
            deleteMutation.variables === memory.id;

          return (
            <div
              key={memory.id}
              className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 transition-opacity ${
                isActing ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {memory.type}
                    </span>
                    <span className="text-[11px] text-[var(--text3)]">
                      Created {formatAge(memory.created_at)}
                    </span>
                    {memory.project_name && (
                      <span className="text-[11px] text-[var(--text3)] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded">
                        {memory.project_name}
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] text-[var(--text2)] leading-relaxed mb-2">
                    {memory.content}
                  </p>

                  {memory.tags && memory.tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {memory.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[10px] text-[var(--text3)] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => approveMutation.mutate(memory.id)}
                    disabled={isActing}
                    className="px-3 py-1.5 text-[11px] font-medium bg-[rgba(52,211,153,0.1)] text-[var(--green)] border border-[rgba(52,211,153,0.2)] rounded-lg hover:bg-[rgba(52,211,153,0.2)] transition-colors disabled:opacity-50"
                    title="Mark as still relevant"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => archiveMutation.mutate(memory.id)}
                    disabled={isActing}
                    className="px-3 py-1.5 text-[11px] font-medium bg-[rgba(251,191,36,0.1)] text-[var(--amber)] border border-[rgba(251,191,36,0.2)] rounded-lg hover:bg-[rgba(251,191,36,0.2)] transition-colors disabled:opacity-50"
                    title="Archive this memory"
                  >
                    Archive
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(memory.id)}
                    disabled={isActing}
                    className="px-3 py-1.5 text-[11px] font-medium bg-[rgba(248,113,113,0.1)] text-[var(--red)] border border-[rgba(248,113,113,0.2)] rounded-lg hover:bg-[rgba(248,113,113,0.2)] transition-colors disabled:opacity-50"
                    title="Permanently delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
