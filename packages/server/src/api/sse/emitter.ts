import { EventEmitter } from 'node:events';
import type { SSEEvent, SSEEventType } from '@cortex/shared';
import { SSE_MAX_CONNECTIONS, SSE_KEEPALIVE_INTERVAL_SECONDS } from '@cortex/shared';
import { v4 as uuid } from 'uuid';

/** Maximum number of events to retain in history, regardless of age. */
const MAX_HISTORY_SIZE = 1000;

/**
 * SSE event with ID for Last-Event-ID replay.
 */
interface SSEEventWithId {
  id: string;
  event: SSEEvent;
  timestamp: number;
}

/**
 * SSE client connection.
 */
interface SSEClient {
  id: string;
  write: (data: string) => boolean;
  close: () => void;
}

/**
 * Server-Sent Events emitter.
 * Manages client connections, event broadcasting, keepalive, and replay.
 */
export class SSEEmitter extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private eventHistory: SSEEventWithId[] = [];
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /** Replay window in milliseconds (5 minutes) */
  private readonly REPLAY_WINDOW_MS = 5 * 60 * 1000;

  constructor() {
    super();
    this.startKeepalive();
  }

  /**
   * Register a new SSE client.
   * Returns the client ID.
   */
  addClient(
    write: (data: string) => boolean,
    close: () => void,
    lastEventId?: string,
  ): string {
    // Enforce max connections
    if (this.clients.size >= SSE_MAX_CONNECTIONS) {
      // Close oldest client
      const oldest = this.clients.keys().next().value;
      if (oldest) {
        const oldClient = this.clients.get(oldest);
        oldClient?.close();
        this.clients.delete(oldest);
      }
    }

    const clientId = uuid();
    this.clients.set(clientId, { id: clientId, write, close });

    // Replay missed events if Last-Event-ID provided
    if (lastEventId) {
      this.replayFrom(lastEventId, write);
    }

    return clientId;
  }

  /**
   * Remove a client connection.
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Broadcast an SSE event to all connected clients.
   */
  broadcast(event: SSEEvent): void {
    const eventId = uuid();
    const eventWithId: SSEEventWithId = {
      id: eventId,
      event,
      timestamp: Date.now(),
    };

    // Store in history for replay
    this.eventHistory.push(eventWithId);
    this.pruneHistory();

    // Format SSE message
    const message = formatSSEMessage(eventId, event);

    // Send to all clients
    for (const [clientId, client] of this.clients) {
      try {
        const success = client.write(message);
        if (!success) {
          this.clients.delete(clientId);
        }
      } catch {
        this.clients.delete(clientId);
      }
    }

    // Emit locally for internal listeners
    this.emit('event', event);
  }

  /**
   * Get current connection count.
   */
  get connectionCount(): number {
    return this.clients.size;
  }

  /**
   * Stop the keepalive interval and close all clients.
   */
  destroy(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.close();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    this.eventHistory = [];
  }

  // ── Private ──

  private startKeepalive(): void {
    this.keepaliveInterval = setInterval(() => {
      const ping = ': ping\n\n';
      for (const [clientId, client] of this.clients) {
        try {
          const success = client.write(ping);
          if (!success) {
            this.clients.delete(clientId);
          }
        } catch {
          this.clients.delete(clientId);
        }
      }
    }, SSE_KEEPALIVE_INTERVAL_SECONDS * 1000);
  }

  private replayFrom(lastEventId: string, write: (data: string) => boolean): void {
    const index = this.eventHistory.findIndex((e) => e.id === lastEventId);
    if (index === -1) return;

    // Send all events after the last seen one
    for (let i = index + 1; i < this.eventHistory.length; i++) {
      const { id, event } = this.eventHistory[i];
      const message = formatSSEMessage(id, event);
      write(message);
    }
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - this.REPLAY_WINDOW_MS;
    this.eventHistory = this.eventHistory.filter((e) => e.timestamp > cutoff);
    if (this.eventHistory.length > MAX_HISTORY_SIZE) {
      this.eventHistory = this.eventHistory.slice(-MAX_HISTORY_SIZE);
    }
  }
}

/**
 * Format an SSE event as a text/event-stream message.
 */
function formatSSEMessage(id: string, event: SSEEvent): string {
  return `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
