'use client';

export default function TimelinePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-[12px] text-[var(--text3)] tracking-wider mb-1">TIMELINE</p>
        <h2 className="font-serif text-3xl font-bold text-[var(--text)]">Memory Timeline</h2>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] flex items-center justify-center">
            <span className="text-2xl text-[var(--text3)]">◎</span>
          </div>

          <h3 className="text-lg font-serif font-semibold text-[var(--text)] mb-2">
            Timeline View Coming Soon
          </h3>

          <p className="text-sm text-[var(--text3)] leading-relaxed mb-6">
            This view will show a chronological timeline of memory creation across all your projects.
            See when decisions were made, patterns emerged, and knowledge evolved over time.
          </p>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="text-[11px] font-semibold text-[var(--text2)] uppercase tracking-wider mb-3">
              Planned Features
            </h4>
            <ul className="space-y-2 text-[12px] text-[var(--text3)] text-left">
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                Chronological memory stream with day/week grouping
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                Filter by project, type, and importance
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                Visual markers for high-importance decisions
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                Session-based grouping to show context flow
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                Interactive zoom between day, week, and month views
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
