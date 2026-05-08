import crypto from 'crypto'

export interface PresignParams {
  method: 'PUT' | 'GET' | 'DELETE' | 'HEAD'
  bucket: string
  key: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string // e.g., https://s3.amazonaws.com or https://<account>.r2.cloudflarestorage.com
  expiresIn?: number // seconds (default 900)
  contentType?: string
}

export interface PresignListParams {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  expiresIn?: number
  prefix?: string
  continuationToken?: string
  maxKeys?: number
}

function sha256Hex(data: string | Buffer) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function toISODate(date: Date) {
  // YYYYMMDD and YYYYMMDDTHHMMSSZ
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const H = String(date.getUTCHours()).padStart(2, '0')
  const M = String(date.getUTCMinutes()).padStart(2, '0')
  const S = String(date.getUTCSeconds()).padStart(2, '0')
  const short = `${y}${m}${d}`
  const long = `${short}T${H}${M}${S}Z`
  return { short, long }
}

interface SignCoreInput {
  method: 'PUT' | 'GET' | 'DELETE' | 'HEAD'
  endpoint: string
  pathname: string
  /** Pre-built query params; signing adds the AWS-required keys onto a copy. */
  query: URLSearchParams
  region: string
  accessKeyId: string
  secretAccessKey: string
  expiresIn: number
  signedHeaderNames?: string[]
}

/**
 * Core AWS SigV4 query-string signer. Returns the final URL with
 * `X-Amz-Signature` appended. Both `presignS3Url` and `presignS3List`
 * delegate to this so the canonical-request math lives in one place.
 */
function signSigV4QueryUrl(input: SignCoreInput): string {
  const url = new URL(input.endpoint)
  url.pathname = input.pathname

  const host = url.host
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const now = new Date()
  const { short: date, long: amzDate } = toISODate(now)
  const credentialScope = `${date}/${input.region}/${service}/aws4_request`

  // Copy caller's query, then add SigV4 params. We never mutate the caller's
  // URLSearchParams.
  const qs = new URLSearchParams(input.query)
  qs.set('X-Amz-Algorithm', algorithm)
  qs.set('X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`)
  qs.set('X-Amz-Date', amzDate)
  qs.set('X-Amz-Expires', String(Math.min(604800, Math.max(1, input.expiresIn))))
  const signedHeaders = input.signedHeaderNames && input.signedHeaderNames.length > 0
    ? input.signedHeaderNames
    : ['host']
  qs.set('X-Amz-SignedHeaders', signedHeaders.join(';'))

  // Canonical request — query params must be sorted by key (URLSearchParams
  // preserves insertion order, so build a sorted copy explicitly).
  const sortedPairs = Array.from(qs.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const canonicalQuerystring = sortedPairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalUri = url.pathname
  const canonicalHeaders = `host:${host}\n`
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash,
  ].join('\n')

  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')

  const kDate = hmac('AWS4' + input.secretAccessKey, date)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  qs.set('X-Amz-Signature', signature)

  return `${url.origin}${canonicalUri}?${qs.toString()}`
}

export function presignS3Url(params: PresignParams): string {
  const {
    method,
    bucket,
    key,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint = 'https://s3.amazonaws.com',
    expiresIn = 900,
  } = params

  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const pathname = `/${bucket}/${encodedKey}`

  return signSigV4QueryUrl({
    method,
    endpoint,
    pathname,
    query: new URLSearchParams(),
    region,
    accessKeyId,
    secretAccessKey,
    expiresIn,
  })
}

/**
 * Presign a ListObjectsV2 GET against the bucket. R2 supports the same
 * S3 LIST API. Returns a URL that fetches an XML body listing objects under
 * `prefix`, optionally continued via `continuationToken`.
 */
export function presignS3List(params: PresignListParams): string {
  const {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint = 'https://s3.amazonaws.com',
    expiresIn = 300,
    prefix,
    continuationToken,
    maxKeys,
  } = params

  const query = new URLSearchParams()
  query.set('list-type', '2')
  if (prefix) query.set('prefix', prefix)
  if (continuationToken) query.set('continuation-token', continuationToken)
  if (typeof maxKeys === 'number' && maxKeys > 0) query.set('max-keys', String(Math.min(1000, maxKeys)))

  return signSigV4QueryUrl({
    method: 'GET',
    endpoint,
    pathname: `/${bucket}/`,
    query,
    region,
    accessKeyId,
    secretAccessKey,
    expiresIn,
  })
}
