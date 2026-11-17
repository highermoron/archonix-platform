import { AlertTriangle, MapPin, Radio } from 'lucide-react';
import type { SpatialMatch } from '../../lib/spatialAI';

interface SpatialMatchListProps {
  matches: SpatialMatch[];
  onFocusBuilding: (buildingId: string) => void;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-500/15 border-red-500/40 text-red-300',
  high: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
  moderate: 'bg-sky-500/15 border-sky-500/40 text-sky-200',
  low: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
};

function formatDetected(detectedAt: string | null): string {
  if (!detectedAt) return 'undated';
  const parsed = new Date(detectedAt);
  return Number.isNaN(parsed.getTime()) ? 'undated' : parsed.toLocaleDateString();
}

export default function SpatialMatchList({ matches, onFocusBuilding }: SpatialMatchListProps) {
  if (matches.length === 0) return null;

  const [headline, ...rest] = matches;

  return (
    <div className="space-y-2">
      <div className="p-2.5 bg-[#101010] border border-[#B58B3B]/40 rounded space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#F5F0E5] leading-snug">{headline.name}</p>
            <p className="text-[10px] text-[#A7A39A] flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-[#B58B3B]" />
              {headline.location}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onFocusBuilding(headline.buildingId)}
            className="shrink-0 px-2 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-[10px] font-mono text-[#E5C77B] transition-colors cursor-pointer"
          >
            Center map
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-[#1b1b1b] border border-[#2c2c2c] text-[#A7A39A]">
            {headline.bcaClass} (derived)
          </span>
          {headline.floors !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-[#1b1b1b] border border-[#2c2c2c] text-[#A7A39A]">
              {headline.floors} storeys
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-[#1b1b1b] border border-[#2c2c2c] text-[#E5C77B]">
            health {headline.healthIndex !== undefined ? `${headline.healthIndex}%` : 'n/a'}
          </span>
          {headline.distanceKm !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-[#1b1b1b] border border-[#2c2c2c] text-[#A7A39A]">
              {headline.distanceKm.toFixed(1)} km
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-[#B58B3B]/15 border border-[#B58B3B]/40 text-[#E5C77B]">
            {headline.status}
          </span>
        </div>

        {headline.telemetryHeadline && (
          <p className="flex items-start gap-1.5 text-[10px] font-mono text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            <Radio className="w-3 h-3 mt-0.5 shrink-0 animate-pulse" />
            <span>{headline.telemetryHeadline}</span>
          </p>
        )}

        {headline.primaryDefect ? (
          <div className={`p-2 rounded border text-[11px] ${SEVERITY_STYLE[headline.primaryDefect.severity] ?? SEVERITY_STYLE.low}`}>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase">
              <span className="flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3 h-3" />
                {headline.primaryDefect.label}
              </span>
              <span>
                {headline.primaryDefect.severity}
                {headline.primaryDefect.isResolved ? ' · resolved' : ' · open'}
              </span>
            </div>
            <p className="mt-1 text-[#F5F0E5] leading-snug">{headline.primaryDefect.note}</p>
            <p className="mt-1 text-[10px] font-mono opacity-80">
              {headline.primaryDefect.location} · recorded {formatDetected(headline.primaryDefect.detectedAt)}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-[#A7A39A]">No recorded structural finding on this asset.</p>
        )}
      </div>

      {rest.length > 0 && (
        <ul className="space-y-1">
          {rest.slice(0, 5).map(match => (
            <li key={match.buildingId}>
              <button
                type="button"
                onClick={() => onFocusBuilding(match.buildingId)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#101010] border border-[#262626] hover:border-[#B58B3B]/50 rounded text-left transition-colors cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-[#F5F0E5] truncate">{match.name}</span>
                  <span className="block text-[10px] font-mono text-[#A7A39A] truncate">
                    {match.primaryDefect ? match.primaryDefect.label : 'no recorded finding'}
                    {match.distanceKm !== undefined ? ` · ${match.distanceKm.toFixed(1)} km` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-mono text-[#E5C77B]">
                  {match.healthIndex !== undefined ? `${match.healthIndex}%` : '—'}
                </span>
              </button>
            </li>
          ))}
          {rest.length > 5 && (
            <li className="text-[10px] font-mono text-[#77736B] px-1">
              + {rest.length - 5} more matched assets
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
