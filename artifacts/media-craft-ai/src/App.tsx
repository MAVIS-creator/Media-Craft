import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, Archive, ArrowDownToLine, AudioLines, Check, ChevronDown, Clapperboard, Cloud, Film, Gauge, History, Loader2, Menu, Mic2, MoreHorizontal, Play, RefreshCw, RotateCcw, Scissors, Settings2, Sparkles, Terminal, UploadCloud, WandSparkles, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetMediaJobQueryKey, getHealthCheckQueryKey, MediaJobInputPreset, MediaJobStatus, type MediaJob, useCreateMediaJob, useDownloadMediaJobOutput, useGetMediaJob, useHealthCheck, useStreamMediaJobEvents } from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Preset = typeof MediaJobInputPreset[keyof typeof MediaJobInputPreset];
type Job = MediaJob | undefined;
type ThemeMode = 'light' | 'dark' | 'system';

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

function Sidebar({ onNew }: { onNew: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const content = <div className="flex h-full flex-col px-4 py-5">
    <div className="mb-10 flex items-center justify-between"><Logo /><button className="md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
    <nav className="space-y-1" aria-label="Primary navigation">
      <button className="group flex w-full items-center gap-3 rounded-xl bg-[#172551] px-3 py-3 text-left text-[13px] font-semibold text-[#fdf7da] shadow-[inset_3px_0_#f6d640]" data-testid="button-nav-workspace"><Zap size={16} className="text-[#f6d640]" />Workspace<span className="ml-auto rounded bg-[#f6d640] px-1.5 py-0.5 font-mono text-[9px] text-[#172551]">01</span></button>
      <button className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] text-[#606a80] transition-colors hover:bg-[#e7e4d8] hover:text-[#172551]" data-testid="button-nav-history"><History size={16} />Recent jobs</button>
      <button className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] text-[#606a80] transition-colors hover:bg-[#e7e4d8] hover:text-[#172551]" data-testid="button-nav-archive"><Archive size={16} />Archive</button>
    </nav>
    <div className="mt-auto">
      <div className="mb-5 rounded-xl border border-[#d7d2c0] bg-[#ece9de] p-3"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold"><Cloud size={14} className="text-[#1671d9]" />Cloud storage</div><div className="mb-2 h-1 rounded-full bg-[#d4d0c2]"><div className="h-1 w-[38%] rounded-full bg-[#1671d9]" /></div><div className="flex justify-between font-mono text-[9px] text-[#788095]"><span>1.9 GB used</span><span>5 GB</span></div></div>
      <button onClick={onNew} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6d640] py-3 text-[12px] font-bold text-[#172551] shadow-[0_3px_0_#c9a919] transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-new-job"><Sparkles size={14} />New job</button>
      <div className="flex items-center gap-2 border-t border-[#d7d2c0] pt-4"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1671d9] font-display text-[11px] font-bold text-white">AK</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">Ari Kwon</div><div className="font-mono text-[9px] text-muted-foreground">editor / director</div></div><Settings2 size={15} className="text-[#81889a]" /></div>
    </div>
  </div>;
  return <><aside className="hidden w-[232px] shrink-0 border-r border-[#d7d2c0] bg-[#f4f1e7] md:block">{content}</aside><button className="fixed left-4 top-4 z-20 rounded-lg bg-[#172551] p-2 text-[#fdf7da] md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={18} /></button>{mobileOpen && <div className="fixed inset-0 z-40 md:hidden"><button className="absolute inset-0 bg-[#172551]/35" onClick={() => setMobileOpen(false)} data-testid="button-dismiss-menu" /><aside className="relative h-full w-[260px] bg-[#f4f1e7] shadow-xl">{content}</aside></div>}</>;
}

function Header({ health, themeMode, onThemeChange }: { health?: string; themeMode: ThemeMode; onThemeChange: (mode: ThemeMode) => void }) {
  return <header className="flex h-[73px] items-center justify-between border-b border-[#d7d2c0] px-5 sm:px-8"><div className="pl-9 md:pl-0"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-[#81889a]">Project / Untitled session</div><div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#26355f]"><span className="h-1.5 w-1.5 rounded-full bg-[#4d9a59]" />{health === 'ok' ? 'Engine online' : 'Checking engine'}<span className="font-mono text-[9px] font-normal text-[#969cad]">· local render node 01</span></div></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden items-center gap-2 rounded-lg border border-[#d7d2c0] bg-[#f8f6ed] px-2.5 py-1.5 font-mono text-[9px] text-[#7b8498] sm:flex"><Terminal size={12} />⌘ K <span className="text-[#afb3bb]">command palette</span></div><label className="flex items-center gap-2 rounded-lg border border-[#d7d2c0] bg-[#f8f6ed] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[#7b8498]" title="Choose appearance"><span className="hidden sm:inline">Theme</span><select value={themeMode} onChange={(event) => onThemeChange(event.target.value as ThemeMode)} className="bg-transparent font-mono text-[9px] uppercase outline-none" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button className="rounded-lg p-2 text-[#70798e] hover:bg-[#e7e4d8]" data-testid="button-header-settings"><Settings2 size={17} /></button></div></header>;
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
  return <div className="overflow-hidden rounded-2xl border border-[#d7d2c0] bg-[#172551]" data-testid="panel-output-preview"><div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#22335f]"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(135deg, #1671d9 0 18%, transparent 18% 44%, #f6d640 44% 63%, transparent 63%)' }} /><div className="scan-glow absolute left-0 right-0 top-0 h-12 bg-[#fdf7da]/10 blur-xl" /><button onClick={() => job.outputUrl && window.open(job.outputUrl, '_blank', 'noopener,noreferrer')} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#f6d640] text-[#172551] shadow-lg transition-transform hover:scale-105" data-testid="button-preview-output"><Play size={19} fill="currentColor" /></button><div className="absolute bottom-3 left-3 font-mono text-[9px] text-[#d9e3ff]">OUTPUT / {job.outputMimeType ?? 'MEDIA'}</div></div><div className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#fdf7da]" data-testid="text-output-filename">{job.outputFilename ?? 'finished-output'}</div><div className="mt-1 font-mono text-[9px] text-[#9aa9d1]">Render complete · attempt {job.attempt}</div></div><button onClick={download} disabled={output.isLoading} className="flex shrink-0 items-center gap-2 rounded-lg bg-[#f6d640] px-3 py-2 text-[11px] font-bold text-[#172551] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-download-output">{output.isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}Download</button></div></div>;
}

function Dashboard() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const createJob = useCreateMediaJob();
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<Preset>('vertical-reel');
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState('');
  const [notice, setNotice] = useState('');
  const jobQuery = useGetMediaJob(jobId, { query: { queryKey: getGetMediaJobQueryKey(jobId), enabled: !!jobId, refetchInterval: (query) => { const data = query.state.data; return data && (data.status === MediaJobStatus.succeeded || data.status === MediaJobStatus.failed) ? false : 2500; } } });
  const job = jobQuery.data;
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
  const submit = () => { if (!file) { setNotice('Choose a source file first.'); return; } setNotice(''); createJob.mutate({ data: { file, preset, prompt: prompt.trim() || undefined } }, { onSuccess: (created) => setJobId(created.id), onError: () => setNotice('Upload could not start. Check the file and try again.') }); };
  const reset = () => { setFile(null); setPrompt(''); setJobId(''); setNotice(''); setPreset('vertical-reel'); };
  return <div className="grain flex min-h-[100dvh] bg-[#eeece2] text-[#26355f]"><Sidebar onNew={reset} /><main className="min-w-0 flex-1"><Header health={health.data?.status} themeMode={themeMode} onThemeChange={setThemeMode} /><div className="mx-auto max-w-[1420px] px-5 py-7 sm:px-8 lg:px-11"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="animate-rise"><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[#1671d9]"><span className="h-px w-5 bg-[#1671d9]" />Media lab / 01</div><h1 className="font-display text-[clamp(30px,4vw,49px)] font-bold leading-[.98] tracking-[-.065em] text-[#172551]">Make the next cut<br /><span className="text-[#1671d9]">feel inevitable.</span></h1></div><div className="max-w-[260px] animate-rise animate-rise-1 text-[11px] leading-relaxed text-[#737d91] sm:text-right">A focused room for the messy middle between raw footage and the moment it clicks.</div></div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(350px,.84fr)]"><section className="animate-rise animate-rise-2 space-y-5"><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#81889a]">Source media</div><h2 className="mt-1 font-display text-[19px] font-bold tracking-[-.04em]">Give it something to work with.</h2></div><div className="hidden rounded-lg bg-[#e7e4d8] p-2 text-[#7e8799] sm:block"><Film size={17} /></div></div><UploadZone file={file} onFile={(next) => { setFile(next); setNotice(''); }} onClear={() => setFile(null)} /></div><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5 sm:p-6"><PresetPicker selected={preset} onSelect={setPreset} />{isCustom && <div className="mt-5 animate-rise"><label htmlFor="prompt" className="mb-2 flex items-center justify-between font-display text-[13px] font-bold text-[#26355f]"><span>Tell the engine what you see</span><span className="font-mono text-[9px] font-normal uppercase tracking-[.12em] text-[#9299a7]">02 / describe</span></label><textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Pull the strongest 30 seconds, keep room tone, add a gentle fade out…" className="min-h-[92px] w-full resize-none rounded-xl border border-[#d7d2c0] bg-[#fdfbf3] p-3 text-[12px] leading-relaxed outline-none transition-colors placeholder:text-[#adb1b8] focus:border-[#1671d9] focus:ring-2 focus:ring-[#1671d9]/10" data-testid="textarea-processing-prompt" /></div>}<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={submit} disabled={createJob.isPending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1671d9] py-3.5 text-[12px] font-bold text-white shadow-[0_3px_0_#0d4b97] transition-all hover:-translate-y-0.5 hover:bg-[#1266c4] active:translate-y-0 disabled:cursor-wait disabled:opacity-70" data-testid="button-start-processing">{createJob.isPending ? <><Loader2 size={15} className="animate-spin" />Uploading source…</> : <><Zap size={15} />Start processing</>}</button><div className="flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[#9299a7]"><Sparkles size={12} className="text-[#c5a900]" />safe fallback enabled</div></div>{notice && <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#fff0b4] px-3 py-2 text-[10px] text-[#735e00]" data-testid="status-upload-notice"><AlertTriangle size={13} />{notice}</div>}</div></section><section className="animate-rise animate-rise-3 space-y-5">{job ? <><JobTimeline job={job} /><OutputPreview job={job} /></> : <><div className="rounded-2xl border border-[#d7d2c0] bg-[#172551] p-6 text-[#fdf7da]" data-testid="empty-pipeline-state"><div className="mb-10 flex items-center justify-between"><div className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9aa9d1]">Execution pipeline</div><MoreHorizontal size={17} className="text-[#6576a6]" /></div><div className="relative"><div className="absolute left-3.5 top-4 h-[calc(100%-12px)] w-px bg-[#3e4f82]" />{['Upload source', 'Select recipe', 'Render + recover', 'Review output'].map((item, index) => <div className="relative mb-6 flex items-center gap-4 last:mb-0" key={item}><div className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border ${index === 0 ? 'border-[#f6d640] bg-[#f6d640] text-[#172551]' : 'border-[#52618d] bg-[#243568] text-[#7586b7]'}`}>{index === 0 ? <UploadCloud size={13} /> : <span className="font-mono text-[9px]">0{index + 1}</span>}</div><div><div className={`text-[12px] font-semibold ${index === 0 ? 'text-[#fdf7da]' : 'text-[#8493bb]'}`}>{item}</div>{index === 2 && <div className="mt-1 font-mono text-[9px] text-[#6678ab]">automatic FFmpeg fallback</div>}</div></div>)}</div><div className="mt-9 border-t border-[#354675] pt-4 text-[10px] leading-relaxed text-[#9aa9d1]">Your pipeline will appear here once a job starts. We keep every attempt visible — including the weird ones.</div></div><div className="rounded-2xl border border-[#d7d2c0] bg-[#f8f6ed] p-5" data-testid="card-working-note"><div className="flex gap-3"><div className="rounded-lg bg-[#fff0b4] p-2 text-[#9b7d00]"><RotateCcw size={15} /></div><div><div className="text-[12px] font-bold text-[#26355f]">If FFmpeg gets difficult</div><p className="mt-1 text-[10px] leading-relaxed text-[#818a9e]">The engine will retry with a conservative profile. No need to babysit the render.</p></div></div></div></>}</section></div><footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#d7d2c0] pt-4 font-mono text-[9px] uppercase tracking-[.13em] text-[#9a9fa9] sm:flex-row"><span>MediaCraft AI / filmmaker tools</span><span>Built for the long render</span></footer></div></main></div>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Dashboard} /><Route component={() => <div className="flex min-h-screen items-center justify-center bg-[#eeece2] font-display text-[#172551]">Page not found</div>} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;