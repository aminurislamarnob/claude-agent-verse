import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import type { FileHandle } from "node:fs/promises";

export class FileTailer extends EventEmitter {
  private filePath: string;
  private position: number;
  private fh: FileHandle | null = null;
  private watcher: fs.FSWatcher | null = null;
  private buffer: string;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private reading: Promise<void> | null = null;
  private pending = false;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.position = 0;
    this.buffer = "";
  }

  public async start() {
    if (this.stopped) return;
    try {
      this.fh = await fs.promises.open(this.filePath, "r");
    } catch (e: any) {
      if (e.code === "ENOENT") {
        // Retry shortly if file isn't created yet
        this.retry = setTimeout(() => this.start(), 1000);
        return;
      }
      throw e;
    }
    if (this.stopped) {
      await this.fh.close().catch(() => {});
      this.fh = null;
      return;
    }

    await this.read();
    this.watcher = fs.watch(this.filePath, (eventType) => {
      if (eventType === "change") void this.read();
    });
  }

  /** Reads one chunk at a time; changes that arrive mid-read are picked up right after. */
  private async read(): Promise<void> {
    if (this.reading) {
      this.pending = true;
      return this.reading;
    }
    this.reading = (async () => {
      do {
        this.pending = false;
        try {
          await this.readNewData();
        } catch {
          // the file vanished or was closed under us; the next change retries
        }
      } while (this.pending && this.fh !== null);
    })();
    try {
      await this.reading;
    } finally {
      this.reading = null;
    }
  }

  private async readNewData() {
    if (this.fh === null) return;
    const stats = await this.fh.stat();
    if (stats.size > this.position) {
      const sizeToRead = stats.size - this.position;
      const buf = Buffer.alloc(sizeToRead);
      const { bytesRead } = await this.fh.read(buf, 0, sizeToRead, this.position);
      if (bytesRead > 0) {
        this.position += bytesRead;
        this.buffer += buf.toString("utf8");
        this.processBuffer();
      }
    } else if (stats.size < this.position) {
      // File was truncated
      this.position = stats.size;
      this.buffer = "";
    }
  }

  private processBuffer() {
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          this.emit("line", parsed);
        } catch (e) {
          // ignore unparseable lines defensively
        }
      }
    }
  }

  public stop() {
    this.stopped = true;
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.fh !== null) {
      this.fh.close().catch(() => {});
      this.fh = null;
    }
  }
}
