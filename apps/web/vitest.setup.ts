import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  http.post('/.netlify/functions/detectHighlights', async () => {
    return HttpResponse.json({ segments: [{ id: 's1', start: 1, end: 2.5, label: 'dunk', confidence: 0.9, score: 0.95 }] })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

