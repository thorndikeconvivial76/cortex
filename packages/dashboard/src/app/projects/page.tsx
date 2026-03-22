'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

function formatAge(dateStr: string): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor(ms / MS_PER_HOUR);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">PROJECTS</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">All Projects</h2>
        <p className="text-sm text-[var(--text3)] mt-1">
          {projects?.total ?? 0} project{projects?.total !== 1 ? 's' : ''} tracked
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-[var(--text3)]">Loading projects...</div>
      )}

      {error && (
        <div className="bg-[rgba(248,113,113,0.08)] border border-[var(--red)] rounded-xl p-5 text-sm text-[var(--red)]">
          Failed to load projects: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects?.data?.map((project: any) => (
          <a
            key={project.id}
            href={`/projects?id=${project.id}`}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--border2)] transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent2)] transition-colors">
                  {project.name}
                </h3>
              </div>
              <span className="font-mono text-[11px] text-[var(--text3)] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded">
                {project.memory_count ?? 0} memories
              </span>
            </div>

            {project.description && (
              <p className="text-[12px] text-[var(--text3)] mb-3 line-clamp-2">
                {project.description}
              </p>
            )}

            {project.tech_stack && project.tech_stack.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {project.tech_stack.map((tech: string) => (
                  <span
                    key={tech}
                    className="text-[10px] text-[var(--accent2)] bg-[rgba(124,111,224,0.08)] px-2 py-0.5 rounded-full"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-[var(--text3)] pt-3 border-t border-[var(--border)]">
              <span>
                Last session: {project.last_session_at ? formatAge(project.last_session_at) : 'never'}
              </span>
              <span className="text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                View →
              </span>
            </div>
          </a>
        ))}
      </div>

      {!isLoading && (!projects?.data || projects.data.length === 0) && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <p className="text-lg font-serif text-[var(--text2)] mb-2">No projects yet</p>
          <p className="text-sm text-[var(--text3)]">
            Open Claude Code in a project folder to start tracking memories.
          </p>
        </div>
      )}
    </div>
  );
}
