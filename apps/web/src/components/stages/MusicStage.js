import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function MusicStage({ tracks, selectedTrackId, onSelect, onLock }) {
    return (_jsxs("section", { className: "space-y-6", children: [_jsxs("header", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold text-white", children: "Music Intelligence" }), _jsx("p", { className: "text-sm text-slate-400", children: "Auto-ranked by BPM, energy, and stylistic fit. Choose the vibe or let One-Click Hype do it for you." })] }), selectedTrackId ? (_jsx("button", { type: "button", onClick: () => onLock(selectedTrackId), className: "rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20", children: "Lock Track & Continue" })) : (_jsx("span", { className: "rounded-full border border-slate-700 bg-slate-900/60 px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-slate-500", children: "Select a track to continue" }))] }), _jsx("div", { className: "space-y-4", children: tracks.map((track) => {
                    const isSelected = track.id === selectedTrackId;
                    return (_jsxs("button", { type: "button", onClick: () => onSelect(track.id), className: `w-full rounded-3xl border px-5 py-4 text-left transition focus-visible:outline focus-visible:outline-2 ${isSelected
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100 shadow-lg shadow-emerald-500/10'
                            : 'border-white/10 bg-slate-900/60 text-slate-200 hover:border-indigo-400/40 hover:bg-indigo-500/10'}`, children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: `text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-100'}`, children: track.title }), _jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-400", children: track.artist })] }), _jsxs("div", { className: "flex gap-4 text-xs uppercase tracking-[0.16em] text-slate-400", children: [_jsx(InfoPill, { label: "BPM", value: track.bpm }), _jsx(InfoPill, { label: "Mood", value: track.mood }), _jsx(InfoPill, { label: "Key", value: track.key }), _jsx(InfoPill, { label: "Match", value: `${track.matchScore}%` })] })] }), _jsxs("div", { className: "mt-4 flex items-center gap-3", children: [_jsx(Waveform, { waveform: track.waveform, active: isSelected }), _jsxs("div", { className: "text-xs text-slate-400", children: [_jsx("p", { className: "font-medium text-slate-200", children: "Energy Meter" }), _jsx(EnergyMeter, { value: track.energyLevel })] })] })] }, track.id));
                }) })] }));
}
function InfoPill({ label, value }) {
    return (_jsxs("span", { className: "rounded-full border border-white/10 bg-slate-900/80 px-3 py-0.5 text-[11px] text-slate-400", children: [_jsx("span", { className: "mr-2 text-slate-500", children: label }), _jsx("span", { className: "text-slate-200", children: value })] }));
}
function Waveform({ waveform, active }) {
    return (_jsx("div", { className: "flex h-16 flex-1 items-end gap-[3px] overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 p-3", children: waveform.map((value, index) => (_jsx("div", { className: `w-full rounded-full ${active
                ? 'bg-gradient-to-t from-emerald-400/30 via-indigo-400/70 to-white'
                : 'bg-gradient-to-t from-indigo-500/10 via-indigo-500/30 to-indigo-100/60'}`, style: { height: `${25 + value * 70}%` } }, `${index}-${value}`))) }));
}
function EnergyMeter({ value }) {
    return (_jsx("div", { className: "mt-1 flex h-2 w-40 overflow-hidden rounded-full bg-slate-800", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400", style: { width: `${Math.min(100, value)}%` } }) }));
}
