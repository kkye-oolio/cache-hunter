import { useState, useCallback, useRef } from 'react'
import { api, type TreeData } from './useApi'

export function useAgentGrid() {
  const [gridData, setGridData] = useState<TreeData | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const selectedAgent = useRef<string | undefined>(undefined)
  const latestRequest = useRef(0)
  const loadGrid = useCallback(async (id: string, incremental = false, agent = selectedAgent.current) => {
    const requestId = ++latestRequest.current
    if (!incremental) setGridLoading(true)
    try {
      const data = await api.getSessionGrid(id, agent)
      if (requestId === latestRequest.current) {
        selectedAgent.current = data._selectedAgent ?? undefined
        setGridData(data)
      }
    } catch {
      if (!incremental && requestId === latestRequest.current) setGridData(null)
    } finally {
      if (requestId === latestRequest.current) setGridLoading(false)
    }
  }, [])
  const resetAgent = () => { selectedAgent.current = undefined }
  const selectAgent = (id: string, agent: string) => {
    selectedAgent.current = agent
    return loadGrid(id, false, agent)
  }
  const clearGrid = () => {
    latestRequest.current++
    setGridData(null)
    setGridLoading(false)
  }
  return { gridData, gridLoading, loadGrid, resetAgent, selectAgent, clearGrid }
}
