'use client';

import { useState } from 'react';

const TEMPLATES = [
  {
    id: 'typescript-monorepo',
    name: 'TypeScript Monorepo',
    description: 'Monorepo setup with shared packages, workspace configuration, build tooling patterns, and cross-package dependency management.',
    icon: '◈',
    memoryCount: 24,
    tags: ['TypeScript', 'Turborepo', 'pnpm'],
  },
  {
    id: 'nestjs-api',
    name: 'NestJS API',
    description: 'Backend API patterns with modules, controllers, services, guards, interceptors, and database integration best practices.',
    icon: '◇',
    memoryCount: 18,
    tags: ['NestJS', 'Node.js', 'PostgreSQL'],
  },
  {
    id: 'nextjs-app',
    name: 'Next.js App',
    description: 'App Router patterns, server components, data fetching strategies, middleware, and deployment configuration.',
    icon: '▲',
    memoryCount: 21,
    tags: ['Next.js', 'React', 'Vercel'],
  },
  {
    id: 'aws-cdk',
    name: 'AWS CDK',
    description: 'Infrastructure as code patterns with CDK constructs, stack organization, cross-stack references, and deployment pipelines.',
    icon: '☁',
    memoryCount: 15,
    tags: ['AWS', 'CDK', 'CloudFormation'],
  },
  {
    id: 'tauri-app',
    name: 'Tauri App',
    description: 'Desktop application patterns with Rust backend, IPC communication, window management, and native system access.',
    icon: '⬡',
    memoryCount: 12,
    tags: ['Tauri', 'Rust', 'Desktop'],
  },
  {
    id: 'blank',
    name: 'Blank Template',
    description: 'Start with an empty memory set. Perfect for custom projects that do not fit existing templates.',
    icon: '○',
    memoryCount: 0,
    tags: [],
  },
];

export default function TemplatesPage() {
  const [applying, setApplying] = useState<string | null>(null);

  const handleApply = (templateId: string) => {
    setApplying(templateId);
    // Simulate apply delay
    setTimeout(() => {
      setApplying(null);
    }, 2000);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">TEMPLATES</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Memory Templates</h2>
        <p className="text-sm text-[var(--text3)] mt-1">
          Kickstart new projects with pre-built memory sets for common architectures.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TEMPLATES.map((template) => (
          <div
            key={template.id}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-xl w-8 h-8 flex items-center justify-center bg-[var(--bg2)] border border-[var(--border)] rounded-lg">
                {template.icon}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--text)]">{template.name}</h3>
                <span className="text-[11px] text-[var(--text3)] font-mono">
                  {template.memoryCount} {template.memoryCount === 1 ? 'memory' : 'memories'}
                </span>
              </div>
            </div>

            <p className="text-[12px] text-[var(--text3)] leading-relaxed mb-4 flex-1">
              {template.description}
            </p>

            {template.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-4">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-[var(--accent2)] bg-[rgba(124,111,224,0.08)] px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={() => handleApply(template.id)}
              disabled={applying === template.id}
              className={`w-full py-2 text-[12px] font-medium rounded-lg transition-all ${
                applying === template.id
                  ? 'bg-[var(--bg2)] text-[var(--text3)] cursor-wait'
                  : 'bg-[var(--bg2)] border border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent2)]'
              }`}
            >
              {applying === template.id ? 'Applying...' : 'Apply Template'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
