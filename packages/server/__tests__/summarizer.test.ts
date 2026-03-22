import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TranscriptWriter, readTranscript, deleteTranscript } from '../src/summarizer/transcript.js';
import type { TranscriptEvent } from '@cortex/shared';

describe('Transcript Writer', () => {
  const machineId = 'test-machine-uuid-for-encryption';
  let tmpDir: string;
  let writer: TranscriptWriter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-transcript-'));
    // Override the default transcripts dir by creating writer with a custom session ID
    writer = new TranscriptWriter('test-session-123', machineId);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records events', () => {
    const event: TranscriptEvent = {
      event_type: 'tool_call',
      tool_name: 'save_memory',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
      project_id: 'test-project',
      params: { content: 'test memory content', type: 'decision' },
      result_summary: 'Memory saved successfully',
    };

    writer.recordEvent(event);
    const events = writer.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('tool_call');
  });

  it('hashes save_memory content in params', () => {
    const event: TranscriptEvent = {
      event_type: 'tool_call',
      tool_name: 'save_memory',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
      project_id: 'test-project',
      params: { content: 'secret decision content', type: 'decision' },
      result_summary: null,
    };

    writer.recordEvent(event);
    const events = writer.getEvents();
    // Content should be SHA-256 hashed, not raw
    const storedContent = (events[0].params as Record<string, unknown>).content as string;
    expect(storedContent).not.toBe('secret decision content');
    expect(storedContent).toHaveLength(64); // SHA-256 hex length
  });

  it('redacts sensitive data in result_summary', () => {
    const event: TranscriptEvent = {
      event_type: 'tool_call',
      tool_name: 'get_memories',
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
      project_id: 'test-project',
      params: null,
      result_summary: 'Memory contains password = mysecretpass123 which should be redacted',
    };

    writer.recordEvent(event);
    const events = writer.getEvents();
    expect(events[0].result_summary).toContain('[REDACTED]');
    expect(events[0].result_summary).not.toContain('mysecretpass123');
  });

  it('encrypts and decrypts transcript file', () => {
    const event: TranscriptEvent = {
      event_type: 'session_start',
      tool_name: null,
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
      project_id: 'test-project',
      params: null,
      result_summary: null,
    };

    writer.recordEvent(event);
    const filePath = writer.flush();

    // File should exist and be encrypted
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const envelope = JSON.parse(raw);
    expect(envelope.iv).toBeTruthy();
    expect(envelope.tag).toBeTruthy();
    expect(envelope.data).toBeTruthy();

    // Should be decryptable with same machine ID
    const decrypted = readTranscript(filePath, machineId);
    expect(decrypted).toHaveLength(1);
    expect(decrypted[0].event_type).toBe('session_start');

    // Cleanup
    deleteTranscript(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('fails to decrypt with wrong machine ID', () => {
    const event: TranscriptEvent = {
      event_type: 'session_start',
      tool_name: null,
      timestamp: new Date().toISOString(),
      session_id: 'test-session',
      project_id: 'test-project',
      params: null,
      result_summary: null,
    };

    writer.recordEvent(event);
    const filePath = writer.flush();

    // Decrypt with wrong key should fail
    expect(() => readTranscript(filePath, 'wrong-machine-id')).toThrow();

    deleteTranscript(filePath);
  });

  it('handles multiple events', () => {
    for (let i = 0; i < 5; i++) {
      writer.recordEvent({
        event_type: 'tool_call',
        tool_name: 'search_memories',
        timestamp: new Date().toISOString(),
        session_id: 'test-session',
        project_id: 'test-project',
        params: { query: `search ${i}` },
        result_summary: `Found ${i} results`,
      });
    }

    const events = writer.getEvents();
    expect(events).toHaveLength(5);

    const filePath = writer.flush();
    const decrypted = readTranscript(filePath, machineId);
    expect(decrypted).toHaveLength(5);

    deleteTranscript(filePath);
  });
});
