export async function postJson(fn, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const res = await fetch(`/.netlify/functions/${fn}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Request failed: ${res.status}`);
        }
        return (await res.json());
    }
    finally {
        clearTimeout(timer);
    }
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
