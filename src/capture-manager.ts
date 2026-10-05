import { basename, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { AsyncLogger } from './logger.js'
import { ProxyEngine, ProxyRequestData } from './proxy-engine.js'
import { createSession, deleteSession, finalizeSession, listSessions, SessionMeta } from './session-manager.js'
import { retentionPlan, RetentionLimits } from './retention.js'
import type { WSBroadcaster } from './ws-server.js'

export const DEFAULT_RETENTION: RetentionLimits = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxBytes: 1024 ** 3,
  rotationAgeMs: 60 * 60 * 1000,
  rotationBytes: 128 * 1024 ** 2,
}

export class CaptureManager {
  private logger: AsyncLogger | null = null
  private sessionId: string | null = null
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private engine: ProxyEngine, private dataDir: string, private broadcaster?: WSBroadcaster) {
    const timer = setInterval(() => {
      void this.enqueue(() => this.maintain()).catch(this.reportError)
    }, 60_000)
    timer.unref()
  }

  private reportError(error: unknown): void {
    console.error(`[Capture] ${error instanceof Error ? error.message : String(error)}`)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.then(() => undefined, () => undefined)
    return next
  }

  record(request: ProxyRequestData): void {
    void this.enqueue(async () => {
      if (!this.logger) return
      this.logger.logRequest(request)
      await this.logger.flush()
      this.broadcaster?.broadcast('request:received', { requestId: request.id })
      this.broadcaster?.broadcast('session:updated', { sessionId: this.sessionId })
      await this.maintain()
    }).catch(this.reportError)
  }

  start(): Promise<SessionMeta> {
    return this.enqueue(async () => {
      if (this.logger) throw new Error('Already capturing')
      await this.maintain()
      return this.openCapture()
    })
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      this.engine.stopCapture()
      await this.finishCapture()
    })
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const active = id === this.sessionId
      if (active) await this.finishCapture()
      deleteSession(id)
      if (active) await this.openCapture()
    })
  }

  private async openCapture(): Promise<SessionMeta> {
    const cfg = this.engine.getConfig()
    const session = createSession(cfg.targetHost, cfg.targetPort, this.engine.activeModel)
    this.sessionId = session.id
    this.logger = new AsyncLogger(join(this.dataDir, session.filename))
    this.engine.startCapture()
    this.broadcaster?.broadcast('capture:start', { session })
    return session
  }

  private async finishCapture(): Promise<void> {
    if (this.logger) await this.logger.close()
    if (this.sessionId) {
      await finalizeSession(this.sessionId)
      this.broadcaster?.broadcast('capture:stop', { sessionId: this.sessionId })
    }
    this.logger = null
    this.sessionId = null
  }

  private captureFiles() {
    return listSessions().map(session => {
      if (basename(session.filename) !== session.filename || !session.filename.endsWith('.db')) {
        throw new Error('Invalid capture filename in manifest')
      }
      const path = join(this.dataDir, session.filename)
      return { ...session, bytes: existsSync(path) ? statSync(path).size : 0 }
    })
  }

  private async maintain(): Promise<void> {
    let plan = retentionPlan(this.captureFiles(), Date.now(), DEFAULT_RETENTION)
    if (plan.rotate && this.logger) {
      await this.finishCapture()
      plan = retentionPlan(this.captureFiles(), Date.now(), DEFAULT_RETENTION)
      for (const id of plan.remove) deleteSession(id)
      await this.openCapture()
      return
    }
    for (const id of plan.remove) deleteSession(id)
  }
}
