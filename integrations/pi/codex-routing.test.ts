import { describe, it, expect, vi } from 'vitest'
import { registerCodexRouting } from './codex-routing.js'

describe('Codex routing registration', () => {
  it('registers only Codex and preserves native options while selecting SSE', () => {
    const pi = { registerProvider: vi.fn(), on: vi.fn() }
    const nativeApi = { streamSimple: vi.fn((_model: unknown, _context: unknown, _options: unknown) => 'delegated') }
    registerCodexRouting(pi as any, nativeApi as any)
    expect(pi.registerProvider.mock.calls[0][0]).toBe('openai-codex')
    const config = pi.registerProvider.mock.calls[0][1]
    const options = { cacheRetention: 'long', reasoning: 'medium', sessionId: 'native-session' }
    expect(config.streamSimple({ api: 'openai-codex-responses', baseUrl: config.baseUrl }, {}, options)).toBe('delegated')
    expect(nativeApi.streamSimple.mock.calls[0][2]).toMatchObject({ ...options, transport: 'sse' })
    expect(pi.on.mock.calls.map(call => call[0])).toEqual(['session_start', 'model_select'])
  })
  it('refuses a bypassed endpoint without calling the native stream', () => {
    const pi = { registerProvider: vi.fn(), on: vi.fn() }
    const nativeApi = { streamSimple: vi.fn() }
    registerCodexRouting(pi as any, nativeApi as any)
    const config = pi.registerProvider.mock.calls[0][1]
    expect(() => config.streamSimple({ api: 'openai-codex-responses', baseUrl: 'https://example.test' }, {}, {})).toThrow('endpoint override')
    expect(nativeApi.streamSimple).not.toHaveBeenCalled()
  })
})
