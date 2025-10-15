export async function postJson(fn, payload) {
    const res = await fetch(`/.netlify/functions/${fn}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    return (await res.json());
}
export const api = {
    createUploadUrl: (payload) => postJson('createUploadUrl', payload),
    detectHighlights: (payload) => postJson('detectHighlights', payload),
    detectBeats: (payload) => postJson('detectBeats', payload),
    recommendMusic: (payload) => postJson('recommendMusic', payload),
    startRenderJob: (payload) => postJson('startRenderJob', payload),
    getJobStatus: (payload) => postJson('getJobStatus', payload),
    finalizeExport: (payload) => postJson('finalizeExport', payload),
    ingestAsset: (payload) => postJson('ingestAsset', payload),
    deleteAsset: (payload) => postJson('deleteAsset', payload),
    deleteExport: (payload) => postJson('deleteExport', payload),
};
