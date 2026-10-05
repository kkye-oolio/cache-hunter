export interface CaptureFile {
  id: string
  created_at: number
  status: 'active' | 'completed'
  bytes: number
}

export interface RetentionLimits {
  maxAgeMs: number
  maxBytes: number
  rotationAgeMs: number
  rotationBytes: number
}

export function retentionPlan(files: CaptureFile[], now: number, limits: RetentionLimits) {
  const completed = files.filter(file => file.status === 'completed').sort((a, b) => a.created_at - b.created_at)
  const remove = completed.filter(file => now - file.created_at >= limits.maxAgeMs).map(file => file.id)
  let remainingBytes = files.filter(file => !remove.includes(file.id)).reduce((total, file) => total + file.bytes, 0)
  for (const file of completed) {
    if (remainingBytes <= limits.maxBytes) break
    if (!remove.includes(file.id)) {
      remove.push(file.id)
      remainingBytes -= file.bytes
    }
  }
  const rotate = files.some(file => file.status === 'active' &&
    (now - file.created_at >= limits.rotationAgeMs || now - file.created_at >= limits.maxAgeMs ||
      file.bytes >= limits.rotationBytes || remainingBytes > limits.maxBytes))
  return { remove, rotate }
}
