import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { StudioStepper } from './components/StudioStepper';
import { InsightsPanel } from './components/InsightsPanel';
import { UploadStage } from './components/stages/UploadStage';
import { AnalysisStage } from './components/stages/AnalysisStage';
import { MusicStage } from './components/stages/MusicStage';
import { EditorStage } from './components/stages/EditorStage';
import { ExportStage } from './components/stages/ExportStage';
import { useStudioState } from './state/useStudioState';
import { api } from './lib/apiClient';
export default function App() {
    const [isRendering, setIsRendering] = useState(false);
    const renderTimers = useRef([]);
    const { assetId, proxyUrl, currentStage, stageStatus, fileInfo, ingestUpload, tasks, processingProgress, highlights, beatMarkers, energyCurve, musicTracks, selectedTrackId, exportPresets, exportDownloads, renderStatus, insights, updateTask, setProcessingProgress, setStageStatus, setCurrentStage, setHighlights, setBeatMarkers, setEnergyCurve, setMusicTracks, selectTrack, markPresetProgress, togglePreset, setRenderStatus, setExportDownloads, overlayConfig, setOverlayConfig, setInsights, setAssetInfo, uploadRunId, reset, } = useStudioState((state) => ({
        assetId: state.assetId,
        proxyUrl: state.proxyUrl,
        currentStage: state.currentStage,
        stageStatus: state.stageStatus,
        fileInfo: state.fileInfo,
        ingestUpload: state.ingestUpload,
        tasks: state.tasks,
        processingProgress: state.processingProgress,
        highlights: state.highlights,
        beatMarkers: state.beatMarkers,
        energyCurve: state.energyCurve,
        musicTracks: state.musicTracks,
        selectedTrackId: state.selectedTrackId,
        exportPresets: state.exportPresets,
        exportDownloads: state.exportDownloads,
        renderStatus: state.renderStatus,
        insights: state.insights,
        updateTask: state.updateTask,
        setProcessingProgress: state.setProcessingProgress,
        setStageStatus: state.setStageStatus,
        setCurrentStage: state.setCurrentStage,
        setHighlights: state.setHighlights,
        setBeatMarkers: state.setBeatMarkers,
        setEnergyCurve: state.setEnergyCurve,
        setMusicTracks: state.setMusicTracks,
        selectTrack: state.selectTrack,
        markPresetProgress: state.markPresetProgress,
        togglePreset: state.togglePreset,
        setRenderStatus: state.setRenderStatus,
        setExportDownloads: state.setExportDownloads,
        overlayConfig: state.overlayConfig,
        setOverlayConfig: state.setOverlayConfig,
        setInsights: state.setInsights,
        setAssetInfo: state.setAssetInfo,
        uploadRunId: state.uploadRunId,
        reset: state.reset,
    }));
    useEffect(() => {
        if (!uploadRunId)
            return;
        let progressValue = 0.15;
        setProcessingProgress(progressValue);
        setStageStatus('analysis', 'active');
        updateTask('chunk-encoder', { status: 'running', progress: 10 });
        const tick = window.setInterval(() => {
            progressValue = Math.min(0.97, progressValue + 0.03);
            setProcessingProgress(progressValue);
        }, 450);
        (async () => {
            try {
                // Step 1: Highlights
                updateTask('highlight-detection', { status: 'running', progress: 10 });
                const hi = await api.detectHighlights({ videoUrl: proxyUrl || fileInfo?.previewUrl });
                const mapped = hi.segments?.map((s, i) => {
                    if (s?.timestamp && s?.action)
                        return s;
                    const action = s.label === 'dunk' ? 'Dunk' : s.label === 'three' ? 'Three Pointer' : 'Assist';
                    const clipDuration = Math.max(0, (s.end ?? 0) - (s.start ?? 0));
                    const mm = Math.floor((s.start ?? 0) / 60);
                    const ss = Math.round((s.start ?? 0) % 60);
                    const timestamp = `${mm > 0 ? `${mm}m ` : ''}${String(ss).padStart(2, '0')}`;
                    return {
                        id: s.id || `seg-${i + 1}`,
                        timestamp,
                        action: action,
                        descriptor: `${action} - auto-detected`,
                        confidence: s.confidence ?? 0.9,
                        audioPeak: 0.6,
                        motion: 0.7,
                        score: s.score ?? 0.85,
                        clipDuration,
                    };
                });
                setHighlights(mapped || []);
                updateTask('highlight-detection', { status: 'done', progress: 100 });
                // Step 2: Beats
                updateTask('beat-sync', { status: 'running', progress: 20 });
                const beats = await api.detectBeats({ assetId, trackId: selectedTrackId, trackUrl: selectedTrack?.previewUrl, previewUrl: selectedTrack?.previewUrl });
                const markers = beats.beatGrid.map((t, idx) => ({ id: `beat-${idx}`, time: t, intensity: idx % 4 === 0 ? 0.92 : 0.6 }));
                setBeatMarkers(markers);
                // derive a lightweight energy curve from beats
                const curve = Array.from({ length: Math.min(20, markers.length) }, (_, i) => 0.5 + 0.5 * Math.sin(i / 3));
                setEnergyCurve(curve);
                updateTask('beat-sync', { status: 'done', progress: 100 });
                // Step 3: Music
                updateTask('music-intel', { status: 'running', progress: 25 });
                const rec = await api.recommendMusic({});
                const tracks = rec.tracks.map((t, i) => ({
                    id: `track-${i + 1}`,
                    title: t.title,
                    artist: 'Unknown',
                    bpm: t.bpm,
                    mood: (['High Energy', 'Hybrid Trap', 'Anthemic', 'Electro Drive'].includes(t.mood)
                        ? t.mood
                        : 'High Energy'),
                    energyLevel: Math.round(Math.min(1, Math.max(0, t.energy)) * 100),
                    matchScore: 90 - i * 3,
                    key: 'E Minor',
                    previewUrl: t.url,
                    waveform: Array.from({ length: 32 }, (_, idx) => {
                        const v = 0.7 + Math.sin(idx / 3) * 0.15;
                        return Math.min(1, Math.max(0.25, v));
                    }),
                }));
                setMusicTracks(tracks);
                // Insights (basic derived placeholder)
                const avgConf = mapped.reduce((a, b) => a + (b.confidence || 0.8), 0) / Math.max(mapped.length, 1);
                const avgBeat = 0.8;
                const avgEnergy = markers.reduce((a, b) => a + b.intensity, 0) / Math.max(markers.length, 1);
                setInsights({
                    accuracy: avgConf,
                    beatAlignment: avgBeat,
                    crowdEnergy: Math.min(1, avgEnergy),
                    notes: [
                        mapped[0]?.descriptor ? `Top moment: ${mapped[0].descriptor}` : 'Highlights detected',
                        `Beat grid length: ${markers.length}`,
                    ],
                });
                progressValue = 1;
                setProcessingProgress(progressValue);
                setStageStatus('analysis', 'complete');
                setStageStatus('music', 'active');
                setCurrentStage('music');
            }
            catch (err) {
                setRenderStatus(`Analysis error: ${err}`);
                setStageStatus('analysis', 'pending');
            }
            finally {
                window.clearInterval(tick);
            }
        })();
    }, [
        uploadRunId,
        fileInfo?.previewUrl,
        setProcessingProgress,
        setStageStatus,
        updateTask,
        setHighlights,
        setBeatMarkers,
        setEnergyCurve,
        setMusicTracks,
        setInsights,
        setCurrentStage,
        setRenderStatus,
    ]);
    const selectedTrack = useMemo(() => musicTracks.find((track) => track.id === selectedTrackId), [musicTracks, selectedTrackId]);
    const handleFileAccepted = async (file, previewUrl) => {
        try {
            updateTask('chunk-encoder', { status: 'running', progress: 5 });
            setStageStatus('analysis', 'active');
            // Prefer Uppy + Tus if configured via Vite env
            const tusEndpoint = import.meta.env?.VITE_TUS_ENDPOINT;
            if (tusEndpoint) {
                try {
                    const [{ default: Uppy }, { default: Tus }] = await Promise.all([
                        import('@uppy/core'),
                        import('@uppy/tus'),
                    ]);
                    const uppy = new Uppy({ autoProceed: false });
                    uppy.use(Tus, {
                        endpoint: tusEndpoint,
                        retryDelays: [0, 1000, 3000, 5000],
                        chunkSize: 5 * 1024 * 1024,
                        removeFingerprintOnSuccess: true,
                    });
                    uppy.on('upload-progress', (_file, progress) => {
                        const pct = Math.min(95, Math.round(progress.percentage || 0));
                        updateTask('chunk-encoder', { progress: pct });
                        setProcessingProgress(Math.max(0.05, pct / 100));
                    });
                    uppy.on('complete', () => {
                        updateTask('chunk-encoder', { status: 'done', progress: 100 });
                        uppy.close?.();
                        ingestUpload({ file, previewUrl });
                    });
                    uppy.addFile({ data: file, name: file.name, type: file.type });
                    await uppy.upload();
                    return;
                }
                catch (e) {
                    // Fall back to presigned PUT if Uppy fails
                }
            }
            const { uploadUrl, assetId: newAssetId, key } = await api.createUploadUrl({ fileName: file.name, size: file.size, type: file.type });
            // Upload via XHR to track progress (fetch lacks upload progress events)
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl, true);
                xhr.upload.onprogress = (evt) => {
                    if (!evt.lengthComputable)
                        return;
                    const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100));
                    updateTask('chunk-encoder', { progress: pct });
                    setProcessingProgress(Math.max(0.05, pct / 100));
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        updateTask('chunk-encoder', { status: 'done', progress: 100 });
                        resolve();
                    }
                    else {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('Upload network error'));
                xhr.setRequestHeader('content-type', file.type);
                xhr.send(file);
            });
            // Trigger ingest to analysis pipeline (UI effect will handle API calls)
            if (newAssetId && key) {
                try {
                    const ingest = await api.ingestAsset({ assetId: newAssetId, key });
                    if (ingest?.proxyUrl)
                        setRenderStatus('Proxy generated; proceeding to analysis...');
                    // Record asset/proxy for downstream calls
                    setAssetInfo({ assetId: newAssetId, proxyUrl: ingest?.proxyUrl });
                }
                catch (e) {
                    setRenderStatus(`Ingest error: ${e}`);
                }
            }
            ingestUpload({ file, previewUrl });
        }
        catch (e) {
            setRenderStatus(`Upload error: ${e}`);
        }
    };
    const handleAdvanceFromAnalysis = () => {
        setCurrentStage('music');
    };
    const handleSelectTrack = (trackId) => {
        selectTrack(trackId);
    };
    const handleLockTrack = (trackId) => {
        setStageStatus('music', 'complete');
        if (stageStatus.editor === 'pending') {
            setStageStatus('editor', 'active');
        }
        setCurrentStage('editor');
    };
    const handleOpenExport = () => {
        setStageStatus('editor', 'complete');
        setStageStatus('export', 'active');
        setCurrentStage('export');
    };
    const handleStartRender = () => {
        renderTimers.current.forEach((id) => window.clearTimeout(id));
        renderTimers.current = [];
        const enabled = exportPresets.filter((preset) => preset.enabled);
        if (enabled.length === 0 || isRendering) {
            setRenderStatus('Enable at least one preset to start rendering.');
            return;
        }
        setIsRendering(true);
        setRenderStatus('Submitting render job...');
        setStageStatus('export', 'active');
        enabled.forEach((p) => markPresetProgress(p.id, 5));
        (async () => {
            try {
                // Build beat-aligned cut list (±0.3s)
                const toSeconds = (ts) => {
                    const mIdx = ts.indexOf('m');
                    if (mIdx > -1) {
                        const m = parseInt(ts.slice(0, mIdx).trim() || '0', 10);
                        const s = parseInt(ts.slice(mIdx + 1).trim() || '0', 10);
                        return Math.max(0, m * 60 + s);
                    }
                    const n = parseInt(ts.replace(/[^0-9]/g, '') || '0', 10);
                    return Math.max(0, n);
                };
                const grid = beatMarkers.map((b) => b.time).sort((a, b) => a - b);
                const snap = (t) => {
                    if (grid.length === 0)
                        return t;
                    let best = grid[0];
                    let diff = Math.abs(best - t);
                    for (let i = 1; i < grid.length; i++) {
                        const d = Math.abs(grid[i] - t);
                        if (d < diff) {
                            diff = d;
                            best = grid[i];
                        }
                    }
                    return diff <= 0.3 ? best : t;
                };
                const segments = highlights.slice(0, 12).map((h) => {
                    const s0 = toSeconds(h.timestamp);
                    const start = snap(s0);
                    const end = Math.max(start + 0.8, start + (h.clipDuration || 2));
                    const impact = Math.min(end, start + Math.min(0.3, (h.clipDuration || 2) / 2));
                    return { start, end, impact };
                });
                const payload = {
                    assetId,
                    trackId: selectedTrack?.id,
                    presets: enabled.map((p) => ({ presetId: p.id })),
                    metadata: {
                        overlay: overlayConfig,
                        trackUrl: selectedTrack?.previewUrl,
                        segments,
                    },
                };
                const { jobId } = await api.startRenderJob(payload);
                setRenderStatus(`Render job queued: ${jobId}`);
                // Poll job status
                let progress = 10;
                const poll = window.setInterval(async () => {
                    try {
                        const status = await api.getJobStatus({ jobId });
                        if (status.progress != null)
                            progress = Math.max(progress, status.progress);
                        const presetProgress = status.presets;
                        if (presetProgress && Array.isArray(presetProgress)) {
                            presetProgress.forEach((pp) => markPresetProgress(pp.presetId, Math.min(99, pp.progress)));
                        }
                        else {
                            enabled.forEach((p) => markPresetProgress(p.id, Math.min(99, progress)));
                        }
                        if (status.status === 'done') {
                            enabled.forEach((p) => markPresetProgress(p.id, 100));
                            const payload = status.payload;
                            if (payload?.downloads) {
                                setExportDownloads(payload.downloads);
                            }
                            // Refresh signed URLs via finalizeExport
                            try {
                                const fz = await api.finalizeExport({ renderJobId: jobId });
                                setExportDownloads(fz.downloads);
                            }
                            catch { }
                            setRenderStatus('All exports complete. Signed URLs ready.');
                            setStageStatus('export', 'complete');
                            setIsRendering(false);
                            window.clearInterval(poll);
                        }
                        else if (status.status === 'error') {
                            setRenderStatus('Render failed. Please retry.');
                            setIsRendering(false);
                            window.clearInterval(poll);
                        }
                        else {
                            progress = Math.min(98, progress + 8);
                            setRenderStatus(`Rendering... ${progress}%`);
                        }
                    }
                    catch (e) {
                        setRenderStatus(`Render polling error: ${e}`);
                        setIsRendering(false);
                    }
                }, 800);
                renderTimers.current.push(poll);
            }
            catch (e) {
                setRenderStatus(`Failed to start render: ${e}`);
                setIsRendering(false);
            }
        })();
    };
    const handleDeleteExport = async (presetId) => {
        try {
            if (!assetId) {
                setRenderStatus('Cannot delete export: missing assetId');
                return;
            }
            const res = await api.deleteExport({ assetId, presetId });
            if (res.deleted) {
                setExportDownloads(exportDownloads.filter((d) => d.presetId !== presetId));
                markPresetProgress(presetId, 0);
                setRenderStatus(`Deleted export for ${presetId}.`);
            }
            else {
                setRenderStatus(`Failed to delete export ${presetId}.`);
            }
        }
        catch (e) {
            setRenderStatus(`Delete export error: ${e}`);
        }
    };
    const handleDeleteAsset = async () => {
        try {
            if (!assetId) {
                reset();
                return;
            }
            await api.deleteAsset({ assetId });
            reset();
            setRenderStatus('Asset deleted and session cleared.');
        }
        catch (e) {
            setRenderStatus(`Delete asset error: ${e}`);
        }
    };
    useEffect(() => () => {
        renderTimers.current.forEach((id) => window.clearTimeout(id));
    }, []);
    useEffect(() => {
        const url = fileInfo?.previewUrl;
        if (!url)
            return;
        return () => URL.revokeObjectURL(url);
    }, [fileInfo?.previewUrl]);
    const renderPrimaryStage = (stage) => {
        switch (stage) {
            case 'upload':
                return (_jsx(UploadStage, { fileInfo: fileInfo, onFileAccepted: handleFileAccepted, isProcessing: stageStatus.analysis !== 'pending' }));
            case 'analysis':
                return (_jsx(AnalysisStage, { tasks: tasks, processingProgress: processingProgress, highlights: highlights, beatMarkers: beatMarkers, energyCurve: energyCurve, onProceed: handleAdvanceFromAnalysis }));
            case 'music':
                return (_jsx(MusicStage, { tracks: musicTracks, selectedTrackId: selectedTrackId, onSelect: handleSelectTrack, onLock: handleLockTrack }));
            case 'editor':
                return (_jsx(EditorStage, { fileInfo: fileInfo, highlights: highlights, beatMarkers: beatMarkers, selectedTrack: selectedTrack, onLaunchExport: handleOpenExport }));
            case 'export':
                return (_jsx(ExportStage, { presets: exportPresets, onTogglePreset: togglePreset, onStartRender: handleStartRender, renderStatus: renderStatus, isRendering: isRendering, downloads: exportDownloads, onDeleteExport: handleDeleteExport, onDeleteAsset: handleDeleteAsset }));
            default:
                return null;
        }
    };
    return (_jsxs("div", { className: "min-h-screen bg-[radial-gradient(circle_at_top,_#312e81,_#020617)] text-slate-100", children: [_jsx("div", { className: "border-b border-white/10 bg-slate-950/60", children: _jsxs("div", { className: "mx-auto max-w-7xl px-6 py-8", children: [_jsxs("header", { className: "flex flex-wrap items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-indigo-300/80", children: "Hoops Hype Studio" }), _jsx("h1", { className: "mt-2 text-3xl font-bold text-white", children: "AI-Powered Basketball Hype Lab" }), _jsx("p", { className: "mt-2 max-w-xl text-sm text-slate-300", children: "Upload raw games. We auto-detect highlights, sync to hype tracks, apply motion-aware color, and export in every format your audience needs." })] }), _jsxs("div", { className: "flex flex-col items-end gap-3", children: [_jsxs("div", { className: "rounded-2xl border border-indigo-400/40 bg-indigo-500/10 px-5 py-4 text-sm text-indigo-100 shadow-lg shadow-indigo-500/20", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.18em] text-indigo-200/80", children: "Deployment" }), _jsx("p", { className: "mt-1 font-semibold text-white", children: "Netlify Edge / Serverless Functions / GPU Worker" }), _jsx("p", { className: "text-xs text-indigo-100/70", children: "Built for high-volume weekend tournaments & AAU seasons." })] }), _jsx("button", { type: "button", onClick: () => {
                                                reset();
                                                setRenderStatus(undefined);
                                                setIsRendering(false);
                                            }, className: "rounded-full border border-white/20 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/40 hover:bg-slate-900/80", children: "Start New Session" })] })] }), _jsx("div", { className: "mt-6", children: _jsx(StudioStepper, { stageStatus: stageStatus, currentStage: currentStage, onNavigate: (stage) => {
                                    const isUnlocked = stageStatus[stage] !== 'pending' || stage === 'upload';
                                    if (isUnlocked) {
                                        setCurrentStage(stage);
                                    }
                                } }) })] }) }), _jsx("main", { className: "relative -mt-10 pb-20 pt-14", children: _jsxs("div", { className: "mx-auto flex max-w-7xl flex-col gap-6 px-6 lg:flex-row", children: [_jsx("section", { className: "flex-1 space-y-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur", children: renderPrimaryStage(currentStage) }), _jsx(InsightsPanel, { insights: insights, fileInfo: fileInfo, highlights: highlights, selectedTrack: selectedTrack })] }) })] }));
}
