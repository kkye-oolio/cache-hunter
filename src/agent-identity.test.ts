import { describe, it, expect } from 'vitest'
import { agentIdentity, selectAgentCalls } from './agent-identity.js'

describe('native agent identity', () => {
  it('uses Responses prompt_cache_key', () => {
    expect(agentIdentity(JSON.stringify({ prompt_cache_key: 'session-one' }), '/v1/responses').id).toBe('session-one')
  })
  it('extracts Claude session and parent without exposing account/device fields', () => {
    const body = JSON.stringify({ metadata: { user_id: JSON.stringify({ session_id: 'child', parent_session_id: 'parent', account_uuid: 'account', device_id: 'device' }) } })
    expect(agentIdentity(body, '/v1/messages?beta=true')).toEqual({ key: '["claude","child"]', kind: 'claude', id: 'child', parentId: 'parent' })
  })
  it('labels absent and malformed identifiers unattributed', () => {
    for (const body of ['{}', 'not json', '{"metadata":{"user_id":"not json"}}']) {
      expect(agentIdentity(body, '/v1/messages').kind).toBe('unattributed')
    }
  })
  it('does not merge IDs from different protocol namespaces', () => {
    const a = agentIdentity('{"prompt_cache_key":"same"}', '/v1/responses')
    const b = agentIdentity('{"metadata":{"user_id":"{\\"session_id\\":\\"same\\"}"}}', '/v1/messages')
    expect(a.key).not.toBe(b.key)
  })
  it('isolates interleaved calls and retains original deletion indices', () => {
    const a = agentIdentity('{"prompt_cache_key":"one"}', '/v1/responses')
    const b = agentIdentity('{"prompt_cache_key":"two"}', '/v1/responses')
    const calls = [{ agent: a, callId: 'a' }, { agent: b, callId: 'b' }, { agent: a, callId: 'c' }]
    const selected = selectAgentCalls(calls, a.key)
    expect(selected.indices).toEqual([0, 2])
    expect(selected.calls.map(call => call.callId)).toEqual(['a', 'c'])
    expect(selected.groups.map(group => group.count)).toEqual([2, 1])
  })
  it('defaults to one native group, not a mixed-agent grid', () => {
    const a = agentIdentity('{"prompt_cache_key":"one"}', '/v1/responses')
    const b = agentIdentity('{"prompt_cache_key":"two"}', '/v1/responses')
    expect(selectAgentCalls([{ agent: a }, { agent: b }]).calls).toEqual([{ agent: a }])
  })
})
