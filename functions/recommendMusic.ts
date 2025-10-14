import type { Handler } from '@netlify/functions'
export const handler: Handler = async () => {
  // placeholder: normally call Pixabay API with BPM/mood filters
  const tracks = [
    { url:'https://cdn.example/hype1.mp3', title:'Fast Break', bpm:132, mood:'hype', energy:0.9, license:'royalty-free' },
    { url:'https://cdn.example/hype2.mp3', title:'Full Court Press', bpm:126, mood:'intense', energy:0.86, license:'royalty-free' }
  ]
  return { statusCode: 200, body: JSON.stringify({ tracks }) }
}
