import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { api } from '../../lib/apiClient';
export function ExportStage({ presets, onTogglePreset, onStartRender, renderStatus, isRendering, downloads, onDeleteExport, onDeleteAsset, voiceoverEnabled, onVoiceoverToggle, sfxEnabled, onSfxToggle, }) {
    const labelFor = (presetId) => presets.find((p) => p.id === presetId)?.label || presetId;
    return (_jsxs("section", { className: "space-y-6", children: [_jsxs("header", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold text-white", children: "Export Suite" }), _jsx("p", { className: "text-sm text-slate-400", children: "Encode multiple aspect ratios in parallel. We deliver signed URLs ready for Instagram, TikTok, YouTube, and Hudl." })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { type: "button", onClick: onStartRender, disabled: isRendering, className: "rounded-full border border-emerald-400/50 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-40", children: isRendering ? 'Rendering...' : 'Render Hype Video' }), onDeleteAsset && (_jsx("button", { type: "button", onClick: () => {
                                    if (confirm('Delete asset and clear this session? This cannot be undone.'))
                                        onDeleteAsset();
                                }, className: "rounded-full border border-red-400/50 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/20", children: "Delete Asset" }))] })] }), _jsx(SystemHealthLink, {}), (onVoiceoverToggle || onSfxToggle) && (_jsxs("div", { className: "rounded-3xl border border-amber-400/20 bg-amber-500/5 p-4", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.18em] text-amber-200/80", children: "Broadcast Polish" }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-3", children: [onVoiceoverToggle && (_jsxs("label", { className: "flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900", children: [_jsx("input", { type: "checkbox", checked: !!voiceoverEnabled, onChange: (e) => onVoiceoverToggle(e.target.checked), className: "h-4 w-4 rounded border border-white/20 bg-slate-900 accent-amber-400" }), _jsx("span", { className: "font-semibold", children: "AI Anchor Narration" }), _jsx("span", { className: "text-slate-500", children: "~$0.02/render" })] })), onSfxToggle && (_jsxs("label", { className: "flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900", children: [_jsx("input", { type: "checkbox", checked: !!sfxEnabled, onChange: (e) => onSfxToggle(e.target.checked), className: "h-4 w-4 rounded border border-white/20 bg-slate-900 accent-amber-400" }), _jsx("span", { className: "font-semibold", children: "Action SFX Stingers" }), _jsx("span", { className: "text-slate-500", children: "free" })] }))] })] })), _jsx("div", { className: "grid gap-4 sm:grid-cols-2", children: presets.map((preset) => (_jsxs("label", { className: `flex cursor-pointer flex-col gap-3 rounded-3xl border p-4 transition ${preset.enabled
                        ? 'border-indigo-400/40 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                        : 'border-white/10 bg-slate-900/60 hover:border-indigo-400/40 hover:bg-indigo-500/10'}`, children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-white", children: preset.label }), _jsxs("p", { className: "text-xs text-slate-400", children: [preset.aspect, " / ", preset.resolution] })] }), _jsx("input", { type: "checkbox", className: "mt-1 h-5 w-5 cursor-pointer rounded border border-white/20 bg-slate-900 text-indigo-400 accent-indigo-500", checked: preset.enabled, onChange: () => onTogglePreset(preset.id) })] }), _jsxs("dl", { className: "grid grid-cols-2 gap-2 text-xs uppercase tracking-[0.14em] text-slate-400", children: [_jsx(Stat, { label: "Aspect", value: preset.aspect }), _jsx(Stat, { label: "Resolution", value: preset.resolution }), _jsx(Stat, { label: "Bitrate", value: preset.bitrate }), _jsx(Stat, { label: "Codec", value: preset.container })] }), _jsx("div", { className: "h-1.5 w-full overflow-hidden rounded-full bg-slate-800", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 transition-[width]", style: { width: `${preset.progress}%` } }) })] }, preset.id))) }), renderStatus && (_jsx("div", { className: "rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300", children: renderStatus })), downloads && downloads.length > 0 && (_jsxs("div", { className: "rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-4", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-emerald-200/80", children: "Downloads" }), _jsx("ul", { className: "mt-3 space-y-2 text-sm", children: downloads.map((d) => (_jsxs("li", { className: "flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 p-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-white", children: labelFor(d.presetId) }), _jsxs("p", { className: "text-xs text-slate-400", children: ["Expires ", new Date(d.expiresAt).toLocaleString()] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(DownloadButton, { url: d.url, filename: `hype-${d.presetId}.mp4` }), onDeleteExport && (_jsx("button", { type: "button", onClick: () => {
                                                if (confirm(`Delete export ${labelFor(d.presetId)}?`))
                                                    onDeleteExport(d.presetId);
                                            }, title: "Delete export", className: "rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20", children: "Delete" }))] })] }, d.presetId))) })] }))] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rounded-lg border border-white/10 bg-slate-950/60 p-2", children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.18em] text-slate-500", children: label }), _jsx("p", { className: "mt-1 text-xs font-semibold text-slate-100", children: value })] }));
}
function SystemHealthLink() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState();
    const load = async () => {
        setBusy(true);
        setErr(undefined);
        try {
            const r = await api.getConfigHealth();
            setData(r);
            setOpen(true);
        }
        catch (e) {
            setErr(e?.message || 'Failed to load system health');
            setOpen(true);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "text-xs", children: [_jsx("button", { type: "button", onClick: load, disabled: busy, className: "rounded-full border border-white/15 bg-slate-950/60 px-3 py-1 font-semibold text-slate-300 hover:border-white/30 disabled:opacity-50", children: busy ? 'Checking…' : 'System Health' }), open && (_jsxs("div", { className: "mt-2 rounded-xl border border-white/10 bg-slate-950/80 p-3", children: [err ? (_jsx("p", { className: "text-red-300", children: err })) : data ? (_jsxs("ul", { className: "grid grid-cols-2 gap-x-4 gap-y-1", children: [_jsx(HealthRow, { label: "Redis (Upstash)", ok: data.hasRedis, required: true }), _jsx(HealthRow, { label: "GPU Worker (Modal)", ok: data.hasGpuWorker, required: true }), _jsx(HealthRow, { label: "Storage (Cloudflare R2)", ok: data.hasStorage, required: true }), _jsx(HealthRow, { label: "HMAC Secret", ok: data.hasHmacSecret, required: true }), _jsx(HealthRow, { label: "OpenAI", ok: data.hasOpenAi }), _jsx(HealthRow, { label: "Music API", ok: data.hasMusicApi }), _jsx(HealthRow, { label: "Logtail", ok: data.hasLogtail })] })) : null, data && !data.ok && (_jsx("p", { className: "mt-2 text-amber-200", children: "One or more required services are not configured. Renders will fail until these are set." }))] }))] }));
}
function HealthRow({ label, ok, required }) {
    return (_jsxs("li", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: required ? 'font-semibold text-slate-100' : 'text-slate-400', children: label }), _jsx("span", { className: ok ? 'text-emerald-300' : required ? 'text-red-300' : 'text-slate-500', children: ok ? '✓' : required ? '✗ missing' : '— optional' })] }));
}
// Cross-origin downloads can't rely on the HTML `download` attribute (browsers
// ignore it for non-same-origin URLs). Fetch the blob and trigger a synthetic
// download from a same-origin object URL — guaranteed to save, no inline play.
function DownloadButton({ url, filename }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState();
    const onClick = async () => {
        setErr(undefined);
        setBusy(true);
        try {
            const res = await fetch(url);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objUrl);
        }
        catch (e) {
            setErr(e?.message || 'Download failed');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsx("button", { type: "button", onClick: onClick, disabled: busy, title: err || 'Save MP4 to your computer', className: "rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60", children: busy ? 'Downloading…' : err ? 'Retry' : 'Download' }));
}
