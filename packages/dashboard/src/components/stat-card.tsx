'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
}

export function StatCard({ label, value, sub, trend }: StatCardProps) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <p className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="font-serif text-3xl font-bold text-[var(--text)] leading-none">
        {value}
      </p>
      {sub && (
        <p className="text-[12px] text-[var(--text3)] mt-1.5">{sub}</p>
      )}
      {trend && (
        <p className="text-[11px] text-[var(--green)] mt-1">{trend}</p>
      )}
    </div>
  );
}
