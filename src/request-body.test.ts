import { describe, it, expect } from 'vitest'
import * as zlib from 'node:zlib'
import { decodeRequestBody } from './request-body.js'

const json = JSON.stringify({ messages: [{ role: 'user', content: 'Unicode λ 日本' }] })
const raw = Buffer.from(json)

describe('decodeRequestBody', () => {
  it('preserves uncompressed JSON', () => {
    expect(decodeRequestBody(raw)).toBe(json)
    expect(decodeRequestBody(raw, 'identity')).toBe(json)
  })

  for (const [encoding, compress] of [
    ['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync],
  ] as const) {
    it(`decodes ${encoding} without changing the forwarded buffer`, () => {
      const compressed = compress(raw)
      const original = Buffer.from(compressed)
      expect(decodeRequestBody(compressed, encoding)).toBe(json)
      expect(compressed).toEqual(original)
    })
  }

  it('decodes zstd without changing the forwarded buffer', () => {
    const compress = Reflect.get(zlib, 'zstdCompressSync')
    expect(typeof compress).toBe('function')
    const compressed = compress(raw) as Buffer
    const original = Buffer.from(compressed)
    expect(decodeRequestBody(compressed, 'zstd')).toBe(json)
    expect(compressed).toEqual(original)
  })

  it('decodes stacked encodings in reverse order', () => {
    const compressed = zlib.brotliCompressSync(zlib.gzipSync(raw))
    expect(decodeRequestBody(compressed, 'gzip, br')).toBe(json)
  })

  it('rejects unsupported encodings', () => {
    expect(() => decodeRequestBody(raw, 'unknown')).toThrow('Unsupported request content encoding')
  })

  it('reports invalid compressed data instead of returning an empty body', () => {
    expect(() => decodeRequestBody(raw, 'zstd')).toThrow()
  })
})
