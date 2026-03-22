'use client';

/** Default daemon port for the Cortex REST API. */
const DAEMON_PORT = 7434;

const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:${DAEMON_PORT}`
  : `http://127.0.0.1:${DAEMON_PORT}`;

/**
 * Generic fetch wrapper for the Cortex daemon REST API.
 * Handles JSON serialization, error extraction, and 204 responses.
 */
async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || res.statusText);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const api = {
  // Health
  health: () => fetchAPI<any>('/api/health'),

  // Projects
  listProjects: () => fetchAPI<{ data: any[]; total: number }>('/api/projects'),
  getProject: (id: string) => fetchAPI<{ data: { project: any; stats: any } }>(`/api/projects/${id}`),
  updateProject: (id: string, body: any) => fetchAPI<{ data: any }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Memories
  listMemories: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchAPI<{ data: any[]; total: number }>(`/api/memories?${qs}`);
  },
  getMemory: (id: string) => fetchAPI<{ data: any }>(`/api/memories/${id}`),
  createMemory: (body: any) => fetchAPI<{ data: any }>('/api/memories', { method: 'POST', body: JSON.stringify(body) }),
  updateMemory: (id: string, body: any) => fetchAPI<{ data: any }>(`/api/memories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMemory: (id: string) => fetchAPI<void>(`/api/memories/${id}`, { method: 'DELETE' }),
  supersedeMemory: (id: string, body: any) => fetchAPI<{ data: any }>(`/api/memories/${id}/supersede`, { method: 'POST', body: JSON.stringify(body) }),
  searchMemories: (body: any) => fetchAPI<{ data: any[]; total: number }>('/api/memories/search', { method: 'POST', body: JSON.stringify(body) }),
  getStaleMemories: (projectId?: string) => {
    const qs = projectId ? `?project_id=${projectId}` : '';
    return fetchAPI<{ data: any[]; total: number }>(`/api/memories/stale${qs}`);
  },
  rateMemory: (id: string, rating: number) => fetchAPI<any>(`/api/memories/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating }) }),

  // Analytics
  getAnalytics: () => fetchAPI<{ data: any }>('/api/analytics'),

  // Config
  getConfig: () => fetchAPI<{ data: any }>('/api/config'),
  updateConfig: (body: any) => fetchAPI<{ data: any }>('/api/config', { method: 'PATCH', body: JSON.stringify(body) }),

  // Sync
  syncStatus: () => fetchAPI<{ data: any }>('/api/sync/status'),
  syncStart: () => fetchAPI<{ data: any }>('/api/sync/start', { method: 'POST' }),
  syncStop: () => fetchAPI<{ data: any }>('/api/sync/stop', { method: 'POST' }),
  syncNow: () => fetchAPI<{ data: any }>('/api/sync/now', { method: 'POST' }),
  syncSetup: (body: { url: string; token: string }) => fetchAPI<{ data: any }>('/api/sync/setup', { method: 'POST', body: JSON.stringify(body) }),

  // Sessions
  listSessions: (projectId: string, limit = 20) => fetchAPI<{ data: any[] }>(`/api/sessions?project_id=${projectId}&limit=${limit}`),

  // Pin/Unpin
  pinMemory: (id: string) => fetchAPI<{ data: any }>(`/api/memories/${id}/pin`, { method: 'POST' }),
  unpinMemory: (id: string) => fetchAPI<{ data: any }>(`/api/memories/${id}/unpin`, { method: 'POST' }),

  // Summarize
  triggerSummarize: (body?: any) => fetchAPI<{ data: any }>('/api/summarize', { method: 'POST', body: JSON.stringify(body || {}) }),
};
