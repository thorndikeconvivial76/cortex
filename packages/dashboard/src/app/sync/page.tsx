'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="text-[11px] text-[var(--text3)] tracking-wider uppercase mb-2">{label}</div>
      <div className="font-serif text-2xl font-bold text-[var(--text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text3)] mt-1">{sub}</div>}
    </div>
  );
}

function SetupForm({ onSetup }: { onSetup: (url: string, token: string) => void }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8">
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⇄</span>
          <h3 className="text-lg font-serif font-semibold text-[var(--text)]">Set Up Sync</h3>
        </div>

        <p className="text-sm text-[var(--text3)] mb-6">
          Connect to your Turso database to sync memories across machines.
          Your data stays in your own Turso account — Cortex never sees it.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wider mb-2">
              Turso Database URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="libsql://cortex-memories-username.turso.io"
              className="w-full bg-[var(--bg)] border border-[var(--border2)] rounded-lg px-4 py-3 text-sm text-[var(--text)] font-mono placeholder:text-[var(--text3)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wider mb-2">
              Auth Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOiJFZERTQSJ9..."
              className="w-full bg-[var(--bg)] border border-[var(--border2)] rounded-lg px-4 py-3 text-sm text-[var(--text)] font-mono placeholder:text-[var(--text3)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            onClick={() => onSetup(url, token)}
            disabled={!url || !token}
            className="px-6 py-3 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Connect & Start Sync
          </button>
        </div>

        <div className="mt-6 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
          <h4 className="text-[12px] font-semibold text-[var(--text2)] uppercase tracking-wider mb-3">
            Or use the CLI
          </h4>
          <div className="font-mono text-[12px] text-[var(--accent2)] bg-[var(--surface2)] rounded-md px-3 py-2">
            cortex sync setup
          </div>
          <p className="text-[11px] text-[var(--text3)] mt-2">
            The CLI wizard will walk you through Turso account creation automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SyncPage() {
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: api.getConfig,
  });

  const { data: syncData } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: api.syncStatus,
    refetchInterval: 5000,
    enabled: !!config?.data?.sync?.enabled,
  });

  const setupMutation = useMutation({
    mutationFn: (vars: { url: string; token: string }) => api.syncSetup(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['syncStatus'] });
    },
  });

  const syncNowMutation = useMutation({
    mutationFn: api.syncNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['syncStatus'] }),
  });

  const pauseMutation = useMutation({
    mutationFn: api.syncStop,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['syncStatus'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: api.syncStart,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['syncStatus'] }),
  });

  const syncEnabled = config?.data?.sync?.enabled;
  const status = syncData?.data;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">SYNC</p>
          <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Multi-Machine Sync</h2>
          <p className="text-sm text-[var(--text3)] mt-1">
            Keep memories in sync across all your development machines.
          </p>
        </div>

        {syncEnabled && (
          <div className="flex gap-2">
            <button
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
              className="px-4 py-2 text-[12px] font-medium bg-[var(--surface)] border border-[var(--border2)] rounded-lg text-[var(--text2)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              {syncNowMutation.isPending ? 'Syncing...' : 'Sync Now'}
            </button>
            {status?.running && !status?.paused ? (
              <button
                onClick={() => pauseMutation.mutate()}
                className="px-4 py-2 text-[12px] font-medium bg-[var(--surface)] border border-[var(--border2)] rounded-lg text-[var(--amber)] hover:border-[var(--amber)] transition-colors"
              >
                Pause
              </button>
            ) : syncEnabled ? (
              <button
                onClick={() => resumeMutation.mutate()}
                className="px-4 py-2 text-[12px] font-medium bg-[var(--accent)] rounded-lg text-white hover:opacity-90 transition-opacity"
              >
                Resume
              </button>
            ) : null}
          </div>
        )}
      </div>

      {!syncEnabled ? (
        <SetupForm onSetup={(url, token) => setupMutation.mutate({ url, token })} />
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Status"
              value={status?.paused ? 'Paused' : status?.running ? 'Active' : 'Stopped'}
              sub={status?.running ? 'Syncing every 30s' : undefined}
            />
            <StatCard
              label="Last Sync"
              value={status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : '—'}
              sub={status?.lastPushed != null ? `↑ ${status.lastPushed} pushed · ↓ ${status.lastPulled} pulled` : undefined}
            />
            <StatCard
              label="Queue"
              value={String(status?.queueSize ?? 0)}
              sub="Unsynced memories"
            />
            <StatCard
              label="Conflicts"
              value={String(status?.lastConflicts ?? 0)}
              sub={status?.offlineCount ? `${status.offlineCount} offline ticks` : 'No issues'}
            />
          </div>

          {/* Connection info */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-4">Connection</h3>
            <div className="space-y-3 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Provider</span>
                <span className="text-[var(--text2)]">Turso</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Database</span>
                <span className="text-[var(--text2)] font-mono">{config?.data?.sync?.turso_url || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text3)]">Backoff</span>
                <span className={`${status?.backoffMs ? 'text-[var(--amber)]' : 'text-[var(--green)]'}`}>
                  {status?.backoffMs ? `${Math.round(status.backoffMs / 1000)}s` : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Machines */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-4">Connected Machines</h3>
            <div className="space-y-2">
              {status?.machines?.length ? (
                status.machines.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-3">
                    <span className="text-base">{m.platform === 'darwin' ? '💻' : m.platform === 'win32' ? '🖥' : '🐧'}</span>
                    <div className="flex-1">
                      <div className="text-[12px] font-medium text-[var(--text)]">{m.name || m.hostname}</div>
                      <div className="text-[11px] text-[var(--text3)]">{m.platform} · last seen {m.last_seen_at ? new Date(m.last_seen_at).toLocaleString() : 'never'}</div>
                    </div>
                    <div className={`text-[10px] ${m.id === status.machineId ? 'text-[var(--green)]' : 'text-[var(--text3)]'}`}>
                      {m.id === status.machineId ? '● current' : 'synced'}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--text3)]">
                  This is the only connected machine. Set up Cortex on another machine with the same Turso credentials to start syncing.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
