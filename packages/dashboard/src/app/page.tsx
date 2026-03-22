'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { MemoryCard } from '@/components/memory-card';

export default function OverviewPage() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health });
  const { data: analytics } = useQuery({ queryKey: ['analytics'], queryFn: api.getAnalytics });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  const stats = analytics?.data;

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">OVERVIEW</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Memory Dashboard</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Memories"
          value={stats?.total_memories ?? '—'}
          trend={stats?.creation_rate_7d ? `+${stats.creation_rate_7d}/day this week` : undefined}
        />
        <StatCard
          label="Projects"
          value={projects?.total ?? '—'}
          sub={`${stats?.active_projects_30d ?? 0} active this month`}
        />
        <StatCard
          label="Avg Importance"
          value={stats?.avg_importance ?? '—'}
          sub="out of 10"
        />
        <StatCard
          label="Stale"
          value={stats?.stale_count ?? '—'}
          sub="need review"
        />
      </div>

      {/* Projects + Recent activity */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center">
              <h3 className="text-sm font-semibold text-[var(--text)]">Projects</h3>
              <a href="/projects" className="text-xs text-[var(--accent)]">View all →</a>
            </div>
            <div>
              {projects?.data?.map((p: any) => (
                <a
                  key={p.id}
                  href={`/projects?id=${p.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">{p.name}</p>
                    <p className="text-[11px] text-[var(--text3)] truncate">
                      {p.tech_stack?.join(' · ') || 'No tech stack set'}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text3)] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded">
                    {p.memory_count ?? 0}
                  </span>
                </a>
              ))}
              {(!projects?.data || projects.data.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-[var(--text3)]">
                  No projects yet. Open Claude Code in a project folder to start.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System info */}
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-3">System</h3>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Status</span>
                <span className="text-[var(--green)]">● {health?.status ?? 'unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Version</span>
                <span className="text-[var(--text2)]">{health?.version ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">DB Size</span>
                <span className="text-[var(--text2)]">{health?.db_size_mb ?? 0} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Uptime</span>
                <span className="text-[var(--text2)]">{health?.uptime_s ?? 0}s</span>
              </div>
            </div>
          </div>

          {/* Type distribution */}
          {stats?.type_distribution && Object.keys(stats.type_distribution).length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3">By Type</h3>
              <div className="space-y-2">
                {Object.entries(stats.type_distribution).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-[12px]">
                    <span className="text-[var(--text2)] capitalize">{type}</span>
                    <span className="text-[var(--text3)]">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
