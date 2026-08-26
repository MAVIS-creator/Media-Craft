import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
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
  getGetMediaAnalyticsQueryKey,
  getGetIntegrationDiagnosticsQueryKey,
  getGetMediaTelemetryQueryKey,
  getHealthCheckQueryKey,
  getListMediaJobsQueryKey,
  MediaJobInputPreset,
  MediaJobStatus,
  type MediaJob,
  useCreateMediaJob,
  useDownloadMediaJobOutput,
  useGetMediaAnalytics,
  useGetIntegrationDiagnostics,
  useGetMediaTelemetry,
  useGetMediaJob,
  useHealthCheck,
  useListMediaJobs,
  useStreamMediaJobEvents,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Preset = typeof MediaJobInputPreset[keyof typeof MediaJobInputPreset];
type ThemeMode = 'light' | 'dark' | 'system';
type AppView = 'workspace' | 'live' | 'presets' | 'recent' | 'archive';
const brandMarkSrc = `${import.meta.env.BASE_URL}media-craft-mark.png`;

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('mediacraft-theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
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
    key: 'smart-reframe',
    label: 'Smart Reframe',
    category: 'social',
    categoryLabel: 'Social Cut',
    detail: 'AI focal point · 9:16',
    description: 'Turn landscape footage into a social-ready vertical cut that keeps the speaker or action in frame.',
    ffmpegPreview: 'Gemini saliency plan → safe 9:16 crop → verified H.264 master',
    icon: Scissors,
    color: 'from-blue-600 to-indigo-600',
  },
  {
    key: 'captions-hook',
    label: 'Captions & Hook',
    category: 'captions',
    categoryLabel: 'Social Cut',
    detail: 'Bold hook captions',
    description: 'Generate or upload captions, then finish the video with bold, high-contrast hook styling and clean audio.',
    ffmpegPreview: 'Gemini transcription → validated captions → bold yellow open captions',
    icon: Mic2,
    color: 'from-rose-500 to-fuchsia-600',
  },
  {
    key: 'tighten-finish',
    label: 'Tighten & Finish',
    category: 'compression',
    categoryLabel: 'Finishing',
    detail: 'Dead-air trim · audio polish',
    description: 'Remove long pauses, join the clean speech segments, and normalize the finished soundtrack for delivery.',
    ffmpegPreview: 'silencedetect → bounded jump cuts → loudnorm=-14 LUFS',
    icon: Scissors,
    color: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'extract-audio',
    label: 'Extract Audio',
    category: 'audio',
    categoryLabel: 'Audio',
    detail: 'MP3 · 320 kbps',
    description: 'Create a clean MP3 master from video or audio source material.',
    ffmpegPreview: '-vn -c:a libmp3lame -b:a 320k -ar 48000',
    icon: AudioLines,
    color: 'from-amber-500 to-yellow-600',
  },
  {
    key: 'compress-video',
    label: 'Compress for Delivery',
    category: 'compression',
    categoryLabel: 'Finishing',
    detail: 'Web-ready H.264',
    description: 'Create a dependable, streaming-friendly H.264 master with a balanced quality-to-size ratio.',
    ffmpegPreview: '-c:v libx264 -crf 22 -preset medium -movflags +faststart',
    icon: Gauge,
    color: 'from-cyan-500 to-blue-600',
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

const TOUR_STEPS = [
  {
    title: 'Welcome to MediaCraft AI',
    body: 'A filmmaker-focused workspace for transforming video and audio with FFmpeg, Gemini-assisted editing, captions, and finishing tools.',
    target: '[data-tour="workspace-intro"]',
  },
  {
    title: 'Start with your source media',
    body: 'Drop a video or audio file here. MediaCraft validates the streams with FFprobe before processing anything.',
    target: '[data-tour="upload"]',
  },
  {
    title: 'Choose a finishing recipe',
    body: 'Choose a focused finishing workflow for social reframing, captions, or tightening a cut—or open Custom Gemini for a natural-language edit.',
    target: '[data-tour="presets"]',
  },
  {
    title: 'Describe a custom edit',
    body: 'Tell the AI engine what you want in plain English. It creates a safe FFmpeg plan and can repair failed renders with bounded retries.',
    target: '[data-tour="prompt"]',
  },
  {
    title: 'Follow every render',
    body: 'The Workspace keeps your active job, stage, and progress visible. Live Processing opens the detailed event log, preview, sharing, and downloads.',
    target: '[data-tour="navigation"]',
  },
] as const;

function AppTour({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const candidates = Array.from(document.querySelectorAll(current.target));
      const target = candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!target) {
        setTargetRect(null);
        // Targets can appear one render after a view change (or after the
        // mobile drawer finishes opening). Recheck before falling back to a
        // centered tour card.
        frame = requestAnimationFrame(update);
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setTargetRect(rect.width > 0 && rect.height > 0 ? rect : null);
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [current.target]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && step < TOUR_STEPS.length - 1) onStep(step + 1);
      if (event.key === 'ArrowLeft' && step > 0) onStep(step - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onStep, step]);

  const isLast = step === TOUR_STEPS.length - 1;
  const cardStyle: CSSProperties = targetRect
    ? {
        top: Math.min(window.innerHeight - 250, Math.max(18, targetRect.bottom + 16)),
        left: Math.min(window.innerWidth - 338, Math.max(18, targetRect.left)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]" onClick={onClose} />
      {targetRect && (
        <div
          className="pointer-events-none fixed rounded-2xl border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(2,6,23,.62),0_0_30px_rgba(96,165,250,.45)] transition-all duration-300"
          style={{
            top: targetRect.top - 7,
            left: targetRect.left - 7,
            width: targetRect.width + 14,
            height: targetRect.height + 14,
          }}
        />
      )}
      <section
        className="absolute w-[min(320px,calc(100vw-32px))] rounded-2xl border border-blue-500/60 bg-slate-900 p-5 text-slate-100 shadow-2xl animate-rise"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.2em] text-blue-300">MediaCraft quick tour · {step + 1}/{TOUR_STEPS.length}</div>
            <h2 id="tour-title" className="mt-1.5 font-display text-[19px] font-bold text-white">{current.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close tour">
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-slate-300">{current.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-white">Skip tour</button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => onStep(step - 1)} className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-300 hover:bg-slate-800">Back</button>
            )}
            <button
              onClick={() => isLast ? onClose() : onStep(step + 1)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-bold text-white shadow-lg shadow-blue-950/50 hover:bg-blue-500"
            >
              {isLast ? 'Finish tour' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BrandMark({ compact = false, health }: { compact?: boolean; health?: string }) {
  return (
    <div className={`flex items-center ${compact ? '' : 'gap-3'}`}>
      <img
        src={brandMarkSrc}
        alt="MediaCraft AI"
        className="h-9 w-9 min-w-9 shrink-0 rounded-xl object-contain shadow-lg shadow-blue-900/25"
      />
      {!compact && (
        <div>
          <div className="font-display text-[17px] font-bold tracking-tight text-white">MediaCraft AI</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${health === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="font-mono text-[8px] font-semibold uppercase tracking-[.14em] text-slate-400">
              {health === 'ok' ? 'AI Studio · Online' : 'AI Studio · Connecting'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  themeMode,
  onThemeChange,
  onClose,
  onStartTour,
}: {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onClose: () => void;
  onStartTour: () => void;
}) {
  const telemetry = useGetMediaTelemetry({ query: { queryKey: getGetMediaTelemetryQueryKey(), refetchInterval: 10000 } });
  const analytics = useGetMediaAnalytics(undefined, { query: { queryKey: getGetMediaAnalyticsQueryKey(), refetchInterval: 10000 } });
  const integrations = useGetIntegrationDiagnostics({ query: { queryKey: getGetIntegrationDiagnosticsQueryKey(), refetchInterval: 30000 } });
  const metrics = telemetry.data;
  const analyticsSummary = analytics.data;
  return (
    <div
      className="settings-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="settings-modal my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl animate-rise sm:p-6">
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
              FFprobe inspects stream duration and codecs before Gemini creates an FFmpeg plan.
            </p>
          </div>

          <button
            onClick={onStartTour}
            className="flex w-full items-center justify-between rounded-xl border border-blue-800/70 bg-blue-950/40 p-3.5 text-left transition-colors hover:bg-blue-900/50"
          >
            <div>
              <div className="text-[12px] font-bold text-white">Take the quick tour</div>
              <div className="mt-1 text-[10px] text-slate-400">Learn what each part of the studio does.</div>
            </div>
            <ArrowRight size={15} className="text-blue-300" />
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Pipeline</div>
              <div className="mt-1.5 text-[18px] font-bold text-white">
                {metrics ? `${metrics.activeJobs} active` : 'Loading…'}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {metrics ? `${metrics.completedJobs} complete · ${metrics.failedJobs} failed` : 'Checking endpoint'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Session analytics</div>
              <div className="mt-1.5 text-[18px] font-bold text-white">
                {analyticsSummary ? analyticsSummary.totalRecords : '—'}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {analyticsSummary?.clickhouseMcpConnected ? 'ClickHouse connected' : 'Session buffer active'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-400">Integration diagnostics</div>
                <div className="mt-1 text-[12px] font-bold text-white">Live provider checks</div>
              </div>
              <button
                onClick={() => void integrations.refetch()}
                disabled={integrations.isFetching}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {integrations.isFetching ? 'Checking…' : 'Refresh'}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {integrations.data?.providers.map((provider) => {
                const connected = provider.state === 'connected';
                const notConfigured = provider.state === 'not_configured';
                const tone = connected
                  ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300'
                  : notConfigured
                    ? 'border-slate-700 bg-slate-900 text-slate-300'
                    : 'border-rose-800 bg-rose-950/50 text-rose-300';
                return (
                  <div key={provider.provider} className={`rounded-lg border px-2.5 py-2 ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{provider.provider}</span>
                      <span className="text-[10px] font-semibold capitalize">{provider.state.replace('_', ' ')}</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] opacity-80">
                      {provider.lastError ?? (connected ? `Verified ${provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleTimeString() : 'now'}` : 'Add the required configuration')}
                    </div>
                  </div>
                );
              }) ?? (
                <div className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[10px] text-slate-400">
                  Checking provider connections…
                </div>
              )}
            </div>
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
    <div className="flex h-full flex-col px-4 py-5 bg-slate-950 border-r border-slate-800/80 text-slate-200" data-tour="navigation">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark health={health} />
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
        data-tour="navigation"
        className="fixed left-4 top-4 z-30 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white shadow-lg md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] isolate overflow-hidden md:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 z-0 cursor-default bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-full w-[280px] max-w-[85vw] shadow-2xl">{content}</aside>
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
      data-tour="upload"
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

function CaptionSourcePicker({
  subtitleFile,
  mode,
  output,
  onMode,
  onOutput,
  onFile,
}: {
  subtitleFile: File | null;
  mode: 'standard' | 'karaoke' | 'none';
  output: 'burn' | 'file';
  onMode: (mode: 'standard' | 'karaoke' | 'none') => void;
  onOutput: (output: 'burn' | 'file') => void;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-violet-800/70 bg-violet-950/20 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-violet-700/70 bg-violet-900/40 p-2 text-violet-200">
          <Mic2 size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-white">Caption source</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
            Choose a normal subtitle file, an active-yellow karaoke file, or burn captions directly into the video.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onMode('karaoke')}
          className={`rounded-xl border p-3 text-left transition-colors ${mode === 'karaoke' ? 'border-yellow-400 bg-yellow-950/40' : 'border-slate-700 bg-slate-950 hover:border-slate-600'}`}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold text-white">
            {mode === 'karaoke' && <Check size={13} className="text-yellow-300" />}
            Active word highlight
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Carter PC style, white words with a yellow spoken word.</p>
        </button>
        <button
          type="button"
          onClick={() => onMode('standard')}
          className={`rounded-xl border p-3 text-left transition-colors ${mode === 'standard' ? 'border-violet-400 bg-violet-900/50' : 'border-slate-700 bg-slate-950 hover:border-slate-600'}`}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold text-white">
            {mode === 'standard' && <Check size={13} className="text-violet-300" />}
            Standard subtitles
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Clean white timed SRT, without karaoke highlighting.</p>
        </button>
        <button type="button" onClick={() => onMode('none')} className={`rounded-xl border p-3 text-left transition-colors ${mode === 'none' ? 'border-slate-400 bg-slate-800' : 'border-slate-700 bg-slate-950 hover:border-slate-600'}`}>
          <div className="flex items-center gap-2 text-[11px] font-bold text-white">{mode === 'none' && <Check size={13} />}No subtitles</div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Finish the video without adding a caption layer.</p>
        </button>
      </div>
      {mode !== 'none' && (
        <>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onOutput('burn')} className={`rounded-xl border p-2.5 text-left text-[10px] font-bold ${output === 'burn' ? 'border-blue-400 bg-blue-950/50 text-white' : 'border-slate-700 text-slate-400'}`}>Burn into video</button>
          <button type="button" onClick={() => onOutput('file')} className={`rounded-xl border p-2.5 text-left text-[10px] font-bold ${output === 'file' ? 'border-blue-400 bg-blue-950/50 text-white' : 'border-slate-700 text-slate-400'}`}>Download subtitle file</button>
        </div>
        {output === 'burn' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5">
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
             onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-slate-200">{subtitleFile?.name ?? 'No caption file selected'}</div>
            <div className="text-[9px] text-slate-500">UTF-8 .srt or .vtt · maximum 10 MB</div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-slate-700"
          >
            {subtitleFile ? 'Replace' : 'Choose file'}
          </button>
        </div>
        )}
        </>
      )}
    </div>
  );
}

function WorkspaceProgressCard({ job, onOpen }: { job: MediaJob; onOpen: () => void }) {
  const progress = Math.max(0, Math.min(100, job.progressPercent ?? 0));
  const active = job.status !== MediaJobStatus.succeeded && job.status !== MediaJobStatus.failed;
  const stage = (job.stage || 'queued').replaceAll('-', ' ');
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-800/70 bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 shadow-xl" data-testid="workspace-job-progress">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${active ? 'border-blue-600 bg-blue-900/60 text-blue-300' : job.status === MediaJobStatus.succeeded ? 'border-emerald-700 bg-emerald-950 text-emerald-300' : 'border-rose-700 bg-rose-950 text-rose-300'}`}>
            {active ? <Loader2 size={18} className="animate-spin" /> : job.status === MediaJobStatus.succeeded ? <Check size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-white">{active ? 'Active processing job' : 'Latest processing job'}</span>
              <StatusPill status={job.status} />
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400">
              {job.filename} · <span className="capitalize text-slate-300">{stage}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:w-[310px]">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-wide text-blue-200">
              <span className="truncate">{stage}</span><span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button onClick={onOpen} className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-700">
            View details
          </button>
        </div>
      </div>
    </section>
  );
}

function formatPlayerTime(value: number) {
  if (!Number.isFinite(value)) return '00:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function StudioPlayer({
  src,
  isVideo,
  filename,
  format,
}: {
  src: string;
  isVideo: boolean;
  filename: string;
  format: string;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const togglePlayback = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      void media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      media.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = value;
    setVolume(value);
  };

  const toggleFullscreen = () => {
    if (!frameRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frameRef.current.requestFullscreen();
    }
  };

  return (
    <div ref={frameRef} className="studio-player group relative h-full w-full overflow-hidden bg-[#07101f]">
      {isVideo ? (
        <video
          ref={(node) => { mediaRef.current = node; }}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          src={src}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_20%,rgba(37,99,235,.24),transparent_45%),#07101f] p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-blue-400/20 bg-blue-500/10 text-blue-300 shadow-[0_0_50px_rgba(37,99,235,.18)]">
            <AudioLines size={38} />
          </div>
          <div className="mt-4 font-display text-[18px] font-bold text-white">Audio Master</div>
          <div className="mt-1 max-w-sm truncate font-mono text-[10px] uppercase tracking-[.14em] text-slate-400">{filename}</div>
          <audio
            ref={(node) => { mediaRef.current = node; }}
            preload="metadata"
            src={src}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-white/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]" />
          Output Preview
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/60">{format}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-4 pb-3 pt-12">
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 transition-transform hover:scale-105"
            aria-label={playing ? 'Pause output' : 'Play output'}
          >
            {playing ? <span className="text-[12px] font-black">Ⅱ</span> : <Play size={14} fill="currentColor" />}
          </button>
          <input
            aria-label="Seek through output"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            className="studio-range min-w-0 flex-1"
            style={{ '--range-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
          />
          <span className="w-[82px] text-right font-mono text-[10px] tabular-nums text-white/80">
            {formatPlayerTime(currentTime)} <span className="text-white/40">/</span> {formatPlayerTime(duration)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="max-w-[65%] truncate font-mono text-[9px] uppercase tracking-[.12em] text-white/60">
            {isVideo ? 'Video output' : 'Audio output'} · {format}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeVolume(volume > 0 ? 0 : 1)}
              className="rounded-lg p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={volume > 0 ? 'Mute output' : 'Unmute output'}
            >
              {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <input
              aria-label="Output volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="studio-volume hidden w-16 sm:block"
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-lg p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Toggle fullscreen preview"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BeforeAfterPlayer({ source, output }: { source: string; output: string }) {
  const sourceRef = useRef<HTMLVideoElement | null>(null);
  const outputRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(50);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlayback = () => {
    const sourceVideo = sourceRef.current;
    const outputVideo = outputRef.current;
    if (!sourceVideo || !outputVideo) return;
    if (sourceVideo.paused) {
      outputVideo.currentTime = sourceVideo.currentTime;
      void Promise.all([sourceVideo.play(), outputVideo.play()]).then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      sourceVideo.pause();
      outputVideo.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    if (sourceRef.current) sourceRef.current.currentTime = value;
    if (outputRef.current) outputRef.current.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <div className="studio-player group relative h-full w-full overflow-hidden bg-[#07101f]">
      <div className="absolute inset-0">
        <video
          ref={outputRef}
          src={output}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <video ref={sourceRef} src={source} playsInline preload="metadata" className="h-full w-full object-contain" />
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 flex gap-2 font-mono text-[9px] uppercase tracking-wider text-white">
        <span className="rounded bg-black/65 px-2 py-1">Source</span>
        <span className="rounded bg-blue-600/85 px-2 py-1">Master</span>
      </div>
      <div className="absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
        <div className="h-full w-px bg-white shadow-[0_0_12px_rgba(255,255,255,.9)]" />
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow-xl">
          ↔
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-3 pt-12">
        <label className="mb-2 block font-mono text-[9px] uppercase tracking-wider text-white/70">
          Before / after split
          <input
            aria-label="Before and after split position"
            type="range"
            min="0"
            max="100"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            className="studio-range mt-2 w-full"
            style={{ '--range-progress': `${position}%` } as CSSProperties}
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={togglePlayback} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-950" aria-label={playing ? 'Pause comparison' : 'Play comparison'}>
            {playing ? <span className="text-[12px] font-black">Ⅱ</span> : <Play size={14} fill="currentColor" />}
          </button>
          <input
            aria-label="Seek through comparison"
            type="range"
            min="0"
            max={duration || 0}
            step="0.01"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            className="studio-range min-w-0 flex-1"
            style={{ '--range-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
          />
          <span className="w-[82px] text-right font-mono text-[10px] tabular-nums text-white/80">
            {formatPlayerTime(currentTime)} <span className="text-white/40">/</span> {formatPlayerTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function LiveStudioView({
  job,
  onNavigateToPresets,
  sourceFile,
}: {
  job: NonNullable<MediaJob>;
  onNavigateToPresets: () => void;
  sourceFile?: File | null;
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
  const isCaptionOutput = job.outputMimeType === 'application/x-subrip' || job.preset === 'generate-subtitles';
  const isSucceeded = job.status === MediaJobStatus.succeeded;
  const isHealing = job.status === MediaJobStatus.healing;
  const isFailed = job.status === MediaJobStatus.failed;
  const [shareMessage, setShareMessage] = useState('');
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');

  useEffect(() => {
    if (!sourceFile || !job.mediaInfo.hasVideo) {
      setSourcePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [job.id, job.mediaInfo.hasVideo, sourceFile]);

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

  const copyShareLink = async () => {
    if (!job.outputUrl) {
      setShareMessage('Link unavailable');
      return;
    }

    const shareUrl = new URL(job.outputUrl, window.location.origin).href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setShareMessage('Copied');
    } catch {
      // Clipboard permissions are commonly blocked in embedded previews.
      // Keep sharing useful with a user-visible, browser-compatible fallback.
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setShareMessage(copied ? 'Copied' : 'Copy blocked');
    }
    window.setTimeout(() => setShareMessage(''), 2200);
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

      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400">
          <span className="capitalize">{(job.stage || 'queued').replaceAll('-', ' ')}</span>
          <span className="text-blue-300">{job.progressPercent ?? 0}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progressPercent ?? 0}>
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-400 transition-all duration-500" style={{ width: `${job.progressPercent ?? 0}%` }} />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Pane: Preview Canvas */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden lg:aspect-[16/10]">
                {isSucceeded && job.outputUrl && sourcePreviewUrl && isVideo && !isCaptionOutput ? (
                 <BeforeAfterPlayer source={sourcePreviewUrl} output={job.outputUrl} />
                ) : isSucceeded && job.outputUrl && !isCaptionOutput ? (
                <StudioPlayer
                  src={job.outputUrl}
                  isVideo={isVideo}
                  filename={job.outputFilename ?? job.filename}
                  format={job.mediaInfo.formatName || (isVideo ? 'MP4' : 'MP3')}
                />
               ) : isSucceeded && isCaptionOutput ? (
                 <div className="flex max-w-md flex-col items-center justify-center p-8 text-center text-slate-400">
                   <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-700 bg-violet-950/60">
                     <Mic2 size={27} className="text-violet-300" />
                   </div>
                   <div className="font-display text-[16px] font-bold text-white">Timed Captions Ready</div>
                   <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                     The source audio was transcribed into validated SRT captions. Download the file to edit or reuse it in another project.
                   </p>
                 </div>
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

              {!isSucceeded && (
                <div className="pointer-events-none absolute left-4 top-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-white/60">
                  RENDERING CANVAS · {job.preset}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 bg-slate-950 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {isSucceeded && <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" />}
                  <div className="truncate text-[13px] font-bold text-white">
                  {job.outputFilename ?? `${job.filename} (Processing)`}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                  <span>{isSucceeded ? 'Verified master' : 'Processing output'}</span>
                  <span className="text-slate-600">·</span>
                  <span>{job.mediaInfo.formatName || 'mp4'}</span>
                  <span className="text-slate-600">·</span>
                  <span>Pass {job.attempt}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSucceeded && (
                  <>
                    <button
                      type="button"
                      onClick={() => void copyShareLink()}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                    >
                      {shareMessage === 'Copied' ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                      {shareMessage || 'Share'}
                    </button>

                    <button
                      onClick={download}
                      disabled={output.isLoading}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-yellow-500 px-4 py-2 text-[12px] font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-60"
                    >
                      {output.isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                      Download Master
                    </button>
                    {job.subtitleUrl && !isCaptionOutput && (
                      <a
                        href={job.subtitleUrl}
                        download={job.subtitleFilename ?? 'mediacraft-captions.srt'}
                        className="flex items-center gap-1.5 rounded-xl border border-violet-700 bg-violet-950/50 px-3 py-2 text-[11px] font-bold text-violet-200 hover:bg-violet-900/60"
                      >
                        <ArrowDownToLine size={13} />
                        Captions SRT
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: AI Diagnostics & Terminal Log */}
        <div className="lg:col-span-4 space-y-4">
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
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleMode, setSubtitleMode] = useState<'standard' | 'karaoke' | 'none'>('karaoke');
  const [subtitleOutput, setSubtitleOutput] = useState<'burn' | 'file'>('burn');
  const [preset, setPreset] = useState<Preset>('smart-reframe');
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState('');
  const [notice, setNotice] = useState('');
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

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
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const isDark = themeMode === 'dark' || (themeMode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.body.classList.toggle('theme-dark', isDark);
      document.body.classList.toggle('theme-light', !isDark);
    };
    applyTheme();
    if (themeMode === 'system') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    return undefined;
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

  useEffect(() => {
    if (window.localStorage.getItem('mediacraft-tour-completed') !== 'true') {
      setTourOpen(true);
    }
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    window.localStorage.setItem('mediacraft-tour-completed', 'true');
  };

  const startTour = () => {
    setSettingsOpen(false);
    setActiveView('workspace');
    setTourStep(0);
    setTourOpen(true);
  };

  const submit = () => {
    if (!file) {
      setNotice('Select or drop a source media file first.');
      return;
    }
    if (preset === 'captions-hook' && subtitleOutput === 'burn' && subtitleMode === 'standard' && subtitleFile === null) {
      setNotice('Choose an SRT or VTT file, or switch to generated karaoke captions.');
      return;
    }
    setNotice('');
    createJob.mutate(
      {
        data: {
          file,
          preset,
          prompt: prompt.trim() || undefined,
          ...(preset === 'captions-hook'
            ? { subtitleMode, subtitleOutput, subtitle: subtitleFile ?? undefined }
            : {}),
        },
      },
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
    setSubtitleFile(null);
    setSubtitleMode('karaoke');
    setSubtitleOutput('burn');
    setPrompt('');
    setJobId('');
    setNotice('');
    setPreset('smart-reframe');
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
    <div className="grain studio-shell flex bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        onNew={reset}
        onSettings={() => setSettingsOpen(true)}
        health={health.data?.status}
      />

      <main className="studio-main min-w-0 flex-1 flex flex-col">
        <Header
          health={health.data?.status}
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          onOpenCommand={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          activeJobId={jobId}
        />

        <div className="studio-content page-content-shell mx-auto w-full max-w-[1400px] flex-1 px-5 py-7 sm:px-8 lg:px-10">
          {activeView === 'live' && job ? (
            <LiveStudioView job={job} sourceFile={file} onNavigateToPresets={() => setActiveView('presets')} />
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
               <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end" data-tour="workspace-intro">
                <div>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-blue-400">
                    <span className="h-px w-5 bg-blue-500" />
                    MediaCraft Studio / 01
                  </div>
                  <h1 className="mt-1 font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.02] text-white">
                    Welcome back, <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-yellow-400 bg-clip-text text-transparent">Filmmaker.</span>
                  </h1>
                  <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-slate-400">
                    Gemini planning, FFprobe validation, and session analytics are ready for your next source file.
                  </p>
                </div>
              </div>

              {job && (
                <WorkspaceProgressCard
                  job={job}
                  onOpen={() => setActiveView('live')}
                />
              )}

              {/* Bento Grid: Dropzone + Preset Quick Select */}
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7 space-y-4">
                   <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl" data-tour="upload">
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
                        setJobId('');
                        setNotice('');
                      }}
                      onClear={() => {
                        setFile(null);
                        setSubtitleFile(null);
                        setJobId('');
                        setNotice('');
                      }}
                    />
                    {preset === 'captions-hook' && (
                      <div className="mt-4">
                        <CaptionSourcePicker
                          subtitleFile={subtitleFile}
                          mode={subtitleMode}
                          output={subtitleOutput}
                          onMode={(mode) => {
                            setSubtitleMode(mode);
                            if (mode !== 'standard') setSubtitleFile(null);
                          }}
                          onOutput={setSubtitleOutput}
                          onFile={setSubtitleFile}
                        />
                      </div>
                    )}
                    {preset === 'smart-reframe' && (
                      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-800/70 bg-blue-950/20 p-4">
                        <div className="rounded-xl border border-blue-700/70 bg-blue-900/40 p-2 text-blue-200"><Scissors size={17} /></div>
                        <div>
                          <div className="text-[12px] font-bold text-white">Smart focal framing</div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                            Gemini keeps the main speaker or action in the 9:16 frame, then MediaCraft validates and renders the crop.
                          </p>
                        </div>
                      </div>
                    )}
                    {preset === 'tighten-finish' && (
                      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-800/70 bg-emerald-950/20 p-4">
                        <div className="rounded-xl border border-emerald-700/70 bg-emerald-900/40 p-2 text-emerald-200"><Volume2 size={17} /></div>
                        <div>
                          <div className="text-[12px] font-bold text-white">Automatic finishing pass</div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                            Long pauses are detected and removed, then the remaining dialogue is joined and normalized for delivery.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4">
                   <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl" data-tour="presets">
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
                      {PRESET_CATALOG.filter((item) => item.key !== 'custom').map((p) => {
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

        {/* Workspace Natural Language Input */}
        {activeView === 'workspace' && (
           <section className="sticky bottom-0 z-20 shrink-0 border-t border-slate-800 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md">
            <div className="mx-auto w-full max-w-[1400px] px-1 sm:px-3 lg:px-5">
              <div className="mx-auto max-w-4xl">
               <form
                 data-tour="prompt"
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
          </section>
        )}
      </main>

      {settingsOpen && (
        <SettingsPanel
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          onClose={() => setSettingsOpen(false)}
          onStartTour={startTour}
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

      {tourOpen && (
        <AppTour
          step={tourStep}
          onStep={setTourStep}
          onClose={closeTour}
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