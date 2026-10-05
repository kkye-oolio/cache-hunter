import * as zlib from 'node:zlib'

export function decodeRequestBody(raw: Buffer, contentEncoding?: string): string {
  let decoded: Buffer = raw
  const encodings = (contentEncoding ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  for (const encoding of encodings.reverse()) {
    switch (encoding) {
      case 'identity': break
      case 'gzip': decoded = zlib.gunzipSync(decoded); break
      case 'deflate': decoded = zlib.inflateSync(decoded); break
      case 'br': decoded = zlib.brotliDecompressSync(decoded); break
      case 'zstd': {
        const decompress = Reflect.get(zlib, 'zstdDecompressSync')
        if (typeof decompress !== 'function') throw new Error('Zstd capture decoding requires a Node runtime with zstdDecompressSync')
        decoded = decompress(decoded)
        break
      }
      default: throw new Error('Unsupported request content encoding')
    }
  }
  return decoded.toString('utf8')
}
