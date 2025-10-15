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

export async function captureException(err: any, context?: Record<string, any>) {
  try {
    // If SENTRY_DSN is configured, you can integrate @sentry/node here.
    // Fallback: log the error through Logtail/console.
    await log({ level: 'error', msg: 'exception', err: err?.message || String(err), ...context })
  } catch {
    // ignore
  }
}

