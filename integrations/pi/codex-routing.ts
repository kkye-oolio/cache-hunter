import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { Model } from '@earendil-works/pi-ai'
import type { openAICodexResponsesApi } from '@earendil-works/pi-ai/compat'

const baseUrl = 'http://127.0.0.1:18787'

export function registerCodexRouting(pi: Pick<ExtensionAPI, 'registerProvider' | 'on'>, nativeApi: ReturnType<typeof openAICodexResponsesApi>) {
  pi.registerProvider('openai-codex', {
    baseUrl,
    api: 'openai-codex-responses',
    streamSimple(model, context, options) {
      if (model.api !== 'openai-codex-responses' || model.baseUrl !== baseUrl) {
        throw new Error('Cache Hunter Codex endpoint override was not applied')
      }
      return nativeApi.streamSimple(model as Model<'openai-codex-responses'>, context, {
        ...options,
        transport: 'sse',
        fetch(input, init) {
          const url = new URL(input instanceof Request ? input.url : input)
          if (url.origin !== baseUrl || url.pathname !== '/codex/responses') {
            throw new Error('Unexpected Cache Hunter Codex request endpoint')
          }
          url.pathname = '/v1/responses'
          return globalThis.fetch(url, { ...init, redirect: 'error' })
        },
      })
    },
  })
  const updateStatus = (ctx: ExtensionContext) => ctx.ui.setStatus('cache-hunter',
    ctx.model?.provider === 'openai-codex' ? 'Cache Hunter: Codex proxy · SSE' : 'Cache Hunter: other provider direct')
  pi.on('session_start', (_event, ctx) => updateStatus(ctx))
  pi.on('model_select', (_event, ctx) => updateStatus(ctx))
}
