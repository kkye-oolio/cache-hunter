export interface AgentIdentity {
  key: string
  kind: 'responses' | 'claude' | 'unattributed'
  id: string | null
  parentId?: string
}

const unattributed: AgentIdentity = { key: 'unattributed', kind: 'unattributed', id: null }

export function agentIdentity(body: string, path: string): AgentIdentity {
  let parsed: any
  try { parsed = JSON.parse(body) } catch { return unattributed }
  if (!parsed || typeof parsed !== 'object') return unattributed
  const endpoint = path.split('?')[0]
  if (endpoint === '/v1/responses' && typeof parsed.prompt_cache_key === 'string' && parsed.prompt_cache_key.length > 0) {
    return { key: JSON.stringify(['responses', parsed.prompt_cache_key]), kind: 'responses', id: parsed.prompt_cache_key }
  }
  if (endpoint === '/v1/messages' && typeof parsed.metadata?.user_id === 'string') {
    let metadata: any
    try { metadata = JSON.parse(parsed.metadata.user_id) } catch { return unattributed }
    if (typeof metadata?.session_id === 'string' && metadata.session_id.length > 0) {
      return {
        key: JSON.stringify(['claude', metadata.session_id]), kind: 'claude', id: metadata.session_id,
        ...(typeof metadata.parent_session_id === 'string' ? { parentId: metadata.parent_session_id } : {}),
      }
    }
  }
  return unattributed
}

export function selectAgentCalls<T extends { agent: AgentIdentity }>(calls: T[], selected?: string) {
  const groups = new Map<string, AgentIdentity & { count: number }>()
  calls.forEach(call => {
    const group = groups.get(call.agent.key)
    if (group) group.count++
    else groups.set(call.agent.key, { ...call.agent, count: 1 })
  })
  const key = selected && groups.has(selected) ? selected : groups.keys().next().value
  const indices = calls.map((_, index) => index).filter(index => calls[index].agent.key === key)
  return { groups: [...groups.values()], key: key ?? null, indices, calls: indices.map(index => calls[index]) }
}
