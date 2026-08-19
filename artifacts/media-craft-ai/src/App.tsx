import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Cloud,
  Code2,
  Copy,
  ExternalLink,
  Film,
  Gauge,
  History,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Menu,
  Mic2,
  Play,
  RotateCcw,
  Scissors,
  Search,
  Send,
  Settings2,
  Share2,
  Sliders,
  Sparkles,
  Terminal,
  UploadCloud,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import {
  getGetMediaJobQueryKey,
  getHealthCheckQueryKey,
  getListMediaJobsQueryKey,
  MediaJobInputPreset,
  MediaJobStatus,
  type MediaJob,
  useCreateMediaJob,
  useDownloadMediaJobOutput,
  useGetMediaJob,
  useHealthCheck,
  useListMediaJobs,
  useStreamMediaJobEvents,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Preset = typeof MediaJobInputPreset[keyof typeof MediaJobInputPreset];
type ThemeMode = 'light' | 'dark' | 'system';
type AppView = 'workspace' | 'live' | 'presets' | 'recent' | 'archive';

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('mediacraft-theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
}

interface PresetDefinition {
  key: Preset;
  label: string;
  category: 'social' | 'audio' | 'captions' | 'compression' | 'custom';
  categoryLabel: string;
  detail: string;
  description: string;
  ffmpegPreview: string;
  icon: typeof Film;
  color: string;
}

const PRESET_CATALOG: PresetDefinition[] = [
  {
    key: 'vertical-reel',
    label: 'TikTok / Reel (9:16)',
    category: 'social',
    categoryLabel: 'Social Media',
    detail: '9:16 vertical reframe',
    description: 'Auto-reframes landscape video to 9:16 vertical aspect ratio, center-crops and preserves high-fidelity audio.',
    ffmpegPreview: '-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:v libx264 -preset fast -crf 23 -c:a copy',
    icon: Scissors,
    color: 'from-blue-600 to-indigo-600',
  },
  {
    key: 'extract-audio',
    label: 'Lossless Audio Extraction',
    category: 'audio',
    categoryLabel: 'Audio Extraction',
    detail: 'MP3 · 320 kbps · 48 kHz',
    description: 'Strips video streams and extracts master audio to pristine MP3 format with high-quality LAME encoding.',
    ffmpegPreview: '-vn -c:a libmp3lame -b:a 320k -ar 48000',
    icon: AudioLines,
    color: 'from-amber-500 to-yellow-600',
  },
  {
    key: 'burn-subtitles',
    label: 'Burn Subtitles & Captions',
    category: 'captions',
    categoryLabel: 'Open Captions',
    detail: 'Open captions overlay',
    description: 'Burns embedded or auto-generated caption tracks directly into video frames with clean cinema typography.',
    ffmpegPreview: '-vf "subtitles=source.srt:force_style=\'FontSize=22,PrimaryColour=&H00FFFFFF\'" -c:a copy',
    icon: Mic2,
    color: 'from-rose-500 to-red-600',
  },
  {
    key: 'compress-video',
    label: 'Web-Ready H.264 Compress',
    category: 'compression',
    categoryLabel: 'Video Encoding',
    detail: '4K/1080p web downscale',
    description: 'Lossless visual downscale to web-optimized H.264 MP4 with optimal streaming bitrate balance.',
    ffmpegPreview: '-c:v libx264 -crf 22 -preset medium -movflags +faststart -c:a aac -b:a 192k',
    icon: Gauge,
    color: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'custom',
    label: 'Natural Language Studio Macro',
    category: 'custom',
    categoryLabel: 'Custom Gemini AI',
    detail: 'Natural language prompt',
    description: 'Describe any creative edit or conversion. Gemini translates intent into a hardened FFmpeg argument array.',
    ffmpegPreview: 'Gemini 2.5 Flash dynamically plans filters, codecs, and arguments tailored to your input.',
    icon: WandSparkles,
    color: 'from-cyan-500 to-blue-600',
  },
];

function StatusPill({ status }: { status?: string }) {
  const config: Record<string, { label: string; cls: string; dot: string }> = {
    queued: { label: 'Queued', cls: 'bg-slate-800 text-slate-300 border-slate-700', dot: 'bg-slate-400' },
    processing: { label: 'Processing', cls: 'bg-blue-950/80 text-blue-300 border-blue-800', dot: 'bg-blue-400' },
    healing: { label: 'Self-healing', cls: 'bg-yellow-950/80 text-yellow-300 border-yellow-800', dot: 'bg-yellow-400' },
    succeeded: { label: 'Ready', cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-800', dot: 'bg-emerald-400' },
    failed: { label: 'Failed', cls: 'bg-rose-950/80 text-rose-300 border-rose-800', dot: 'bg-rose-400' },
  };
  const item = config[status ?? 'queued'] ?? config.queued;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border ${item.cls}`}
      data-testid={`status-${status ?? 'queued'}`}
    >
      <i className={`status-dot h-1.5 w-1.5 rounded-full ${item.dot}`} />
      {item.label}
    </span>
  );
}

function SettingsPanel({
  themeMode,
  onThemeChange,
  onClose,
}: {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-[400px] rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl animate-rise">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.2em] text-blue-400">Studio Preferences</div>
            <h2 id="settings-title" className="mt-1 font-display text-[22px] font-bold text-white">
              Settings
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="font-display text-[13px] font-bold text-slate-200">Appearance Mode</span>
            <span className="mt-1 block text-[11px] text-slate-400">Select interface tone for your editing suite.</span>
            <select
              value={themeMode}
              onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"
            >
              <option value="dark">Studio Dark (Recommended)</option>
              <option value="light">Editorial Light</option>
              <option value="system">System Default</option>
            </select>
          </label>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
            <div className="flex items-center gap-2 text-[12px] font-bold text-blue-300">
              <Sparkles size={15} className="text-yellow-400" />
              Gemini AI Engine
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Translates filmmaker instructions into robust FFmpeg arrays with self-healing syntax repair.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
            <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-300">
              <Check size={15} className="text-emerald-400" />
              Telemetry & Validation
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              FFprobe inspects stream duration and codecs. Telemetry logs gracefully in standalone mode.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-[12px] font-bold text-white shadow-lg hover:opacity-95"
        >
          Save & Return
        </button>
      </section>
    </div>
  );
}

function CommandPalette({
  onClose,
  onNavigate,
  onNew,
  onSettings,
}: {
  onClose: () => void;
  onNavigate: (view: AppView) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const [searchText, setSearchText] = useState('');
  const commands = [
    { label: 'New Processing Job', detail: 'Upload source media and start pipeline', icon: Sparkles, action: onNew },
    { label: 'Live Processing Studio', detail: 'View current render status and terminal log', icon: Zap, action: () => onNavigate('live') },
    { label: 'Presets Library', detail: 'Browse FFmpeg presets and command templates', icon: Sliders, action: () => onNavigate('presets') },
    { label: 'Recent Session Jobs', detail: 'View all renders from this session', icon: History, action: () => onNavigate('recent') },
    { label: 'Archived Renders', detail: 'Browse finished and failed jobs', icon: Archive, action: () => onNavigate('archive') },
    { label: 'Studio Settings', detail: 'Theme preferences and engine diagnostics', icon: Settings2, action: onSettings },
  ];

  const filtered = commands.filter((c) => `${c.label} ${c.detail}`.toLowerCase().includes(searchText.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-[580px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl animate-rise">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search commands, views, presets…"
            className="h-14 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded bg-slate-800 px-2 py-1 font-mono text-[10px] text-slate-400">ESC</kbd>
        </div>
        <div className="p-2">
          {filtered.length ? (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.label}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-800/80 transition-colors"
                >
                  <span className="rounded-lg bg-blue-950/60 p-2 text-blue-400">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-white">{cmd.label}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{cmd.detail}</span>
                  </span>
                  <ArrowRight size={14} className="text-slate-500" />
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-[12px] text-slate-400">No matching commands.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Sidebar({
  activeView,
  onNavigate,
  onNew,
  onSettings,
  health,
}: {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onNew: () => void;
  onSettings: () => void;
  health?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = (v: AppView) => {
    onNavigate(v);
    setMobileOpen(false);
  };

  const content = (
    <div className="flex h-full flex-col px-4 py-5 bg-slate-950 border-r border-slate-800/80 text-slate-200">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-yellow-400 text-white shadow-lg">
            <Clapperboard size={19} strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-display text-[17px] font-bold tracking-tight text-white">MediaCraft AI</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${health === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                {health === 'ok' ? 'FFmpeg Engine: Online' : 'Connecting Engine'}
              </span>
            </div>
          </div>
        </div>
        <button className="md:hidden text-slate-400" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <nav className="space-y-1.5" aria-label="Main Navigation">
        <button
          onClick={() => nav('workspace')}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition-all ${
            activeView === 'workspace'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Zap size={16} className={activeView === 'workspace' ? 'text-yellow-300' : ''} />
          Studio Workspace
        </button>

        <button
          onClick={() => nav('live')}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition-all ${
            activeView === 'live'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Film size={16} />
          Live Processing
        </button>

        <button
          onClick={() => nav('presets')}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition-all ${
            activeView === 'presets'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Sliders size={16} />
          Presets Library
        </button>

        <button
          onClick={() => nav('recent')}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition-all ${
            activeView === 'recent'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <History size={16} />
          Recent Jobs
        </button>

        <button
          onClick={() => nav('archive')}
          className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition-all ${
            activeView === 'archive'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Archive size={16} />
          Archive
        </button>
      </nav>

      <div className="mt-auto pt-4">
        <button
          onClick={onNew}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-yellow-500 py-3 text-[12px] font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles size={15} />
          New Process
        </button>

        <button
          onClick={onSettings}
          className="flex w-full items-center gap-2.5 border-t border-slate-800 pt-4 text-left hover:opacity-90"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 font-display text-[12px] font-bold text-white shadow-md">
            MC
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-white">Film Suite Director</div>
            <div className="font-mono text-[9px] text-slate-400">Gemini 2.5 Flash</div>
          </div>
          <Settings2 size={16} className="text-slate-400" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[250px] shrink-0 md:block">{content}</aside>
      <button
        className="fixed left-4 top-4 z-30 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white shadow-lg md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[280px]">{content}</aside>
        </div>
      )}
    </>
  );
}

function Header({
  health,
  themeMode,
  onThemeChange,
  onOpenCommand,
  onOpenSettings,
  activeJobId,
}: {
  health?: string;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  activeJobId?: string;
}) {
  return (
    <header className="flex h-[68px] items-center justify-between border-b border-slate-800/80 bg-slate-950 px-5 sm:px-8">
      <div className="pl-12 md:pl-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[.18em] text-blue-400">Studio Session</span>
          {activeJobId && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-[9px] text-slate-300 border border-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Job #{activeJobId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] font-semibold text-white">
          <span className={`h-1.5 w-1.5 rounded-full ${health === 'ok' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
          {health === 'ok' ? 'FFmpeg Engine Online' : 'Engine Connecting'}
          <span className="hidden sm:inline font-mono text-[10px] font-normal text-slate-400">
            · Dual-Pass Gemini Repair · Grounded Spec Validation
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenCommand}
          className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[10px] text-slate-300 hover:border-blue-500 transition-colors"
        >
          <Terminal size={13} className="text-blue-400" />
          ⌘ K <span className="text-slate-500">palette</span>
        </button>

        <div className="hidden sm:flex bg-slate-900 rounded-xl p-1 border border-slate-800 items-center">
          <button
            onClick={() => onThemeChange('dark')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-colors ${
              themeMode === 'dark' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => onThemeChange('light')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase transition-colors ${
              themeMode === 'light' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Light
          </button>
        </div>

        <button
          onClick={onOpenSettings}
          className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white hover:border-slate-700"
          aria-label="Open settings"
        >
          <Settings2 size={17} />
        </button>
      </div>
    </header>
  );
}

function Dropzone({
  file,
  onFile,
  onClear,
}: {
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accept = 'video/*,audio/*,.mxf,.mov,.mp4,.wav,.mp3,.flac,.ogg';

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };

  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
        dragging
          ? 'border-blue-500 bg-blue-950/40 shadow-xl'
          : file
          ? 'border-blue-500/60 bg-slate-900/90 shadow-lg'
          : 'border-slate-700 bg-slate-900/50 hover:border-blue-500/70 hover:bg-slate-900/80'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <input ref={inputRef} className="hidden" type="file" accept={accept} onChange={pick} />

      {!file ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[220px] w-full flex-col items-center justify-center px-6 py-8 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl">
            <UploadCloud size={28} strokeWidth={2} />
          </div>
          <div className="font-display text-[18px] font-bold text-white">Drag & Drop Master Footage / Audio</div>
          <div className="mt-1 text-[12px] text-slate-400">
            or <span className="font-bold text-blue-400 underline decoration-blue-500/50">browse local files</span>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5 font-mono text-[9px] text-slate-400">
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">MP4</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">MOV</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">MXF</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">WAV</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">MP3</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 border border-slate-700">up to 4 GB</span>
          </div>
        </button>
      ) : (
        <div className="flex min-h-[200px] items-center gap-5 px-6 py-6">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-900 to-slate-900 border border-blue-500/40 text-yellow-400 shadow-xl">
            <Film size={34} />
          </div>
          <div className="min-w-0 flex-1">
            <StatusPill status="processing" />
            <div className="mt-2 truncate font-display text-[17px] font-bold text-white">{file.name}</div>
            <div className="mt-1 flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
              <span>·</span>
              <span>{file.type || 'media stream'}</span>
            </div>
          </div>
          <button
            onClick={onClear}
            className="self-start rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function LiveStudioView({
  job,
  onNavigateToPresets,
}: {
  job: NonNullable<MediaJob>;
  onNavigateToPresets: () => void;
}) {
  const events = useStreamMediaJobEvents(job.id, {
    query: {
      queryKey: [`/api/media/jobs/${job.id}/events`],
      enabled: !!job.id,
      refetchInterval:
        job.status === MediaJobStatus.succeeded || job.status === MediaJobStatus.failed ? false : 2000,
    },
  });

  const output = useDownloadMediaJobOutput(job.id, {
    query: {
      queryKey: [`/api/media/jobs/${job.id}/output`],
      enabled: job.status === MediaJobStatus.succeeded,
    },
  });

  const isVideo = job.outputMimeType?.startsWith('video/') || job.mediaInfo.hasVideo;
  const isSucceeded = job.status === MediaJobStatus.succeeded;
  const isHealing = job.status === MediaJobStatus.healing;
  const isFailed = job.status === MediaJobStatus.failed;

  const eventText = events.data ? String(events.data) : '';
  const eventLines = eventText.split('\n').filter(Boolean);

  const download = () => {
    if (output.data instanceof Blob) {
      const href = URL.createObjectURL(output.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = job.outputFilename ?? 'mediacraft-output';
      a.click();
      URL.revokeObjectURL(href);
    } else if (job.outputUrl) {
      window.open(job.outputUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const copyShareLink = () => {
    if (job.outputUrl) {
      navigator.clipboard.writeText(window.location.origin + job.outputUrl);
    }
  };

  return (
    <section className="space-y-6 animate-rise" data-testid="live-studio-view">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-950 border border-blue-800 text-yellow-400">
            {isHealing ? (
              <RotateCcw size={22} className="animate-spin text-yellow-400" />
            ) : isSucceeded ? (
              <Check size={22} className="text-emerald-400" />
            ) : (
              <Loader2 size={22} className="animate-spin text-blue-400" />
            )}
          </div>
          <div>
            <h1 className="font-display text-[24px] font-bold text-white">
              {isHealing ? 'Healing Script & Rebuilding Render…' : isSucceeded ? 'Master Render Verified & Ready' : isFailed ? 'Pipeline Halted' : 'Executing FFmpeg Render…'}
            </h1>
            <p className="text-[12px] text-slate-400">
              {isHealing
                ? 'Gemini received raw FFmpeg stderr and is applying fallback arguments.'
                : isSucceeded
                ? `Output passed validation · ${(job.mediaInfo.durationSeconds || 0).toFixed(1)}s duration`
                : 'Applying recipe to footage with real-time stream inspection.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={job.status} />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Pane: Preview Canvas */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
              {isSucceeded && job.outputUrl ? (
                isVideo ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                    src={job.outputUrl}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300">
                    <AudioLines size={56} className="text-yellow-400 animate-pulse" />
                    <div className="mt-4 font-display text-[16px] font-bold">Audio Master Ready</div>
                    <audio controls className="mt-3 w-full max-w-sm" src={job.outputUrl} />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 border border-slate-700">
                    <Play size={26} className="text-blue-400" />
                  </div>
                  <div className="font-display text-[16px] font-bold text-white">Rendering Canvas</div>
                  <p className="mt-1 max-w-xs text-[11px] text-slate-400">
                    Preview player will unlock once FFmpeg verifies the final container.
                  </p>
                  <div className="mt-4 flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="h-1 w-6 rounded-full bg-slate-700 animate-pulse" />
                    ))}
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] text-slate-400">
                SOURCE: {job.filename} · {job.preset.toUpperCase()}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-800/80 bg-slate-950">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-white">
                  {job.outputFilename ?? `${job.filename} (Processing)`}
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  Attempt {job.attempt} · Format: {job.mediaInfo.formatName || 'mp4'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSucceeded && (
                  <>
                    <button
                      onClick={copyShareLink}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                    >
                      <Share2 size={13} />
                      Share
                    </button>

                    <button
                      onClick={download}
                      disabled={output.isLoading}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-yellow-500 px-4 py-2 text-[12px] font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-60"
                    >
                      {output.isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                      Download Master
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: AI Diagnostics & Terminal Log */}
        <div className="lg:col-span-5 space-y-4">
          {/* AI Diagnostic Logic Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-yellow-400 via-blue-500 to-indigo-600" />
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
                <Sparkles size={16} className="text-yellow-400" />
                AI Diagnostic Logic
              </div>
              <span className="rounded bg-blue-950 border border-blue-800 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-blue-300">
                {isHealing ? 'Repair Active' : isSucceeded ? 'Plan Complete' : 'Planning'}
              </span>
            </div>

            <div className="space-y-2 rounded-xl bg-slate-950 p-3.5 border border-slate-800 font-mono text-[12px]">
              <div className="flex items-start gap-2 text-slate-300">
                <ArrowRight size={14} className="mt-0.5 shrink-0 text-slate-500" />
                <span>
                  Interpreted Recipe: <strong className="text-white">{job.preset}</strong>
                </span>
              </div>
              {job.prompt && (
                <div className="flex items-start gap-2 text-slate-400">
                  <ArrowRight size={14} className="mt-0.5 shrink-0 text-slate-500" />
                  <span className="italic text-slate-300">"{job.prompt}"</span>
                </div>
              )}
              <div className="flex items-start gap-2 text-emerald-400">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>
                  Streams: {job.mediaInfo.streamCount} · Audio: {job.mediaInfo.audioCodec ?? 'none'} · Video: {job.mediaInfo.videoCodec ?? 'none'}
                </span>
              </div>
            </div>
          </div>

          {/* Terminal Log Viewer */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-blue-400" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-300">FFmpeg Execution Log</span>
              </div>
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-slate-700" />
                <div className="h-2 w-2 rounded-full bg-slate-700" />
                <div className="h-2 w-2 rounded-full bg-slate-700" />
              </div>
            </div>

            <div className="max-h-[300px] min-h-[180px] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-slate-300 space-y-1.5 custom-scroll">
              {eventLines.length > 0 ? (
                eventLines.map((line, idx) => {
                  const isRed = line.includes('RED') || line.toLowerCase().includes('failed');
                  const isGold = line.includes('GOLD') || line.toLowerCase().includes('heal');
                  const isGreen = line.includes('GREEN') || line.toLowerCase().includes('complete');
                  return (
                    <div
                      key={idx}
                      className={`${
                        isRed
                          ? 'text-rose-400 bg-rose-950/20 px-1 rounded'
                          : isGold
                          ? 'text-yellow-300 bg-yellow-950/20 px-1 rounded'
                          : isGreen
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic">Connecting to event stream…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PresetsLibraryView({ onSelectPreset }: { onSelectPreset: (preset: Preset) => void }) {
  const [filter, setFilter] = useState<'all' | 'social' | 'audio' | 'captions' | 'compression' | 'custom'>('all');
  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filtered = PRESET_CATALOG.filter((item) => {
    const matchesFilter = filter === 'all' || item.category === filter;
    const matchesSearch =
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.ffmpegPreview.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const copySnippet = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <section className="space-y-6 animate-rise" data-testid="presets-library-view">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-blue-400">
            <Sliders size={13} />
            Presets & Macros
          </div>
          <h1 className="mt-1 font-display text-[28px] font-bold text-white">FFmpeg Operation Templates</h1>
          <p className="mt-1 max-w-xl text-[12px] text-slate-400">
            Battle-tested video encoding, social crops, subtitle burning, and custom Gemini generation recipes.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets, filters, codecs…"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All Presets' },
            { id: 'social', label: 'Social 9:16' },
            { id: 'audio', label: 'Audio Extraction' },
            { id: 'captions', label: 'Open Captions' },
            { id: 'compression', label: 'Web Encoding' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id as typeof filter)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors ${
                filter === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((preset) => {
          const Icon = preset.icon;
          return (
            <div
              key={preset.key}
              className="studio-card flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-tr ${preset.color} text-white shadow-md`}>
                    <Icon size={20} />
                  </div>
                  <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-300">
                    {preset.categoryLabel}
                  </span>
                </div>

                <h3 className="font-display text-[16px] font-bold text-white">{preset.label}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{preset.description}</p>

                <div className="relative mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 break-all">
                  <button
                    onClick={() => copySnippet(preset.key, preset.ffmpegPreview)}
                    className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    title="Copy FFmpeg snippet"
                  >
                    {copiedKey === preset.key ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                  <div className="pr-6 font-mono">{preset.ffmpegPreview}</div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex gap-2">
                <button
                  onClick={() => onSelectPreset(preset.key)}
                  className="flex-1 rounded-xl bg-blue-600/20 border border-blue-500/40 py-2.5 text-center text-[12px] font-bold text-blue-300 hover:bg-blue-600 hover:text-white transition-all"
                >
                  Quick Apply Recipe
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function JobListPanel({
  view,
  jobs,
  isLoading,
  onSelect,
}: {
  view: 'recent' | 'archive';
  jobs: MediaJob[] | undefined;
  isLoading: boolean;
  onSelect: (job: MediaJob) => void;
}) {
  const archive = view === 'archive';
  return (
    <section className="space-y-6 animate-rise" data-testid={`panel-${view}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-blue-400">
            {archive ? <Archive size={14} /> : <History size={14} />}
            Media Archive / {archive ? 'Completed Renders' : 'Session Queue'}
          </div>
          <h1 className="mt-1 font-display text-[28px] font-bold text-white">
            {archive ? 'Render History & Archive' : 'Recent Processing Jobs'}
          </h1>
          <p className="mt-1 max-w-xl text-[12px] text-slate-400">
            {archive
              ? 'Completed and failed renders stay saved in your current session for verification.'
              : 'Jump straight into live progress or review previously converted assets.'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {jobs?.length ?? 0} {archive ? 'Archived' : 'Active'}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-[13px] text-slate-400">
            <Loader2 size={18} className="animate-spin text-blue-500" />
            Loading job records…
          </div>
        ) : jobs?.length ? (
          <div className="space-y-2.5">
            {jobs.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="group flex w-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-left transition-all hover:border-blue-500/60 hover:bg-slate-900 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-950/80 border border-blue-800 text-blue-300">
                    {item.mediaInfo.hasVideo ? <Film size={20} /> : <AudioLines size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-white">{item.filename}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2.5 font-mono text-[10px] uppercase text-slate-400">
                      <span className="text-blue-400">{item.preset}</span>
                      <span>·</span>
                      <span>{(item.mediaInfo.durationSeconds || 0).toFixed(1)}s</span>
                      <span>·</span>
                      <span>{item.mediaInfo.videoCodec ?? item.mediaInfo.audioCodec ?? 'standard'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                  <StatusPill status={item.status} />
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Intl.DateTimeFormat(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(item.createdAt))}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              {archive ? <Archive size={26} /> : <History size={26} />}
            </div>
            <div className="font-display text-[16px] font-bold text-white">No jobs recorded yet</div>
            <p className="mx-auto mt-1.5 max-w-xs text-[11px] text-slate-400">
              Upload a source in the workspace to see it processed here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function StudioApp() {
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 20000 },
  });

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

  const jobQuery = useGetMediaJob(jobId, {
    query: {
      queryKey: getGetMediaJobQueryKey(jobId),
      enabled: !!jobId,
      refetchInterval: (query) => {
        const d = query.state.data;
        return d && (d.status === MediaJobStatus.succeeded || d.status === MediaJobStatus.failed)
          ? false
          : 2000;
      },
    },
  });

  const job = jobQuery.data;
  const recentJobs = useListMediaJobs(undefined, {
    query: { queryKey: getListMediaJobsQueryKey(), refetchInterval: 4000 },
  });
  const archivedJobs = useListMediaJobs(
    { archive: true },
    { query: { queryKey: getListMediaJobsQueryKey({ archive: true }), refetchInterval: 4000 } }
  );

  useEffect(() => {
    window.localStorage.setItem('mediacraft-theme', themeMode);
    const dark = themeMode === 'dark' || themeMode === 'system';
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('theme-dark', dark);
  }, [themeMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submit = () => {
    if (!file) {
      setNotice('Select or drop a source media file first.');
      return;
    }
    setNotice('');
    createJob.mutate(
      { data: { file, preset, prompt: prompt.trim() || undefined } },
      {
        onSuccess: (created) => {
          setJobId(created.id);
          setActiveView('live');
          void recentJobs.refetch();
        },
        onError: (err) => {
          const raw = err instanceof Error ? err.message : 'Upload failed.';
          setNotice(raw.replace(/^HTTP \d+ [^:]+:\s*/i, ''));
        },
      }
    );
  };

  const reset = () => {
    setFile(null);
    setPrompt('');
    setJobId('');
    setNotice('');
    setPreset('vertical-reel');
    setActiveView('workspace');
  };

  const selectJob = (selected: MediaJob) => {
    setJobId(selected.id);
    setPreset(selected.preset as Preset);
    if (selected.prompt) setPrompt(selected.prompt);
    setActiveView('live');
    setNotice('');
  };

  const applyPresetFromLibrary = (selectedPreset: Preset) => {
    setPreset(selectedPreset);
    setActiveView('workspace');
  };

  return (
    <div className="grain flex min-h-[100dvh] bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        onNew={reset}
        onSettings={() => setSettingsOpen(true)}
        health={health.data?.status}
      />

      <main className="min-w-0 flex-1 flex flex-col">
        <Header
          health={health.data?.status}
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          onOpenCommand={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          activeJobId={jobId}
        />

        <div className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 sm:px-8 lg:px-10 pb-32">
          {activeView === 'live' && job ? (
            <LiveStudioView job={job} onNavigateToPresets={() => setActiveView('presets')} />
          ) : activeView === 'presets' ? (
            <PresetsLibraryView onSelectPreset={applyPresetFromLibrary} />
          ) : activeView === 'recent' || activeView === 'archive' ? (
            <JobListPanel
              view={activeView}
              jobs={activeView === 'archive' ? archivedJobs.data : recentJobs.data}
              isLoading={activeView === 'archive' ? archivedJobs.isLoading : recentJobs.isLoading}
              onSelect={selectJob}
            />
          ) : (
            /* Workspace Dashboard View */
            <div className="space-y-8 animate-rise">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-blue-400">
                    <span className="h-px w-5 bg-blue-500" />
                    MediaCraft Studio / 01
                  </div>
                  <h1 className="mt-1 font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.02] text-white">
                    Welcome back, <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-yellow-400 bg-clip-text text-transparent">Filmmaker.</span>
                  </h1>
                  <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-slate-400">
                    System resources optimal. AI planner, ClickHouse analytics, and parallel search grounding active.
                  </p>
                </div>
              </div>

              {/* Bento Grid: Dropzone + Preset Quick Select */}
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[.2em] text-slate-400">Input Media</div>
                        <h2 className="mt-0.5 font-display text-[18px] font-bold text-white">Drop Source Media</h2>
                      </div>
                      <div className="rounded-xl bg-slate-800 p-2 text-blue-400 border border-slate-700">
                        <Film size={18} />
                      </div>
                    </div>

                    <Dropzone
                      file={file}
                      onFile={(next) => {
                        setFile(next);
                        setNotice('');
                      }}
                      onClear={() => setFile(null)}
                    />
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[.2em] text-slate-400">Recipe Selection</div>
                        <h2 className="mt-0.5 font-display text-[18px] font-bold text-white">Quick Presets</h2>
                      </div>
                      <button
                        onClick={() => setActiveView('presets')}
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        All Presets <ArrowRight size={13} />
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {PRESET_CATALOG.slice(0, 4).map((p) => {
                        const Icon = p.icon;
                        const active = preset === p.key;
                        return (
                          <button
                            key={p.key}
                            onClick={() => setPreset(p.key)}
                            className={`group relative rounded-xl border p-3 text-left transition-all ${
                              active
                                ? 'border-blue-500 bg-blue-950/60 shadow-md shadow-blue-950'
                                : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <Icon size={16} className={active ? 'text-yellow-400' : 'text-slate-400'} />
                              {active && <Check size={13} className="text-blue-400" />}
                            </div>
                            <div className={`mt-2 text-[12px] font-bold ${active ? 'text-white' : 'text-slate-300'}`}>
                              {p.label}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">{p.detail}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4">
                      <button
                        onClick={() => setPreset('custom')}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          preset === 'custom'
                            ? 'border-blue-500 bg-blue-950/60'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[12px] font-bold text-white">
                          <WandSparkles size={15} className="text-yellow-400" />
                          Custom Gemini NL Macro
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">Describe any conversion in plain English.</p>
                      </button>
                    </div>

                    <div className="mt-5">
                      <button
                        onClick={submit}
                        disabled={createJob.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-yellow-500 py-3.5 text-[13px] font-bold text-white shadow-xl hover:opacity-95 disabled:opacity-60"
                      >
                        {createJob.isPending ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Uploading & Initializing Pipeline…
                          </>
                        ) : (
                          <>
                            <Zap size={16} className="text-yellow-300" />
                            Start Processing
                          </>
                        )}
                      </button>
                    </div>

                    {notice && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-yellow-800 bg-yellow-950/50 p-3 text-[11px] text-yellow-300">
                        <AlertTriangle size={15} className="shrink-0" />
                        {notice}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Fixed Natural Language Input Bar (from Stitch Dashboard) */}
        {activeView === 'workspace' && (
          <div className="fixed bottom-0 left-0 w-full md:pl-[250px] bg-slate-950/90 backdrop-blur-md border-t border-slate-800 z-40 p-4 shadow-2xl">
            <div className="max-w-4xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (prompt.trim() && !file) {
                    setNotice('Please drop or select a source video/audio file above.');
                    return;
                  }
                  if (prompt.trim()) {
                    setPreset('custom');
                    submit();
                  }
                }}
                className="relative flex items-center"
              >
                <Sparkles size={18} className="absolute left-4 text-yellow-400" />
                <input
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (e.target.value.trim() && preset !== 'custom') {
                      setPreset('custom');
                    }
                  }}
                  placeholder="e.g. Extract the audio from this video, normalize volume, and fade in first 2 seconds…"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 py-3.5 pl-12 pr-14 text-[13px] text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-inner"
                />
                <button
                  type="submit"
                  disabled={createJob.isPending}
                  className="absolute right-2 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                  aria-label="Send prompt"
                >
                  <Send size={16} />
                </button>
              </form>
              <div className="mt-1.5 flex justify-between px-2 font-mono text-[9px] text-slate-400">
                <span>Powered by MediaCraft Gemini AI Engine &amp; FFmpeg 6.0</span>
                <span>Press Enter to start</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {settingsOpen && (
        <SettingsPanel
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {commandOpen && (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          onNavigate={setActiveView}
          onNew={reset}
          onSettings={() => {
            setCommandOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={StudioApp} />
        <Route
          component={() => (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 font-display text-white">
              Page not found
            </div>
          )}
        />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;