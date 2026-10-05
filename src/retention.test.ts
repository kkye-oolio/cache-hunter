import { describe, it, expect } from 'vitest'
import { retentionPlan, type CaptureFile } from './retention.js'

const limits = { maxAgeMs: 24, maxBytes: 100, rotationAgeMs: 4, rotationBytes: 40 }
const file = (id: string, created_at: number, bytes: number, status: CaptureFile['status'] = 'completed'): CaptureFile => ({ id, created_at, bytes, status })

describe('capture retention planning', () => {
  it('expires completed captures by age', () => {
    expect(retentionPlan([file('old', 0, 10), file('new', 20, 10)], 24, limits).remove).toEqual(['old'])
  })
  it('prunes oldest completed captures to fit the size budget', () => {
    expect(retentionPlan([file('old', 0, 60), file('new', 1, 50), file('active', 2, 10, 'active')], 3, limits).remove).toEqual(['old'])
  })
  it('never deletes active captures directly', () => {
    const plan = retentionPlan([file('active', 0, 150, 'active')], 30, limits)
    expect(plan.remove).toEqual([])
    expect(plan.rotate).toBe(true)
  })
  it('rotates active captures at the size or time boundary', () => {
    expect(retentionPlan([file('size', 0, 40, 'active')], 1, limits).rotate).toBe(true)
    expect(retentionPlan([file('age', 0, 1, 'active')], 4, limits).rotate).toBe(true)
  })
  it('preserves captures below both limits', () => {
    expect(retentionPlan([file('active', 0, 1, 'active')], 1, limits)).toEqual({ remove: [], rotate: false })
  })
})
