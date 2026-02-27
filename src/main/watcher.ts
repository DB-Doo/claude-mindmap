import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { JSONLMessage } from '../shared/types';

/**
 * Watches a single JSONL session log file for new content.
 *
 * Events emitted:
 *   'initial-messages' (messages: JSONLMessage[])  -- all existing messages on start()
 *   'new-messages'     (messages: JSONLMessage[])  -- incremental messages on file change
 *   'error'            (err: Error)                -- non-fatal read/parse errors
 */
export class SessionWatcher extends EventEmitter {
  private filePath: string;
  private byteOffset: number = 0;
  private watcher: chokidar.FSWatcher | null = null;
  private buffer: string = '';

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  /**
   * Begin watching. Reads the entire file first and emits 'initial-messages',
   * then watches for appended content via chokidar.
   */
  /**
   * Read all existing content and begin watching for changes.
   * Returns the initial messages synchronously so the caller
   * can send them directly without relying on an event.
   */
  start(): JSONLMessage[] {
    // Read everything that already exists in the file.
    const initialMessages = this.readAllContent();

    // Start watching for future changes.
    this.watcher = chokidar.watch(this.filePath, {
      usePolling: true,
      interval: 500,
      // Ignore the initial add event since we already read the file.
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', () => {
      this.readNewContent();
    });

    this.watcher.on('error', (err: unknown) => {
      this.emit('error', err);
    });

    return initialMessages;
  }

  /**
   * Stop watching and clean up resources.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.byteOffset = 0;
    this.buffer = '';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Read the entire file, parse all JSONL lines, update the byte offset,
   * and return the parsed messages.
   */
  private readAllContent(): JSONLMessage[] {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      this.byteOffset = Buffer.byteLength(content, 'utf8');

      const messages: JSONLMessage[] = [];
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          const parsed = JSON.parse(trimmed) as JSONLMessage;
          messages.push(parsed);
        } catch {
          // Skip malformed JSON lines
        }
      }

      return messages;
    } catch (err) {
      console.error('[SessionWatcher] readAllContent failed:', err);
      return [];
    }
  }

  /**
   * Read newly-appended content starting from the last known byte offset.
   * Handles partial lines by buffering the incomplete trailing segment
   * until the next read.
   */
  private readNewContent(): void {
    let fd: number | null = null;
    try {
      const stat = fs.statSync(this.filePath);
      const fileSize = stat.size;

      // Nothing new to read.
      if (fileSize <= this.byteOffset) return;

      const bytesToRead = fileSize - this.byteOffset;
      const readBuffer = Buffer.alloc(bytesToRead);

      fd = fs.openSync(this.filePath, 'r');
      fs.readSync(fd, readBuffer, 0, bytesToRead, this.byteOffset);
      fs.closeSync(fd);
      fd = null;

      this.byteOffset = fileSize;

      const rawText = this.buffer + readBuffer.toString('utf8');
      const lines = rawText.split('\n');

      // The last element may be a partial line -- keep it in the buffer.
      this.buffer = lines.pop() ?? '';

      const messages: JSONLMessage[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          const parsed = JSON.parse(trimmed) as JSONLMessage;
          messages.push(parsed);
        } catch {
          // Skip malformed JSON lines
        }
      }

      if (messages.length > 0) {
        this.emit('new-messages', messages);
      }
    } catch (err) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // Ignore close errors
        }
      }
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }
}
