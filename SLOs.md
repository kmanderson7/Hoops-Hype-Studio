Service Level Objectives

- Availability
  - Netlify Functions 99.9% monthly success rate (2xx/3xx responses)
  - Edge security function <1 ms p50, <10 ms p95 processing time

- Latency (p95)
  - createUploadUrl: <250 ms
  - ingestAsset: <1.5 s (excludes worker processing)
  - detectHighlights proxy: <400 ms (excludes worker duration)
  - startRenderJob: <300 ms
  - getJobStatus: <200 ms

- Error Budget
  - <0.1% of requests return 5xx per rolling 30 days

- Observability Dashboards (Logtail/Sentry)
  - Request volume by function, success/error rates
  - Latency p50/p95/p99 per function
  - Render job funnel: created → running → done; drop-off and average duration
  - Rate limit rejections (429) by IP and path

- Alerts
  - Error rate >0.5% for 5 min: page
  - startRenderJob latency p95 >700 ms for 10 min: warn
  - Modal worker 5xx >2% for 5 min: warn

