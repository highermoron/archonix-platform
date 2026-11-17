import { AlertCircle, CheckCircle2, Info, Terminal, X } from 'lucide-react';
import type { SpatialAIResult } from '../../lib/spatialAI';
import SpatialMatchList from './SpatialMatchList';

interface SpatialResultPanelProps {
  result: SpatialAIResult;
  showSql: boolean;
  onToggleSql: () => void;
  onClear: () => void;
  onFocusBuilding: (buildingId: string) => void;
}

interface Chip {
  label: string;
  value: string;
  tone?: 'gold' | 'muted' | 'alert';
}

function buildChips(result: SpatialAIResult): Chip[] {
  const chips: Chip[] = [
    { label: 'matches', value: `${result.matches.length} / ${result.evaluated}`, tone: 'gold' },
    { label: 'execution', value: `${result.executionTimeMs} ms`, tone: 'muted' }
  ];

  const params = result.extractedParameters;
  if (params.targetLocation) chips.push({ label: 'anchor', value: params.targetLocation, tone: 'muted' });
  if (params.radiusKm) chips.push({ label: 'radius', value: `${params.radiusKm} km`, tone: 'muted' });
  if (params.bcaClass) chips.push({ label: 'class', value: params.bcaClass, tone: 'muted' });
  if (params.buildingType) chips.push({ label: 'category', value: params.buildingType, tone: 'muted' });
  if (params.minFloors) chips.push({ label: 'storeys', value: `>= ${params.minFloors}`, tone: 'muted' });
  if (params.healthFilter) chips.push({ label: 'health', value: params.healthFilter, tone: 'muted' });
  if (params.defectFilter) chips.push({ label: 'defects', value: params.defectFilter, tone: 'alert' });
  if (params.findingsWithinDays) {
    chips.push({ label: 'window', value: `${Math.round(params.findingsWithinDays / 30.44)} months`, tone: 'muted' });
  }
  if (params.telemetryFocus) chips.push({ label: 'telemetry', value: params.telemetryFocus, tone: 'alert' });

  return chips;
}

const CHIP_TONE: Record<NonNullable<Chip['tone']>, string> = {
  gold: 'text-[#E5C77B] border-[#B58B3B]/50',
  muted: 'text-[#A7A39A] border-[#2c2c2c]',
  alert: 'text-amber-200 border-amber-500/40'
};

export default function SpatialResultPanel({
  result,
  showSql,
  onToggleSql,
  onClear,
  onFocusBuilding
}: SpatialResultPanelProps) {
  const hasMatches = result.matches.length > 0;
  const chips = buildChips(result);

  return (
    <div
      className={`p-3 bg-[#121212] border rounded-lg space-y-2.5 shadow-lg ${
        hasMatches ? 'border-[#B58B3B]/50' : 'border-amber-500/40'
      }`}
    >
      <div className="flex items-start gap-2">
        {hasMatches
          ? <CheckCircle2 className="w-4 h-4 text-[#E5C77B] shrink-0 mt-0.5" />
          : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#F5F0E5] leading-relaxed">{result.summary}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chips.map(chip => (
              <span
                key={`${chip.label}-${chip.value}`}
                className={`px-1.5 py-0.5 rounded border bg-[#181818] font-mono text-[10px] ${CHIP_TONE[chip.tone ?? 'muted']}`}
              >
                {chip.label} <strong className="font-bold">{chip.value}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSql}
            className="px-2 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-[10px] font-mono text-[#E5C77B] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Terminal className="w-3 h-3" />
            <span>{showSql ? 'Hide SQL' : 'View PostGIS SQL'}</span>
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear spatial filter"
            className="p-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-[#A7A39A] hover:text-[#F5F0E5] transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {result.appliedClauses.length > 0 && (
        <p className="text-[10px] font-mono text-[#8d897f] leading-relaxed">
          <span className="text-[#B58B3B]">Interpreted as</span>{' '}
          {result.appliedClauses.join('  ·  ')}
        </p>
      )}

      {!hasMatches && result.hints.length > 0 && (
        <ul className="space-y-1 p-2 bg-amber-500/10 border border-amber-500/30 rounded">
          {result.hints.map(hint => (
            <li key={hint} className="flex items-start gap-1.5 text-[11px] text-amber-100">
              <Info className="w-3 h-3 mt-0.5 shrink-0 text-amber-300" />
              <span>{hint}</span>
            </li>
          ))}
        </ul>
      )}

      <SpatialMatchList matches={result.matches} onFocusBuilding={onFocusBuilding} />

      {!hasMatches && result.nearMisses.length > 0 && (
        <div className="p-2 rounded border border-[#2c2c2c] bg-[#101010]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#A7A39A] mb-1">
            Outside the buffer
          </p>
          <ul className="space-y-0.5">
            {result.nearMisses.slice(0, 3).map(near => (
              <li key={near.buildingId} className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#A7A39A]">
                <span className="truncate">{near.name}</span>
                <span className="shrink-0 text-amber-200">
                  {near.distanceKm.toFixed(1)} km (+{near.exceededByKm.toFixed(1)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.interpretationNotes.length > 0 && (
        <ul className="space-y-0.5">
          {result.interpretationNotes.map(note => (
            <li key={note} className="text-[10px] font-mono text-[#77736B] leading-relaxed">— {note}</li>
          ))}
        </ul>
      )}

      {showSql && (
        <div className="p-2.5 bg-[#090909] border border-[#262626] rounded font-mono text-[10px] text-emerald-400 overflow-x-auto">
          <div className="flex items-center justify-between text-[9px] uppercase text-[#A7A39A] border-b border-[#222222] pb-1 mb-1">
            <span>Read-only spatial translation</span>
            <span>PostgreSQL 16 + PostGIS 3.4</span>
          </div>
          <pre className="whitespace-pre leading-relaxed">{result.postGisSql}</pre>
        </div>
      )}
    </div>
  );
}
