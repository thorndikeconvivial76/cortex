/**
 * HTTP client for the Cortex daemon REST API at localhost:7434.
 * All CLI commands use this instead of direct SQLite access.
 */

export class APIClient {
  private baseUrl: string;

  constructor(port = 7434) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  /** Check if daemon is running */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** GET /api/health */
  async health() {
    return this.get<{
      status: string;
      version: string;
      db_ok: boolean;
      sync_ok: boolean;
      uptime_s: number;
      memory_count: number;
      db_size_mb: number;
      schema_version: number;
    }>('/api/health');
  }

  /** GET /api/projects */
  async listProjects() {
    return this.get<{ data: any[]; total: number }>('/api/projects');
  }

  /** GET /api/projects/:id */
  async getProject(id: string) {
    return this.get<{ data: { project: any; stats: any } }>(`/api/projects/${id}`);
  }

  /** PATCH /api/projects/:id */
  async updateProject(id: string, body: Record<string, unknown>) {
    return this.patch<{ data: any }>(`/api/projects/${id}`, body);
  }

  /** DELETE /api/projects/:id */
  async deleteProject(id: string) {
    return this.del(`/api/projects/${id}`);
  }

  /** GET /api/memories?project_id=X */
  async listMemories(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    return this.get<{ data: any[]; total: number }>(`/api/memories?${qs}`);
  }

  /** GET /api/memories/:id */
  async getMemory(id: string) {
    return this.get<{ data: any }>(`/api/memories/${id}`);
  }

  /** POST /api/memories */
  async createMemory(body: Record<string, unknown>) {
    return this.post<{ data: any }>('/api/memories', body);
  }

  /** PATCH /api/memories/:id */
  async updateMemory(id: string, body: Record<string, unknown>) {
    return this.patch<{ data: any }>(`/api/memories/${id}`, body);
  }

  /** DELETE /api/memories/:id */
  async deleteMemory(id: string) {
    return this.del(`/api/memories/${id}`);
  }

  /** POST /api/memories/:id/supersede */
  async supersedeMemory(id: string, body: Record<string, unknown>) {
    return this.post<{ data: any }>(`/api/memories/${id}/supersede`, body);
  }

  /** POST /api/memories/search */
  async searchMemories(body: Record<string, unknown>) {
    return this.post<{ data: any[]; total: number }>('/api/memories/search', body);
  }

  /** GET /api/memories/stale */
  async getStaleMemories(projectId?: string) {
    const qs = projectId ? `?project_id=${projectId}` : '';
    return this.get<{ data: any[]; total: number }>(`/api/memories/stale${qs}`);
  }

  /** POST /api/memories/:id/rate */
  async rateMemory(id: string, rating: number) {
    return this.post<{ data: { ok: boolean } }>(`/api/memories/${id}/rate`, { rating });
  }

  /** GET /api/sessions?project_id=X */
  async listSessions(projectId: string, limit = 20) {
    return this.get<{ data: any[] }>(`/api/sessions?project_id=${projectId}&limit=${limit}`);
  }

  /** GET /api/analytics */
  async getAnalytics() {
    return this.get<{ data: any }>('/api/analytics');
  }

  /** GET /api/config */
  async getConfig() {
    return this.get<{ data: any }>('/api/config');
  }

  /** PATCH /api/config */
  async updateConfig(body: Record<string, unknown>) {
    return this.patch<{ data: any }>('/api/config', body);
  }

  /** POST /api/sync/start */
  async startSync() {
    return this.post<{ data: any }>('/api/sync/start', {});
  }

  /** POST /api/sync/stop */
  async stopSync() {
    return this.post<{ data: any }>('/api/sync/stop', {});
  }

  /** GET /api/sync/status */
  async syncStatus() {
    return this.get<{ data: any }>('/api/sync/status');
  }

  /** POST /api/sync/now */
  async syncNow() {
    return this.post<{ data: any }>('/api/sync/now', {});
  }

  /** POST /api/sync/setup */
  async syncSetup(body: { url: string; token: string }) {
    return this.post<{ data: any }>('/api/sync/setup', body);
  }

  /** POST /api/memories/:id/pin */
  async pinMemory(id: string) {
    return this.post<{ data: any }>(`/api/memories/${id}/pin`, {});
  }

  /** POST /api/memories/:id/unpin */
  async unpinMemory(id: string) {
    return this.post<{ data: any }>(`/api/memories/${id}/unpin`, {});
  }

  /** POST /api/summarize */
  async triggerSummarize(body?: Record<string, unknown>) {
    return this.post<{ data: any }>('/api/summarize', body || {});
  }

  /** POST /api/projects/:id/archive */
  async archiveProject(id: string) {
    return this.post<{ data: any }>(`/api/projects/${id}/archive`, {});
  }

  // ── HTTP helpers ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new APIError(res.status, body?.error?.code || 'UNKNOWN', body?.error?.message || res.statusText);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const rb = await res.json().catch(() => ({}));
      throw new APIError(res.status, rb?.error?.code || 'UNKNOWN', rb?.error?.message || res.statusText);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const rb = await res.json().catch(() => ({}));
      throw new APIError(res.status, rb?.error?.code || 'UNKNOWN', rb?.error?.message || res.statusText);
    }
    return res.json() as Promise<T>;
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status !== 204) {
      const rb = await res.json().catch(() => ({}));
      throw new APIError(res.status, rb?.error?.code || 'UNKNOWN', rb?.error?.message || res.statusText);
    }
  }
}

export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}
