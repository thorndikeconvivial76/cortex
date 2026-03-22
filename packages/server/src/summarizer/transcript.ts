import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type { TranscriptEvent } from '@cortex/shared';
import { redactSensitiveData } from '@cortex/shared';

const TRANSCRIPTS_DIR = path.join(os.homedir(), '.cortex', 'transcripts');

/**
 * Derive encryption key from machine UUID using HKDF-SHA256.
 */
function deriveKey(machineId: string): Buffer {
  const ikm = Buffer.from(machineId, 'utf-8');
  const salt = Buffer.from('cortex-transcript-v1', 'utf-8');
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.alloc(0), 32));
}

/**
 * Encrypt data with AES-256-GCM.
 */
function encrypt(data: string, key: Buffer): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), tag };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 */
function decrypt(encrypted: string, key: Buffer, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * Transcript writer — captures MCP tool call events as encrypted JSONL.
 */
export class TranscriptWriter {
  private events: TranscriptEvent[] = [];
  private filePath: string;
  private key: Buffer;
  private extraSensitivePatterns: string[];

  constructor(sessionId: string, machineId: string, extraSensitivePatterns: string[] = []) {
    this.filePath = path.join(TRANSCRIPTS_DIR, `${sessionId}.jsonl.enc`);
    this.key = deriveKey(machineId);
    this.extraSensitivePatterns = extraSensitivePatterns;

    // Ensure directory exists
    if (!fs.existsSync(TRANSCRIPTS_DIR)) {
      fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    }
  }

  /**
   * Record a transcript event.
   * Sensitive data in result_summary is redacted before storage.
   * save_memory content is SHA-256 hashed (not stored).
   */
  recordEvent(event: TranscriptEvent): void {
    const processed = { ...event };

    // Redact sensitive data in result_summary
    if (processed.result_summary) {
      processed.result_summary = redactSensitiveData(
        processed.result_summary,
        this.extraSensitivePatterns,
      );
    }

    // Hash save_memory content — don't store raw content in transcript
    if (processed.tool_name === 'save_memory' && processed.params) {
      const params = { ...processed.params };
      if (typeof params.content === 'string') {
        params.content = crypto.createHash('sha256').update(params.content as string).digest('hex');
      }
      processed.params = params;
    }

    this.events.push(processed);
  }

  /**
   * Flush all events to encrypted JSONL file.
   */
  flush(): string {
    if (this.events.length === 0) return this.filePath;

    const jsonl = this.events.map((e) => JSON.stringify(e)).join('\n');
    const { encrypted, iv, tag } = encrypt(jsonl, this.key);

    const envelope = JSON.stringify({ iv, tag, data: encrypted });
    fs.writeFileSync(this.filePath, envelope);
    fs.chmodSync(this.filePath, 0o600);

    return this.filePath;
  }

  /**
   * Get the transcript file path.
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Get the raw events (for summarization before encryption).
   */
  getEvents(): TranscriptEvent[] {
    return [...this.events];
  }
}

/**
 * Read and decrypt a transcript file.
 */
export function readTranscript(filePath: string, machineId: string): TranscriptEvent[] {
  if (!fs.existsSync(filePath)) return [];

  const key = deriveKey(machineId);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const envelope = JSON.parse(raw);
  const jsonl = decrypt(envelope.data, key, envelope.iv, envelope.tag);

  return jsonl.split('\n').filter(Boolean).map((line: string) => JSON.parse(line));
}

/**
 * Delete a transcript file.
 */
export function deleteTranscript(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Delete all transcripts older than N days.
 * Used by the nightly cleanup job.
 */
export function deleteOldTranscripts(maxAgeDays = 7): number {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) return 0;

  const MS_PER_DAY = 86_400_000;
  const cutoff = Date.now() - maxAgeDays * MS_PER_DAY;
  let deleted = 0;

  for (const file of fs.readdirSync(TRANSCRIPTS_DIR)) {
    const filePath = path.join(TRANSCRIPTS_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // Skip files we can't access
    }
  }

  return deleted;
}
