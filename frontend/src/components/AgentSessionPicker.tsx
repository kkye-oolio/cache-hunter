import type { TreeData } from '../hooks/useApi'

export function AgentSessionPicker({ data, onChange }: { data: TreeData; onChange: (key: string) => void }) {
  return (
    <label>
      Agent session{' '}
      <select value={data._selectedAgent ?? ''} onChange={e => onChange(e.target.value)}>
        {data._agentSessions?.map(agent => (
          <option key={agent.key} value={agent.key}>
            {agent.kind === 'unattributed' ? 'Unattributed' : `${agent.kind} · ${agent.id}`} · {agent.count} requests
          </option>
        ))}
      </select>
    </label>
  )
}
