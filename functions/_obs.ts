import { randomUUID } from 'node:crypto'

const LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN || ''
const SENTRY_DSN = process.env.SENTRY_DSN || ''

export async function log(event: Record<string, any>) {
  try {
    if (LOGTAIL_TOKEN) {
      await fetch('https://in.logtail.com/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${LOGTAIL_TOKEN}` },
        body: JSON.stringify(event),
      })
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(event))
    }
  } catch {
    // ignore
  }
}

interface ParsedDsn {
  protocol: string
  publicKey: string
  host: string
  projectId: string
}

/**
 * Parse a Sentry DSN of the form `https://<key>@<host>/<projectId>`. Returns
 * `null` for malformed input so the caller can degrade gracefully.
 */
function parseSentryDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\//, '').split('/').pop() || ''
    if (!u.username || !u.host || !projectId) return null
    return {
      protocol: u.protocol.replace(/:$/, ''),
      publicKey: u.username,
      host: u.host,
      projectId,
    }
  } catch {
    return null
  }
}

interface StackFrame {
  function?: string
  filename?: string
  lineno?: number
  colno?: number
}

/**
 * Best-effort V8 stack-trace parser. Sentry accepts partial frames, so we
 * don't need 100% coverage — readable frames beat no frames.
 */
function parseStack(stack?: string): StackFrame[] {
  if (!stack) return []
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .map((line) => {
      // Match either `at fnName (file:line:col)` or `at file:line:col`.
      const withFn = /^at (.+?) \((.+?):(\d+):(\d+)\)$/.exec(line)
      if (withFn) {
        return { function: withFn[1], filename: withFn[2], lineno: Number(withFn[3]), colno: Number(withFn[4]) }
      }
      const noFn = /^at (.+?):(\d+):(\d+)$/.exec(line)
      if (noFn) {
        return { filename: noFn[1], lineno: Number(noFn[2]), colno: Number(noFn[3]) }
      }
      return { function: line.replace(/^at /, '') }
    })
    .slice(0, 50)
}

/**
 * POST a Sentry envelope (no SDK needed). Spec:
 *   header line (JSON) \n item-header line (JSON) \n payload line (JSON)
 * https://develop.sentry.dev/sdk/envelopes/
 */
async function postSentryEnvelope(err: any, context?: Record<string, any>): Promise<boolean> {
  const dsn = parseSentryDsn(SENTRY_DSN)
  if (!dsn) return false
  const eventId = randomUUID().replace(/-/g, '')
  const sentAt = new Date().toISOString()

  const envelopeHeader = { event_id: eventId, dsn: SENTRY_DSN, sent_at: sentAt }
  const itemHeader = { type: 'event' }
  const payload = {
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    level: 'error',
    platform: 'node',
    logger: 'hhs-fn',
    message: err?.message || String(err),
    exception: {
      values: [
        {
          type: err?.name || 'Error',
          value: err?.message || String(err),
          stacktrace: { frames: parseStack(err?.stack).reverse() },
        },
      ],
    },
    contexts: context ? { runtime: context } : undefined,
    tags: context?.where ? { where: String(context.where) } : undefined,
  }

  const body = `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(payload)}`
  const url = `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${dsn.publicKey}&sentry_version=7&sentry_client=hhs-fn/1.0`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body,
    })
    return res.ok
  } catch {
    return false
  }
}

export async function captureException(err: any, context?: Record<string, any>) {
  // Always log so the error is at least in Logtail/console, even if Sentry
  // is unconfigured or the envelope POST fails. Order: log first (cheap),
  // then Sentry (network).
  try {
    await log({ level: 'error', msg: 'exception', err: err?.message || String(err), stack: err?.stack, ...context })
  } catch {
    // ignore
  }
  if (SENTRY_DSN) {
    try {
      await postSentryEnvelope(err, context)
    } catch {
      // already logged above
    }
  }
}
