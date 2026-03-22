import type { TranscriptEvent, MemoryCandidate, SummarizerConfig } from '@cortex/shared';

/**
 * Summarization prompt for extracting memory candidates from a session transcript.
 */
const EXTRACTION_PROMPT = `You are Cortex, a memory extraction system for Claude Code sessions.

Analyze the following session audit log and extract structured memories worth preserving across sessions.

Rules:
- Extract DECISIONS (architectural/technical choices made during the session)
- Extract PREFERENCES (working style, tool, or language preferences expressed)
- Extract THREADS (open problems or unresolved issues mentioned)
- Extract ERRORS (bugs, gotchas, or workarounds discovered)
- Extract LEARNINGS (technical facts discovered during work)
- Extract CONTEXT (important project state changes)
- DO NOT extract meta-commentary about the session itself ("we worked on X")
- Each memory should be self-contained — readable without context of this session
- Content must be 50-2000 characters, specific, with names/versions/rationale
- Importance 1-10: preferences=8, decisions=7, threads=7, errors=6, context=6, learnings=5

Return a JSON array of memory candidates. No other text.

Format:
[
  {
    "content": "specific memory content here",
    "type": "decision|context|preference|thread|error|learning",
    "reason": "why this memory matters",
    "tags": ["tag1", "tag2"],
    "importance": 7,
    "confidence": 3
  }
]

Session audit log:
`;

/**
 * Call Claude Haiku to extract memory candidates from a session transcript.
 */
export async function summarizeWithClaude(
  events: TranscriptEvent[],
  apiKey: string,
): Promise<MemoryCandidate[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const auditLog = formatAuditLog(events);
  const prompt = EXTRACTION_PROMPT + auditLog;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20250414',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseResponse(text);
}

/**
 * Call GPT-4o-mini to extract memory candidates from a session transcript.
 */
export async function summarizeWithOpenAI(
  events: TranscriptEvent[],
  apiKey: string,
): Promise<MemoryCandidate[]> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const auditLog = formatAuditLog(events);
  const prompt = EXTRACTION_PROMPT + auditLog;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0]?.message?.content || '';
  return parseResponse(text);
}

/**
 * Summarize a session using the configured provider.
 */
export async function summarizeSession(
  events: TranscriptEvent[],
  config: SummarizerConfig,
): Promise<MemoryCandidate[]> {
  if (!config.api_key_encrypted) {
    throw new Error('Summarizer API key not configured. Run: cortex summarize --setup');
  }

  // API key passed from config — decryption handled at config read time
  const apiKey = config.api_key_encrypted;

  if (config.provider === 'anthropic') {
    return summarizeWithClaude(events, apiKey);
  } else {
    return summarizeWithOpenAI(events, apiKey);
  }
}

/**
 * Format transcript events into a readable audit log string.
 */
function formatAuditLog(events: TranscriptEvent[]): string {
  return events
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      switch (e.event_type) {
        case 'session_start':
          return `[${time}] SESSION START — project: ${e.project_id}`;
        case 'session_end':
          return `[${time}] SESSION END`;
        case 'tool_call':
          return `[${time}] TOOL: ${e.tool_name} — params: ${JSON.stringify(e.params)} — result: ${e.result_summary || 'n/a'}`;
        case 'memory_injected':
          return `[${time}] MEMORY INJECTED: ${e.result_summary || 'n/a'}`;
        default:
          return `[${time}] ${e.event_type}`;
      }
    })
    .join('\n');
}

/**
 * Parse the AI response into MemoryCandidate array.
 */
function parseResponse(text: string): MemoryCandidate[] {
  try {
    // Find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => ({
        content: String(item.content || ''),
        type: String(item.type || 'context'),
        reason: String(item.reason || ''),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        importance: typeof item.importance === 'number' ? item.importance : 5,
        confidence: typeof item.confidence === 'number' ? item.confidence : 3,
      }))
      .filter((c) => c.content.length >= 50 && c.reason.length >= 10);
  } catch {
    return [];
  }
}
