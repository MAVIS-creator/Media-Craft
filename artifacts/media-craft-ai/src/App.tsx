import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, Archive, ArrowDownToLine, AudioLines, Check, ChevronDown, Clapperboard, Cloud, Film, Gauge, History, Loader2, Menu, Mic2, MoreHorizontal, Play, RefreshCw, RotateCcw, Scissors, Search, Settings2, Sparkles, Terminal, UploadCloud, WandSparkles, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetMediaJobQueryKey, getHealthCheckQueryKey, getListMediaJobsQueryKey, MediaJobInputPreset, MediaJobStatus, type MediaJob, useCreateMediaJob, useDownloadMediaJobOutput, useGetMediaJob, useHealthCheck, useListMediaJobs, useStreamMediaJobEvents } from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Preset = typeof MediaJobInputPreset[keyof typeof MediaJobInputPreset];
type Job = MediaJob | undefined;
type ThemeMode = 'light' | 'dark' | 'system';
type AppView = 'workspace' | 'recent' | 'archive';

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem('mediacraft-theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

const presets: { key: Preset; label: string; detail: string; icon: typeof Film }[] = [
  { key: 'vertical-reel', label: 'Vertical reel', detail: '9:16 social cut', icon: Scissors },
  { key: 'extract-audio', label: 'Extract audio', detail: 'WAV · 48 kHz', icon: AudioLines },
  { key: 'burn-subtitles', label: 'Burn subtitles', detail: 'Open captions', icon: Mic2 },
  { key: 'compress-video', label: 'Compress video', detail: 'Web-ready H.264', icon: Gauge },
  { key: 'custom', label: 'Describe it', detail: 'Natural language', icon: WandSparkles },
];

function Logo() {
  return <div className="flex items-center gap-3" data-testid="brand-logo">
    <div className="relative flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#f6d640] text-[#1e2c57] shadow-[3px_3px_0_#1e2c57]">
      <Clapperboard size={19} strokeWidth={2.6} />
      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#1671d9]" />
    </div>
    <div className="leading-none"><div className="font-display text-[17px] font-bold tracking-[-.04em]">MediaCraft</div><div className="mt-1 font-mono text-[8px] uppercase tracking-[.22em] text-muted-foreground">post / production</div></div>
  </div>;
}

function StatusPill({ status }: { status?: string }) {
  const config: Record<string, { label: string; cls: string; dot: string }> = {
    queued: { label: 'Queued', cls: 'bg-[#e7e4d8] text-[#697087]', dot: 'bg-[#969cad]' },
    processing: { label: 'Processing', cls: 'bg-[#dceaff] text-[#1261b7]', dot: 'bg-[#1671d9]' },
    healing: { label: 'Self-healing', cls: 'bg-[#fff0b4] text-[#816700]', dot: 'bg-[#d3a900]' },
    succeeded: { label: 'Ready', cls: 'bg-[#dcf2db] text-[#32753e]', dot: 'bg-[#4d9a59]' },
    failed: { label: 'Failed', cls: 'bg-[#f8ded9] text-[#a04439]', dot: 'bg-[#c75a4c]' },
  };
  const item = config[status ?? 'queued'] ?? config.queued;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.08em] ${item.cls}`} data-testid={`status-${status ?? 'queued'}`}><i className={`status-dot h-1.5 w-1.5 rounded-full ${item.dot}`} />{item.label}</span>;
}

function SettingsPanel({ themeMode, onThemeChange, onClose }: { themeMode: ThemeMode; onThemeChange: (mode: ThemeMode) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-start justify-end bg-[#172551]/25 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="w-full max-w-[390px] rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 shadow-2xl animate-rise"><div className="flex items-start justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#81889a]">Preferences</div><h2 id="settings-title" className="mt-1 font-display text-[21px] font-bold tracking-[-.04em] text-[#26355f]">Settings</h2></div><button onClick={onClose} className="rounded-lg p-2 text-[#81889a] hover:bg-[#e7e4d8]" aria-label="Close settings"><X size={17} /></button></div><div className="mt-6 space-y-4"><label className="block"><span className="font-display text-[12px] font-bold text-[#26355f]">Appearance</span><span className="mt-1 block text-[10px] text-[#818a9e]">Choose how MediaCraft should look in this browser.</span><select value={themeMode} onChange={(event) => onThemeChange(event.target.value as ThemeMode)} className="mt-3 w-full rounded-xl border border-[#d7d2c0] bg-[#fdfbf3] px-3 py-2.5 text-[12px] text-[#26355f] outline-none focus:border-[#1671d9]" aria-label="Appearance mode"><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label><div className="rounded-xl border border-[#d7d2c0] bg-[#efede4] p-3"><div className="flex items-center gap-2 text-[11px] font-bold text-[#26355f]"><Sparkles size={14} className="text-[#c5a900]" />AI processing</div><p className="mt-1 text-[10px] leading-relaxed text-[#818a9e]">Gemini plans FFmpeg arguments and receives raw FFmpeg errors for bounded repair attempts.</p></div><div className="rounded-xl border border-[#d7d2c0] bg-[#efede4] p-3"><div className="flex items-center gap-2 text-[11px] font-bold text-[#26355f]"><Check size={14} className="text-[#4d9a59]" />Media validation</div><p className="mt-1 text-[10px] leading-relaxed text-[#818a9e]">Uploads are inspected with ffprobe for duration, codecs, and usable audio/video streams before processing.</p></div></div><button onClick={onClose} className="mt-6 w-full rounded-xl bg-[#172551] py-3 text-[11px] font-bold text-[#fdf7da]">Done</button></section></div>;
}

function CommandPalette({ onClose, onNavigate, onNew, onSettings }: { onClose: () => void; onNavigate: (view: AppView) => void; onNew: () => void; onSettings: () => void }) {
  const [searchText, setSearchText] = useState('');
  const commands = [
    { label: 'New processing job', detail: 'Clear the workspace and upload a source', icon: Sparkles, action: onNew },
    { label: 'Open recent jobs', detail: 'See every job in this session', icon: History, action: () => onNavigate('recent') },
    { label: 'Open archive', detail: 'Review completed and failed renders', icon: Archive, action: () => onNavigate('archive') },
    { label: 'Open settings', detail: 'Change appearance and processing notes', icon: Settings2, action: onSettings },
  ];
  const filtered = commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(searchText.toLowerCase()));
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#172551]/30 px-4 pt-[12vh] backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="command-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="w-full max-w-[570px] overflow-hidden rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] shadow-2xl animate-rise"><div className="flex items-center gap-3 border-b border-[#d7d2c0] px-4"><Search size={17} className="text-[#81889a]" /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }} placeholder="Search commands…" className="h-14 min-w-0 flex-1 bg-transparent text-[13px] text-[#26355f] outline-none placeholder:text-[#9299a7]" aria-label="Search commands" /><kbd className="rounded bg-[#e7e4d8] px-2 py-1 font-mono text-[9px] text-[#81889a]">ESC</kbd></div><div id="command-title" className="px-4 pt-4 font-mono text-[9px] uppercase tracking-[.18em] text-[#81889a]">Command palette</div><div className="p-2">{filtered.length ? filtered.map((command) => { const Icon = command.icon; return <button key={command.label} onClick={() => { command.action(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#e7f0fc]"><span className="rounded-lg bg-[#e7e4d8] p-2 text-[#1671d9]"><Icon size={15} /></span><span className="min-w-0"><span className="block text-[12px] font-bold text-[#26355f]">{command.label}</span><span className="mt-0.5 block text-[10px] text-[#818a9e]">{command.detail}</span></span><ChevronDown size={14} className="ml-auto -rotate-90 text-[#a1a6b0]" /></button>; }) : <div className="px-3 py-8 text-center text-[11px] text-[#818a9e]">No matching commands.</div>}</div></section></div>;
}

function Sidebar({ activeView, onNavigate, onNew, onSettings }: { activeView: AppView; onNavigate: (view: AppView) => void; onNew: () => void; onSettings: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = (view: AppView) => { onNavigate(view); setMobileOpen(false); };
  const content = <div className="flex h-full flex-col px-4 py-5">
    <div className="mb-10 flex items-center justify-between"><Logo /><button className="md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
    <nav className="space-y-1" aria-label="Primary navigation">
      <button onClick={() => navigate('workspace')} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold ${activeView === 'workspace' ? 'bg-[#172551] text-[#fdf7da] shadow-[inset_3px_0_#f6d640]' : 'text-[#606a80] hover:bg-[#e7e4d8] hover:text-[#172551]'}`} data-testid="button-nav-workspace"><Zap size={16} className={activeView === 'workspace' ? 'text-[#f6d640]' : ''} />Workspace<span className="ml-auto rounded bg-[#f6d640] px-1.5 py-0.5 font-mono text-[9px] text-[#172551]">01</span></button>
      <button onClick={() => navigate('recent')} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-colors ${activeView === 'recent' ? 'bg-[#e7e4d8] font-semibold text-[#172551]' : 'text-[#606a80] hover:bg-[#e7e4d8] hover:text-[#172551]'}`} data-testid="button-nav-history"><History size={16} />Recent jobs</button>
      <button onClick={() => navigate('archive')} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-colors ${activeView === 'archive' ? 'bg-[#e7e4d8] font-semibold text-[#172551]' : 'text-[#606a80] hover:bg-[#e7e4d8] hover:text-[#172551]'}`} data-testid="button-nav-archive"><Archive size={16} />Archive</button>
    </nav>
    <div className="mt-auto">
      <div className="mb-5 rounded-xl border border-[#d7d2c0] bg-[#ece9de] p-3"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold"><Cloud size={14} className="text-[#1671d9]" />Cloud storage</div><div className="mb-2 h-1 rounded-full bg-[#d4d0c2]"><div className="h-1 w-[38%] rounded-full bg-[#1671d9]" /></div><div className="flex justify-between font-mono text-[9px] text-[#788095]"><span>1.9 GB used</span><span>5 GB</span></div></div>
      <button onClick={onNew} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6d640] py-3 text-[12px] font-bold text-[#172551] shadow-[0_3px_0_#c9a919] transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-new-job"><Sparkles size={14} />New job</button>
       <button onClick={onSettings} className="flex w-full items-center gap-2 border-t border-[#d7d2c0] pt-4 text-left" data-testid="button-sidebar-settings"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1671d9] font-display text-[11px] font-bold text-white">AK</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">Ari Kwon</div><div className="font-mono text-[9px] text-muted-foreground">editor / director</div></div><Settings2 size={15} className="text-[#81889a]" /></button>
    </div>
  </div>;
  return <><aside className="hidden w-[232px] shrink-0 border-r border-[#d7d2c0] bg-[#f4f1e7] md:block">{content}</aside><button className="fixed left-4 top-4 z-20 rounded-lg bg-[#172551] p-2 text-[#fdf7da] md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={18} /></button>{mobileOpen && <div className="fixed inset-0 z-40 md:hidden"><button className="absolute inset-0 bg-[#172551]/35" onClick={() => setMobileOpen(false)} data-testid="button-dismiss-menu" /><aside className="relative h-full w-[260px] bg-[#f4f1e7] shadow-xl">{content}</aside></div>}</>;
}

function Header({ health, themeMode, onThemeChange, onOpenCommand, onOpenSettings }: { health?: string; themeMode: ThemeMode; onThemeChange: (mode: ThemeMode) => void; onOpenCommand: () => void; onOpenSettings: () => void }) {
  return <header className="flex h-[73px] items-center justify-between border-b border-[#d7d2c0] px-5 sm:px-8"><div className="pl-9 md:pl-0"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-[#81889a]">Project / Untitled session</div><div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#26355f]"><span className="h-1.5 w-1.5 rounded-full bg-[#4d9a59]" />{health === 'ok' ? 'Engine online' : 'Checking engine'}<span className="font-mono text-[9px] font-normal text-[#969cad]">· local render node 01</span></div></div><div className="flex items-center gap-2 sm:gap-3"><button onClick={onOpenCommand} className="hidden items-center gap-2 rounded-lg border border-[#d7d2c0] bg-[#f8f6ed] px-2.5 py-1.5 font-mono text-[9px] text-[#7b8498] hover:border-[#1671d9] sm:flex" data-testid="button-command-palette"><Terminal size={12} />⌘ K <span className="text-[#afb3bb]">command palette</span></button><label className="flex items-center gap-2 rounded-lg border border-[#d7d2c0] bg-[#f8f6ed] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[#7b8498]" title="Choose appearance"><span className="hidden sm:inline">Theme</span><select value={themeMode} onChange={(event) => onThemeChange(event.target.value as ThemeMode)} className="bg-transparent font-mono text-[9px] uppercase outline-none" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button onClick={onOpenSettings} className="rounded-lg p-2 text-[#70798e] hover:bg-[#e7e4d8]" data-testid="button-header-settings" aria-label="Open settings"><Settings2 size={17} /></button></div></header>;
}

function UploadZone({ file, onFile, onClear }: { file: File | null; onFile: (file: File) => void; onClear: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accept = 'video/*,audio/*,.mxf,.mov,.mp4,.wav,.mp3';
  const pick = (event: ChangeEvent<HTMLInputElement>) => { const chosen = event.target.files?.[0]; if (chosen) onFile(chosen); };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); const chosen = event.dataTransfer.files?.[0]; if (chosen) onFile(chosen); };
  return <div className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${dragging ? 'border-[#1671d9] bg-[#e5effc]' : file ? 'border-[#6ba7e7] bg-[#e9f2fd]' : 'border-[#cfc9b8] bg-[#f8f6ed] hover:border-[#1671d9] hover:bg-[#f1f5fb]'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} data-testid="upload-dropzone">
    <input ref={inputRef} className="hidden" type="file" accept={accept} onChange={pick} data-testid="input-media-file" />
    {!file ? <button onClick={() => inputRef.current?.click()} className="flex min-h-[184px] w-full flex-col items-center justify-center px-5 text-center" data-testid="button-choose-file"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e1edfb] text-[#1671d9]"><UploadCloud size={23} strokeWidth={1.8} /></div><div className="font-display text-[15px] font-semibold text-[#26355f]">Drop a source file here</div><div className="mt-1.5 text-[11px] text-[#7e8799]">or <span className="font-semibold text-[#1671d9]">browse your files</span></div><div className="mt-4 font-mono text-[9px] uppercase tracking-[.1em] text-[#a1a6b0]">MOV · MP4 · MXF · WAV · MP3 · up to 4 GB</div></button> : <div className="flex min-h-[184px] items-center gap-4 px-5"><div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#172551] text-[#f6d640]"><Film size={25} /><div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#f6d640]" /></div><div className="min-w-0 flex-1"><StatusPill status="processing" /><div className="mt-2 truncate font-display text-[15px] font-semibold text-[#26355f]" data-testid="text-selected-filename">{file.name}</div><div className="mt-1 font-mono text-[10px] text-[#7e8799]">{(file.size / (1024 * 1024)).toFixed(1)} MB · {file.type || 'media asset'}</div></div><button onClick={onClear} className="self-start rounded-lg p-2 text-[#81889a] hover:bg-[#d9e8f8] hover:text-[#26355f]" data-testid="button-clear-file"><X size={16} /></button></div>}
  </div>;
}

function PresetPicker({ selected, onSelect }: { selected: Preset; onSelect: (preset: Preset) => void }) {
  return <div><div className="mb-3 flex items-center justify-between"><label className="font-display text-[13px] font-bold text-[#26355f]">Processing recipe</label><span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9299a7]">01 / choose</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{presets.map((preset) => { const Icon = preset.icon; const active = selected === preset.key; return <button key={preset.key} onClick={() => onSelect(preset.key)} className={`group relative rounded-xl border px-2 py-3 text-left transition-all ${active ? 'border-[#1671d9] bg-[#e7f0fc] shadow-[0_2px_0_#a9c8ed]' : 'border-[#d7d2c0] bg-[#f8f6ed] hover:-translate-y-0.5 hover:border-[#a8bddd]'}`} data-testid={`button-preset-${preset.key}`}><Icon size={16} className={active ? 'text-[#1671d9]' : 'text-[#7e8799]'} /><div className={`mt-2 text-[11px] font-semibold ${active ? 'text-[#145aaa]' : 'text-[#46506a]'}`}>{preset.label}</div><div className="mt-0.5 whitespace-nowrap font-mono text-[8px] text-[#969cad]">{preset.detail}</div>{active && <Check size={12} className="absolute right-2 top-2 text-[#1671d9]" />}</button>; })}</div></div>;
}

function JobTimeline({ job }: { job: NonNullable<Job> }) {
  const events = useStreamMediaJobEvents(job.id, { query: { queryKey: [`/api/media/jobs/${job.id}/events`], enabled: !!job.id, refetchInterval: job.status === MediaJobStatus.succeeded || job.status === MediaJobStatus.failed ? false : 3000 } });
  const eventText = events.data ? String(events.data) : '';
  const eventLines = eventText.split('\n').filter(Boolean);
  const healing = job.status === MediaJobStatus.healing || eventText.toLowerCase().includes('heal');
  const failed = job.status === MediaJobStatus.failed;
  const step = failed ? 2 : healing ? 2 : job.status === MediaJobStatus.succeeded ? 4 : job.status === MediaJobStatus.processing ? 2 : 1;
  const rows = [
    { label: 'Asset received', detail: 'Input validated and queued', icon: UploadCloud },
    { label: 'FFmpeg render', detail: healing ? 'Recovered from encoder fault' : 'Applying recipe to source', icon: Film },
    { label: 'Quality check', detail: 'Audio, frame and codec checks', icon: Check },
    { label: 'Output ready', detail: job.outputFilename ?? 'Waiting for render completion', icon: ArrowDownToLine },
  ];
  return <div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 sm:p-6" data-testid="panel-job-timeline"><div className="mb-6 flex items-start justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#81889a]">Execution pipeline</div><h2 className="mt-1 font-display text-[19px] font-bold tracking-[-.04em] text-[#26355f]">The quiet part, made visible.</h2></div><StatusPill status={job.status} /></div><div className="relative ml-1">{rows.map((row, index) => { const Icon = row.icon; const complete = index < step || (job.status === MediaJobStatus.succeeded && index <= 3); const current = index === step && job.status !== MediaJobStatus.succeeded && !failed; return <div className="relative flex gap-4 pb-6 last:pb-0" key={row.label}><div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${complete ? 'border-[#1671d9] bg-[#1671d9] text-white' : current ? 'border-[#f0c91d] bg-[#fff4bd] text-[#9a7a00]' : 'border-[#d7d2c0] bg-[#efede4] text-[#a4a9b3]'}`}>{current ? <Loader2 size={14} className="animate-spin" /> : complete ? <Icon size={14} /> : <span className="font-mono text-[10px]">{String(index + 1).padStart(2, '0')}</span>}</div>{index < rows.length - 1 && <div className={`absolute left-[15px] top-8 h-[calc(100%-18px)] w-px ${complete ? 'bg-[#7caee2]' : 'bg-[#ddd9ce]'}`} />}<div className="pt-1"><div className={`text-[12px] font-semibold ${complete || current ? 'text-[#26355f]' : 'text-[#9299a7]'}`}>{row.label}{current && <span className="ml-2 font-mono text-[9px] font-normal uppercase text-[#b19009]">live</span>}</div><div className="mt-1 text-[10px] text-[#8991a1]">{row.detail}</div></div></div>; })}</div>{(eventLines.length > 0 || healing || failed) && <div className={`mt-2 rounded-xl border p-3 ${failed ? 'border-[#e7b7ae] bg-[#fff1ed]' : 'border-[#ead99d] bg-[#fff8d9]'}`}><div className="flex gap-2"><AlertTriangle size={14} className={failed ? 'text-[#b34a3e]' : 'text-[#aa8700'} /><div className="text-[10px] leading-relaxed text-[#74633a]">{failed ? (job.error ?? 'The render stopped unexpectedly. Try again with the same recipe.') : 'Encoder hiccup detected. MediaCraft is rebuilding the render with a safe fallback — your source is untouched.'}</div></div></div>}</div>;
}

function OutputPreview({ job }: { job: NonNullable<Job> }) {
  const output = useDownloadMediaJobOutput(job.id, { query: { queryKey: [`/api/media/jobs/${job.id}/output`], enabled: job.status === MediaJobStatus.succeeded } });
  const download = () => { if (output.data instanceof Blob) { const href = URL.createObjectURL(output.data); const a = document.createElement('a'); a.href = href; a.download = job.outputFilename ?? 'mediacraft-output'; a.click(); URL.revokeObjectURL(href); } else if (job.outputUrl) window.open(job.outputUrl, '_blank', 'noopener,noreferrer'); };
  if (job.status !== MediaJobStatus.succeeded) return <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-[#d7d2c0] bg-[#172551] px-6 text-center text-[#fdf7da]" data-testid="empty-output-preview"><div className="mb-4 rounded-2xl border border-[#52618d] bg-[#243568] p-4"><Play size={22} className="text-[#f6d640]" /></div><div className="font-display text-[17px] font-semibold">Your output will land here</div><p className="mt-2 max-w-[230px] text-[11px] leading-relaxed text-[#aeb8d2]">Preview and download the finished cut when the pipeline signs off.</p><div className="mt-5 flex gap-1">{[0, 1, 2, 3, 4].map((n) => <span key={n} className="h-1 w-4 rounded-full bg-[#52618d]" />)}</div></div>;
  const isVideo = job.outputMimeType?.startsWith('video/');
  return <div className="overflow-hidden rounded-2xl border border-[#d7d2c0] bg-[#172551]" data-testid="panel-output-preview"><div className="relative overflow-hidden bg-[#22335f]">{isVideo ? <video controls playsInline preload="metadata" className="block aspect-video w-full object-contain" src={job.outputUrl ?? undefined} data-testid="video-output-preview"><track kind="captions" /></video> : <div className="flex aspect-video items-center justify-center"><AudioLines size={38} className="text-[#f6d640]" /></div>}<div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9px] text-[#d9e3ff]">OUTPUT / {job.outputMimeType ?? 'MEDIA'}</div></div><div className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#fdf7da]" data-testid="text-output-filename">{job.outputFilename ?? 'finished-output'}</div><div className="mt-1 font-mono text-[9px] text-[#9aa9d1]">Render complete · attempt {job.attempt}</div></div><button onClick={download} disabled={output.isLoading} className="flex shrink-0 items-center gap-2 rounded-lg bg-[#f6d640] px-3 py-2 text-[11px] font-bold text-[#172551] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-download-output">{output.isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}Download</button></div></div>;
}

function formatJobDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function JobListPanel({ view, jobs, isLoading, onSelect }: { view: 'recent' | 'archive'; jobs: MediaJob[] | undefined; isLoading: boolean; onSelect: (job: MediaJob) => void }) {
  const archive = view === 'archive';
  return <section className="animate-rise space-y-5" data-testid={`panel-${view}`}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#1671d9]"><span className="h-px w-5 bg-[#1671d9]" />Media lab / {archive ? '03' : '02'}</div><h1 className="font-display text-[clamp(30px,4vw,49px)] font-bold leading-[.98] tracking-[-.065em] text-[#172551]">{archive ? 'Archive the work.' : 'Recent work, kept close.'}</h1><p className="mt-3 max-w-[530px] text-[11px] leading-relaxed text-[#737d91]">{archive ? 'Completed and failed renders stay available for review in this session.' : 'Jump back into a live render or revisit the last source you sent through the room.'}</p></div><div className="rounded-lg border border-[#d7d2c0] bg-[#f8f6ed] px-3 py-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#81889a]">{jobs?.length ?? 0} {archive ? 'archived' : 'jobs'}</div>
    </div>
    <div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-4 sm:p-5">
      {isLoading ? <div className="flex items-center gap-3 px-2 py-10 text-[11px] text-[#818a9e]"><Loader2 size={16} className="animate-spin text-[#1671d9]" />Loading session history…</div> : jobs?.length ? <div className="space-y-2">{jobs.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="group flex w-full flex-col gap-3 rounded-xl border border-[#d7d2c0] bg-[#fdfbf3] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#8eb8e8] hover:shadow-[0_3px_0_#c6d9ef] sm:flex-row sm:items-center" data-testid={`job-card-${item.id}`}><div className="flex min-w-0 flex-1 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.status === 'succeeded' ? 'bg-[#dcf2db] text-[#32753e]' : item.status === 'failed' ? 'bg-[#f8ded9] text-[#a04439]' : 'bg-[#dceaff] text-[#1671d9]'}`}>{item.mediaInfo.hasVideo ? <Film size={18} /> : <AudioLines size={18} />}</div><div className="min-w-0"><div className="truncate text-[12px] font-bold text-[#26355f]">{item.filename}</div><div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[.06em] text-[#9299a7]"><span>{item.preset}</span><span>·</span><span>{formatDuration(item.mediaInfo.durationSeconds)}</span><span>·</span><span>{item.mediaInfo.videoCodec ?? item.mediaInfo.audioCodec ?? 'unknown codec'}</span></div></div></div><div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1"><StatusPill status={item.status} /><span className="font-mono text-[9px] text-[#9299a7]">{formatJobDate(item.createdAt)}</span></div><ChevronDown size={15} className="hidden -rotate-90 text-[#a1a6b0] transition-transform group-hover:translate-x-0.5 sm:block" /></button>)}</div> : <div className="px-4 py-12 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e7e4d8] text-[#81889a]">{archive ? <Archive size={21} /> : <History size={21} />}</div><div className="font-display text-[16px] font-bold text-[#26355f]">{archive ? 'Nothing archived yet.' : 'No recent jobs yet.'}</div><p className="mx-auto mt-2 max-w-[300px] text-[11px] leading-relaxed text-[#818a9e]">{archive ? 'Finished and failed renders will appear here after your first processing run.' : 'Start a job from Workspace and it will appear here while the pipeline runs.'}</p></div>}
    </div>
  </section>;
}

function Dashboard() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const createJob = useCreateMediaJob();
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [activeView, setActiveView] = useState<AppView>('workspace');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<Preset>('vertical-reel');
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState('');
  const [notice, setNotice] = useState('');
  const jobQuery = useGetMediaJob(jobId, { query: { queryKey: getGetMediaJobQueryKey(jobId), enabled: !!jobId, refetchInterval: (query) => { const data = query.state.data; return data && (data.status === MediaJobStatus.succeeded || data.status === MediaJobStatus.failed) ? false : 2500; } } });
  const job = jobQuery.data;
  const recentJobs = useListMediaJobs(undefined, { query: { queryKey: getListMediaJobsQueryKey(), refetchInterval: 4000 } });
  const archivedJobs = useListMediaJobs({ archive: true }, { query: { queryKey: getListMediaJobsQueryKey({ archive: true }), refetchInterval: 4000 } });
  const isCustom = preset === 'custom';
  useEffect(() => {
    window.localStorage.setItem('mediacraft-theme', themeMode);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = themeMode === 'dark' || (themeMode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.body.classList.toggle('theme-dark', dark);
    };
    applyTheme();
    if (themeMode === 'system') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    return undefined;
  }, [themeMode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const submit = () => { if (!file) { setNotice('Choose a source file first.'); return; } setActiveView('workspace'); setNotice(''); createJob.mutate({ data: { file, preset, prompt: prompt.trim() || undefined } }, { onSuccess: (created) => { setJobId(created.id); void recentJobs.refetch(); }, onError: (error) => { const message = error instanceof Error ? error.message : 'Upload could not start.'; setNotice(message.includes('Media inspection') ? message : `${message} Check the file and try again.`); } }); };
  const reset = () => { setFile(null); setPrompt(''); setJobId(''); setNotice(''); setPreset('vertical-reel'); setActiveView('workspace'); };
  const selectJob = (selected: MediaJob) => { setJobId(selected.id); setActiveView('workspace'); setNotice(''); };
  const openSettings = () => { setCommandOpen(false); setSettingsOpen(true); };
  return <div className="grain flex min-h-[100dvh] bg-[#eeece2] text-[#26355f]"><Sidebar activeView={activeView} onNavigate={setActiveView} onNew={reset} onSettings={openSettings} /><main className="min-w-0 flex-1"><Header health={health.data?.status} themeMode={themeMode} onThemeChange={setThemeMode} onOpenCommand={() => setCommandOpen(true)} onOpenSettings={openSettings} /><div className="mx-auto max-w-[1420px] px-5 py-7 sm:px-8 lg:px-11">{activeView === 'recent' || activeView === 'archive' ? <JobListPanel view={activeView} jobs={activeView === 'archive' ? archivedJobs.data : recentJobs.data} isLoading={activeView === 'archive' ? archivedJobs.isLoading : recentJobs.isLoading} onSelect={selectJob} /> : <><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="animate-rise"><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#1671d9]"><span className="h-px w-5 bg-[#1671d9]" />Media lab / 01</div><h1 className="font-display text-[clamp(30px,4vw,49px)] font-bold leading-[.98] tracking-[-.065em] text-[#172551]">Make the next cut<br /><span className="text-[#1671d9]">feel inevitable.</span></h1></div><div className="max-w-[260px] animate-rise animate-rise-1 text-[11px] leading-relaxed text-[#737d91] sm:text-right">A focused room for the messy middle between raw footage and the moment it clicks.</div></div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(350px,.84fr)]"><section className="animate-rise animate-rise-2 space-y-5"><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#81889a]">Source media</div><h2 className="mt-1 font-display text-[19px] font-bold tracking-[-.04em]">Give it something to work with.</h2></div><div className="hidden rounded-lg bg-[#e7e4d8] p-2 text-[#7e8799] sm:block"><Film size={17} /></div></div><UploadZone file={file} onFile={(next) => { setFile(next); setNotice(''); }} onClear={() => setFile(null)} /></div><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 sm:p-6"><PresetPicker selected={preset} onSelect={setPreset} />{isCustom && <div className="mt-5 animate-rise"><label htmlFor="prompt" className="mb-2 flex items-center justify-between font-display text-[13px] font-bold text-[#26355f]"><span>Tell the engine what you see</span><span className="font-mono text-[9px] font-normal uppercase tracking-[.12em] text-[#9299a7]">02 / describe</span></label><textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Pull the strongest 30 seconds, keep room tone, add a gentle fade out…" className="min-h-[92px] w-full resize-none rounded-xl border border-[#d7d2c0] bg-[#fdfbf3] p-3 text-[12px] leading-relaxed outline-none transition-colors placeholder:text-[#adb1b8] focus:border-[#1671d9] focus:ring-2 focus:ring-[#1671d9]/10" data-testid="textarea-processing-prompt" /></div>}<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={submit} disabled={createJob.isPending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1671d9] py-3.5 text-[12px] font-bold text-white shadow-[0_3px_0_#0d4b97] transition-all hover:-translate-y-0.5 hover:bg-[#1266c4] active:translate-y-0 disabled:cursor-wait disabled:opacity-70" data-testid="button-start-processing">{createJob.isPending ? <><Loader2 size={15} className="animate-spin" />Uploading source…</> : <><Zap size={15} />Start processing</>}</button><div className="flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[#9299a7]"><Sparkles size={12} className="text-[#c5a900]" />Gemini planner + repair</div></div>{notice && <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#fff0b4] px-3 py-2 text-[10px] text-[#735e00]" data-testid="status-upload-notice"><AlertTriangle size={13} />{notice}</div>}</div></section><section className="animate-rise animate-rise-3 space-y-5">{job ? <><JobTimeline job={job} /><OutputPreview job={job} /></> : <><div className="rounded-2xl border border-[#d7d2c0] bg-[#172551] p-6 text-[#fdf7da]" data-testid="empty-pipeline-state"><div className="mb-10 flex items-center justify-between"><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9aa9d1]">Execution pipeline</div><MoreHorizontal size={17} className="text-[#6576a6]" /></div><div className="relative"><div className="absolute left-3.5 top-4 h-[calc(100%-12px)] w-px bg-[#3e4f82]" />{['Upload source', 'Select recipe', 'Gemini plan + render', 'Review output'].map((item, index) => <div className="relative mb-6 flex items-center gap-4 last:mb-0" key={item}><div className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border ${index === 0 ? 'border-[#f6d640] bg-[#f6d640] text-[#172551]' : 'border-[#52618d] bg-[#243568] text-[#7586b7]'}`}>{index === 0 ? <UploadCloud size={13} /> : <span className="font-mono text-[9px]">0{index + 1}</span>}</div><div><div className={`text-[12px] font-semibold ${index === 0 ? 'text-[#fdf7da]' : 'text-[#8493bb]'}`}>{item}</div>{index === 2 && <div className="mt-1 font-mono text-[9px] text-[#6678ab]">Gemini argument repair on failure</div>}</div></div>)}</div><div className="mt-9 border-t border-[#354675] pt-4 text-[10px] leading-relaxed text-[#9aa9d1]">Your pipeline will appear here once a job starts. We keep every attempt visible — including the weird ones.</div></div><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5" data-testid="card-working-note"><div className="flex gap-3"><div className="rounded-lg bg-[#fff0b4] p-2 text-[#9b7d00]"><RotateCcw size={15} /></div><div><div className="text-[12px] font-bold text-[#26355f]">If FFmpeg gets difficult</div><p className="mt-1 text-[10px] leading-relaxed text-[#818a9e]">Gemini receives the raw FFmpeg error and rewrites the argument plan once.</p></div></div></div></>}</section></div><footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#d7d2c0] pt-4 font-mono text-[9px] uppercase tracking-[.13em] text-[#9a9fa9] sm:flex-row"><span>MediaCraft AI / filmmaker tools</span><span>Built for the long render</span></footer></div></main></div>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Dashboard} /><Route component={() => <div className="flex min-h-screen items-center justify-center bg-[#eeece2] font-display text-[#172551]">Page not found</div>} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;