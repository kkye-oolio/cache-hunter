import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CaptureManager } from './capture-manager.js'
import { setDataDir, getDataDir, getSessionHashGrid, deleteSessionCall } from './session-manager.js'
import type { ProxyEngine } from './proxy-engine.js'

describe('capture lifecycle without network traffic', () => {
  it('drains records before finalizing and isolates native sessions with stable deletion IDs', async () => {
    vi.useFakeTimers()
    const directory = mkdtempSync(join(tmpdir(), 'capture-lifecycle-'))
    const previous = getDataDir()
    setDataDir(directory)
    const engine = { getConfig: () => ({ targetHost: 'unused', targetPort: 0 }), activeModel: null, startCapture() {}, stopCapture() {} }
    const manager = new CaptureManager(engine as unknown as ProxyEngine, directory)
    try {
      const capture = await manager.start()
      for (const [id, key, timestamp] of [['a', 'one', 2], ['b', 'two', 3], ['c', 'one', 4]] as const) {
        manager.record({ id, timestamp, method: 'POST', path: '/v1/responses', headers: '{}', cache_salt: null, client_ip: 'local', body: JSON.stringify({ prompt_cache_key: key, input: [{ type: 'message', role: 'user', content: 'Offline unit content' }] }) })
      }
      await manager.stop()
      const first = await getSessionHashGrid(capture.id)
      expect(first._agentSessions.map((agent: any) => agent.count)).toEqual([2, 1])
      expect(first._callIds).toEqual(['a', 'c'])
      const second = await getSessionHashGrid(capture.id, JSON.stringify(['responses', 'two']))
      expect(second._callIds).toEqual(['b'])
      expect(await deleteSessionCall(capture.id, 99, 'b')).toBe(true)
      expect((await getSessionHashGrid(capture.id))._callIds).toEqual(['a', 'c'])
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
      setDataDir(previous)
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
