import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { AsyncLogger } from './logger.js'

describe('queued capture storage', () => {
  it('waits for concurrent flush and close without losing records or changing bodies', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cache-hunter-storage-'))
    const path = join(directory, 'capture.db')
    try {
      const logger = new AsyncLogger(path)
      const body = JSON.stringify({ prompt_cache_key: 'offline-unit', input: [], instructions: 'Preserved content' })
      const record = { id: 'first', timestamp: 1, method: 'POST', path: '/v1/responses', headers: '{}', body, cache_salt: null, client_ip: 'local' }
      logger.logRequest(record)
      const flushing = logger.flush()
      logger.logRequest({ ...record, id: 'second', timestamp: 2 })
      await Promise.all([flushing, logger.close()])
      const SQL = await initSqlJs()
      const db = new SQL.Database(readFileSync(path))
      expect(db.exec('SELECT body FROM requests ORDER BY timestamp')[0].values).toEqual([[body], [body]])
      db.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
