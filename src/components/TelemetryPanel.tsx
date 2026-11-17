import type { BuildingTelemetry, SensorReading, TelemetryStatus, SimulationPreset } from '../types/telemetry';
import { Activity, Compass, Cpu, Droplets, Zap, AlertTriangle, Play, Pause, RotateCcw, Wind, Waves } from 'lucide-react';

interface TelemetryPanelProps {
  telemetry: BuildingTelemetry;
  isStreaming?: boolean;
  onToggleStreaming?: () => void;
  onSimulate?: (preset: SimulationPreset) => void;
  compact?: boolean;
}

const STATUS_THEMES: Record<TelemetryStatus, { bg: string; text: string; border: string; dot: string }> = {
  normal: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', dot: 'bg-red-500 animate-ping' }
};

export function SensorSparkline({ history, status, maxLimit }: { history: number[]; status: TelemetryStatus; maxLimit: number }) {
  if (!history || history.length < 2) return null;

  const min = Math.min(...history) * 0.9;
  const max = Math.max(...history, maxLimit * 1.1);
  const range = max - min || 1;

  const width = 110;
  const height = 30;
  const points = history
    .map((val, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const strokeColor = status === 'critical' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981';

  return (
    <svg className="w-24 h-7 shrink-0 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function SensorCard({ sensor }: { sensor: SensorReading }) {
  const theme = STATUS_THEMES[sensor.status];
  const percentOfCritical = Math.min(100, Math.round((sensor.value / sensor.criticalThreshold) * 100));

  const getIcon = () => {
    switch (sensor.sensorType) {
      case 'accelerometer': return <Activity className="w-3.5 h-3.5 text-[#E5C77B]" />;
      case 'tiltmeter': return <Compass className="w-3.5 h-3.5 text-blue-400" />;
      case 'strain_gauge': return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case 'moisture': return <Droplets className="w-3.5 h-3.5 text-cyan-400" />;
      default: return <Cpu className="w-3.5 h-3.5 text-[#A7A39A]" />;
    }
  };

  return (
    <div className={`p-3.5 rounded bg-[#111111] border ${sensor.status === 'critical' ? 'border-red-500/50 ring-1 ring-red-500/30' : 'border-[#222222]'} flex flex-col justify-between transition-all duration-300`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[#1c1c1c] border border-[#2e2e2e]">
            {getIcon()}
          </div>
          <div>
            <div className="text-xs font-semibold text-[#F5F0E5] leading-tight">{sensor.label}</div>
            <div className="text-[10px] text-[#A7A39A] truncate max-w-[170px]">{sensor.location}</div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 ${theme.bg} ${theme.text} ${theme.border} border`}>
          <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
          {sensor.status}
        </span>
      </div>

      <div className="flex items-baseline justify-between mt-1 mb-2">
        <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold font-mono tracking-tight ${sensor.status === 'critical' ? 'text-red-400' : sensor.status === 'warning' ? 'text-amber-400' : 'text-[#F5F0E5]'}`}>
            {sensor.value}
          </span>
          <span className="text-xs font-mono text-[#A7A39A]">{sensor.unit}</span>
        </div>
        <SensorSparkline history={sensor.history} status={sensor.status} maxLimit={sensor.criticalThreshold} />
      </div>

      {/* Progress Bar Gauge towards Critical threshold */}
      <div className="space-y-1">
        <div className="w-full h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-500 ${
              sensor.status === 'critical' ? 'bg-red-500' : sensor.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.max(8, percentOfCritical)}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-[#777777]">
          <span>Warn: {sensor.warningThreshold}{sensor.unit}</span>
          <span className={sensor.status === 'critical' ? 'text-red-400 font-bold' : ''}>Crit: {sensor.criticalThreshold}{sensor.unit}</span>
        </div>
      </div>
    </div>
  );
}

export default function TelemetryPanel({
  telemetry,
  isStreaming = true,
  onToggleStreaming,
  onSimulate,
  compact = false
}: TelemetryPanelProps) {
  const overallTheme = STATUS_THEMES[telemetry.overallStatus];

  return (
    <div className="space-y-4">
      {/* Header telemetry status ticker */}
      <div className="p-3 bg-[#141414] border border-[#222222] rounded flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {isStreaming && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${overallTheme.dot}`} />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${overallTheme.dot}`} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#F5F0E5]">IoT Structural Telemetry Array</span>
              <span className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold uppercase ${overallTheme.bg} ${overallTheme.text} border ${overallTheme.border}`}>
                {telemetry.overallStatus.toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-[#A7A39A] font-mono">
              Live Stream: {isStreaming ? 'Active (2.5s intervals)' : 'Paused'} • Last packet: {telemetry.lastUpdated}
            </div>
          </div>
        </div>

        {onToggleStreaming && (
          <button
            type="button"
            onClick={onToggleStreaming}
            className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-xs text-[#E5C77B] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isStreaming ? 'Pause Feed' : 'Resume Feed'}</span>
          </button>
        )}
      </div>

      {/* Active telemetry incident alert if any */}
      {telemetry.activeAlert && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-red-200">{telemetry.activeAlert.title}</span>
              <span className="px-2 py-0.5 bg-red-500/20 text-red-300 font-mono text-[10px] rounded font-bold">
                {telemetry.activeAlert.peakMetric}
              </span>
            </div>
            <p className="text-xs text-red-100/80 mt-1 leading-relaxed">{telemetry.activeAlert.description}</p>
          </div>
        </div>
      )}

      {/* 4 Sensor Cards Grid */}
      <div className={`grid ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'} gap-3`}>
        <SensorCard sensor={telemetry.sensors.accelerometer} />
        <SensorCard sensor={telemetry.sensors.tiltmeter} />
        <SensorCard sensor={telemetry.sensors.strain_gauge} />
        <SensorCard sensor={telemetry.sensors.moisture} />
      </div>

      {/* Simulator Action Buttons */}
      {onSimulate && (
        <div className="p-3 bg-[#111111] border border-[#222222] rounded flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#A7A39A]">
            <Zap className="w-3.5 h-3.5 text-[#E5C77B]" />
            <span className="font-semibold text-[#F5F0E5]">Event Simulator:</span>
            <span className="text-[11px] hidden sm:inline">Inject real-time dynamic structural events</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSimulate('seismic')}
              className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 border border-red-600/50 rounded text-xs font-mono font-medium text-red-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate M5.2 tremor vibration & tilt spike"
            >
              <Activity className="w-3 h-3 text-red-400" />
              <span>⚡ M5.2 Seismic Shock</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulate('wind')}
              className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-600/50 rounded text-xs font-mono font-medium text-amber-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate 115 km/h gale wind sway and column microstrain"
            >
              <Wind className="w-3 h-3 text-amber-400" />
              <span>💨 115km/h Gale Wind</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulate('moisture')}
              className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-600/50 rounded text-xs font-mono font-medium text-cyan-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate basement hydrostatic moisture saturation spike"
            >
              <Waves className="w-3 h-3 text-cyan-400" />
              <span>💧 Water Ingress Spike</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulate('baseline')}
              className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-xs font-mono text-[#A7A39A] hover:text-[#F5F0E5] flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset sensors to nominal baseline"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Baseline</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
