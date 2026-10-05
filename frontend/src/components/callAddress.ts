import type { TreeData } from '../hooks/useApi'

export function callAddress(data: TreeData, column: number) {
  const callId = data._callIds?.[column]
  const index = data._callIndices?.[column]
  if (!callId || index === undefined) throw new Error('Capture request identifier is unavailable')
  return { callId, index }
}
