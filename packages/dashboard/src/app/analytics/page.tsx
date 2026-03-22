'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatCard } from '@/components/stat-card';

export default function AnalyticsPage() {
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: api.getAnalytics,
  });

  const stats = analytics?.data;
  const typeDistribution: Record<string, number> = stats?.type_distribution ?? {};
  const maxTypeCount = Math.max(...Object.values(typeDistribution), 1);

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">ANALYTICS</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Memory Analytics</h2>
      </div>

      {isLoading && (
        <div className="text-sm text-[var(--text3)]">Loading analytics...</div>
      )}

      {error && (
        <div className="bg-[rgba(248,113,113,0.08)] border border-[var(--red)] rounded-xl p-5 text-sm text-[var(--red)]">
          Failed to load analytics: {(error as Error).message}
        </div>
      )}

      {stats && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Memories"
              value={stats.total_memories ?? 0}
              trend={stats.creation_rate_7d ? `+${stats.creation_rate_7d}/day this week` : undefined}
            />
            <StatCard
              label="Creation Rate"
              value={stats.creation_rate_7d ? `${stats.creation_rate_7d}/d` : '—'}
              sub="7-day average"
            />
            <StatCard
              label="Avg Importance"
              value={stats.avg_importance != null ? Number(stats.avg_importance).toFixed(1) : '—'}
              sub="out of 10"
            />
            <StatCard
              label="Stale Memories"
              value={stats.stale_count ?? 0}
              sub="need review"
            />
          </div>

          {/* Type distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-5">Type Distribution</h3>
              {Object.keys(typeDistribution).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(typeDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type}>
                        <div className="flex justify-between mb-1">
                          <span className="text-[12px] text-[var(--text2)] capitalize">{type}</span>
                          <span className="text-[12px] text-[var(--text3)] font-mono">{count}</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--bg2)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] rounded-full transition-all"
                            style={{ width: `${(count / maxTypeCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text3)]">No type data available yet.</p>
              )}
            </div>

            <div className="space-y-4">
              {/* Additional stats */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Projects</h3>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Total Projects</span>
                    <span className="text-[var(--text2)]">{stats.total_projects ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Active (30d)</span>
                    <span className="text-[var(--text2)]">{stats.active_projects_30d ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Storage</h3>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Total Tags Used</span>
                    <span className="text-[var(--text2)]">{stats.total_tags ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Avg per Memory</span>
                    <span className="text-[var(--text2)]">
                      {stats.total_memories > 0
                        ? ((stats.total_tags ?? 0) / stats.total_memories).toFixed(1)
                        : '0'} tags
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Health</h3>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Stale Ratio</span>
                    <span className="text-[var(--text2)]">
                      {stats.total_memories > 0
                        ? ((stats.stale_count ?? 0) / stats.total_memories * 100).toFixed(1)
                        : '0'}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Needs Review</span>
                    <span className={`${(stats.stale_count ?? 0) > 0 ? 'text-[var(--amber)]' : 'text-[var(--green)]'}`}>
                      {(stats.stale_count ?? 0) > 0 ? `${stats.stale_count} memories` : 'All clear'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
