'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        <p className="text-[12px] text-[var(--text3)] mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsRow({
  label,
  value,
  action,
}: {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[12px] text-[var(--text3)]">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[var(--text2)]">{value}</span>
        {action}
      </div>
    </div>
  );
}

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg2)]'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          enabled ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health });
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: api.getConfig });

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [telemetry, setTelemetry] = useState(false);

  const cfg = config?.data ?? {};

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">SETTINGS</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Configuration</h2>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Daemon */}
        <SettingsSection title="Daemon" description="Background service that manages the memory database.">
          <div className="space-y-0">
            <SettingsRow
              label="Status"
              value={
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`} />
                  {health?.status === 'ok' ? 'Running' : 'Unknown'}
                </span>
              }
            />
            <SettingsRow label="Version" value={health?.version ?? '—'} />
            <SettingsRow label="Database Size" value={`${health?.db_size_mb ?? 0} MB`} />
            <SettingsRow label="Uptime" value={`${health?.uptime_s ?? 0}s`} />
            <SettingsRow
              label="Port"
              value={
                <span className="font-mono text-[11px] bg-[var(--bg2)] border border-[var(--border)] px-2 py-0.5 rounded">
                  7434
                </span>
              }
            />
          </div>
        </SettingsSection>

        {/* Summarizer */}
        <SettingsSection title="Summarizer" description="AI provider used to auto-summarize and categorize memories.">
          <div className="space-y-0">
            <SettingsRow
              label="Provider"
              value={cfg.summarizer?.provider ?? 'Not configured'}
            />
            <SettingsRow
              label="Model"
              value={cfg.summarizer?.model ?? '—'}
            />
            <SettingsRow
              label="Auto-summarize"
              value={cfg.summarizer?.enabled ? 'Enabled' : 'Disabled'}
              action={
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  cfg.summarizer?.enabled
                    ? 'bg-[rgba(52,211,153,0.1)] text-[var(--green)]'
                    : 'bg-[var(--bg2)] text-[var(--text3)]'
                }`}>
                  {cfg.summarizer?.enabled ? 'ON' : 'OFF'}
                </span>
              }
            />
          </div>
        </SettingsSection>

        {/* Sync */}
        <SettingsSection title="Sync" description="Multi-machine sync via Turso embedded replicas.">
          <div className="space-y-0">
            <SettingsRow
              label="Enabled"
              value={cfg.sync?.enabled ? 'Yes' : 'No'}
              action={
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  cfg.sync?.enabled
                    ? 'bg-[rgba(52,211,153,0.1)] text-[var(--green)]'
                    : 'bg-[var(--bg2)] text-[var(--text3)]'
                }`}>
                  {cfg.sync?.enabled ? 'ACTIVE' : 'OFF'}
                </span>
              }
            />
            <SettingsRow
              label="Provider"
              value={cfg.sync?.provider ?? 'Turso'}
            />
            <SettingsRow
              label="Database URL"
              value={cfg.sync?.url ? '****' + cfg.sync.url.slice(-12) : 'Not set'}
            />
          </div>
          {!cfg.sync?.enabled && (
            <a
              href="/sync"
              className="inline-block mt-3 text-[11px] text-[var(--accent)] hover:underline"
            >
              View setup instructions →
            </a>
          )}
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="Appearance" description="Customize the dashboard look and feel.">
          <div className="space-y-0">
            <SettingsRow
              label="Theme"
              value={theme === 'dark' ? 'Dark' : 'Light'}
              action={
                <div className="flex gap-1">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                      theme === 'dark'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text2)]'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                      theme === 'light'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg2)] text-[var(--text3)] hover:text-[var(--text2)]'
                    }`}
                  >
                    Light
                  </button>
                </div>
              }
            />
          </div>
        </SettingsSection>

        {/* Privacy */}
        <SettingsSection title="Privacy" description="Control data collection and telemetry.">
          <div className="space-y-0">
            <SettingsRow
              label="Anonymous Telemetry"
              value={telemetry ? 'Enabled' : 'Disabled'}
              action={<Toggle enabled={telemetry} onToggle={() => setTelemetry(!telemetry)} />}
            />
            <SettingsRow
              label="Data Storage"
              value="Local only"
            />
            <SettingsRow
              label="Memory Encryption"
              value="At rest"
            />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
