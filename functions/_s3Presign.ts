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
    contentType,
  } = params

  const now = new Date()
  const { short: date, long: amzDate } = toISODate(now)

  // Use path-style for compatibility with custom endpoints (R2)
  const url = new URL(endpoint)
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  url.pathname = `/${bucket}/${encodedKey}`

  const host = url.host
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${date}/${region}/${service}/aws4_request`

  // Query params for presigning
  const qs = new URLSearchParams()
  qs.set('X-Amz-Algorithm', algorithm)
  qs.set('X-Amz-Credential', `${encodeURIComponent(accessKeyId + '/' + credentialScope)}`)
  qs.set('X-Amz-Date', amzDate)
  qs.set('X-Amz-Expires', String(Math.min(604800, Math.max(1, expiresIn))))
  // Signed headers: at minimum host; include content-type only if you will send it and want it signed
  const signedHeaders = ['host']
  // If you want to require content-type, uncomment:
  // if (contentType) signedHeaders.push('content-type')
  qs.set('X-Amz-SignedHeaders', signedHeaders.join(';'))

  // Canonical request
  const canonicalUri = url.pathname
  const canonicalQuerystring = qs.toString()
  const canonicalHeaders = `host:${host}\n`
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = [method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n')

  // String to sign
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')

  // Signing key
  const kDate = hmac('AWS4' + secretAccessKey, date)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  qs.set('X-Amz-Signature', signature)

  const presignedUrl = `${url.origin}${canonicalUri}?${qs.toString()}`
  return presignedUrl
}
