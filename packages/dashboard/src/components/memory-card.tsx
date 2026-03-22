'use client';

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  decision: { bg: 'rgba(124,111,224,0.12)', text: 'var(--accent2)' },
  context: { bg: 'rgba(45,212,191,0.10)', text: 'var(--teal)' },
  preference: { bg: 'rgba(251,191,36,0.10)', text: 'var(--amber)' },
  thread: { bg: 'rgba(129,140,248,0.10)', text: 'var(--indigo)' },
  error: { bg: 'rgba(248,113,113,0.10)', text: 'var(--red)' },
  learning: { bg: 'rgba(52,211,153,0.10)', text: 'var(--green)' },
};

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

interface MemoryCardProps {
  memory: {
    id: string;
    type: string;
    content: string;
    importance: number;
    tags: string[];
    created_at: string;
  };
  onClick?: () => void;
}

export function MemoryCard({ memory, onClick }: MemoryCardProps) {
  const style = TYPE_STYLES[memory.type] || TYPE_STYLES.context;

  return (
    <div
      onClick={onClick}
      className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3.5 cursor-pointer hover:border-[var(--border2)] transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: style.bg, color: style.text }}
        >
          {memory.type}
        </span>
        <span className="text-[11px] text-[var(--text3)] ml-auto">
          {formatAge(memory.created_at)}
        </span>
      </div>

      <p className="text-[13px] text-[var(--text2)] leading-relaxed line-clamp-3">
        {memory.content}
      </p>

      {memory.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {memory.tags.map((tag: string) => (
            <span
              key={tag}
              className="text-[10px] text-[var(--text3)] bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
