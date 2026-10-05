import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ProxyRequestData } from './proxy-engine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class AsyncLogger {
  private queue: ProxyRequestData[] = []
  private activeFlush: Promise<void> | null = null
  private dbPath: string
  private sqlJsReady: Promise<any>

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.sqlJsReady = initSqlJs()
  }

  logRequest(request: ProxyRequestData): void {
    this.queue.push(request)
    process.stdout.write('.')
  }

  async flush(): Promise<void> {
    while (this.activeFlush) await this.activeFlush
    if (this.queue.length === 0) return
    const entries = this.queue
    this.queue = []
    this.activeFlush = this.writeBatch(entries)
    try {
      await this.activeFlush
    } catch (error) {
      this.queue.unshift(...entries)
      throw error
    } finally {
      this.activeFlush = null
    }
    if (this.queue.length > 0) await this.flush()
  }

  private async writeBatch(entries: ProxyRequestData[]): Promise<void> {
    const SQL = await this.sqlJsReady
    const db = existsSync(this.dbPath)
      ? new SQL.Database(readFileSync(this.dbPath))
      : new SQL.Database()
    try {
      if (!existsSync(this.dbPath)) db.run(readFileSync(join(__dirname, 'schema.sql'), 'utf8'))
      db.run('BEGIN TRANSACTION')
      for (const entry of entries) {
        db.run(
          `INSERT INTO requests (id, timestamp, method, path, headers, body, cache_salt, client_ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [entry.id, entry.timestamp, entry.method, entry.path, entry.headers, entry.body, entry.cache_salt, entry.client_ip],
        )
      }
      db.run('COMMIT')
      writeFileSync(this.dbPath, Buffer.from(db.export()))
    } finally {
      db.close()
    }
  }

  async close(): Promise<void> {
    await this.flush()
  }
}
