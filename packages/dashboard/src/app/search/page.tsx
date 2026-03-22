'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MemoryCard } from '@/components/memory-card';

const MEMORY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'decision', label: 'Decision' },
  { value: 'context', label: 'Context' },
  { value: 'preference', label: 'Preference' },
  { value: 'thread', label: 'Thread' },
  { value: 'error', label: 'Error' },
  { value: 'learning', label: 'Learning' },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  });

  const { data: results, isLoading, isFetching } = useQuery({
    queryKey: ['search', submittedQuery, typeFilter, projectFilter],
    queryFn: () =>
      api.searchMemories({
        query: submittedQuery,
        ...(typeFilter && { type: typeFilter }),
        ...(projectFilter && { project_id: projectFilter }),
      }),
    enabled: submittedQuery.length > 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSubmittedQuery(query.trim());
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">SEARCH</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Search Memories</h2>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text3)] text-lg">⌕</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all memories..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-11 pr-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-[var(--accent)] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text2)] focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer"
        >
          {MEMORY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text2)] focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer"
        >
          <option value="">All Projects</option>
          {projects?.data?.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {(typeFilter || projectFilter) && (
          <button
            onClick={() => {
              setTypeFilter('');
              setProjectFilter('');
            }}
            className="text-xs text-[var(--text3)] hover:text-[var(--text)] px-3 py-2 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading || isFetching ? (
        <div className="text-sm text-[var(--text3)]">Searching...</div>
      ) : submittedQuery && results ? (
        <div>
          <p className="text-[12px] text-[var(--text3)] mb-4">
            {results.total} result{results.total !== 1 ? 's' : ''} for "{submittedQuery}"
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.data.map((memory: any) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
          {results.data.length === 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-sm text-[var(--text3)]">
                No memories found matching your search.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <p className="text-lg font-serif text-[var(--text2)] mb-2">Semantic Search</p>
          <p className="text-sm text-[var(--text3)] max-w-md mx-auto">
            Search across all your project memories using natural language. Results are ranked by relevance using vector similarity.
          </p>
        </div>
      )}
    </div>
  );
}
