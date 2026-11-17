import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CornerDownLeft, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { BuildingTelemetry } from '../../types/telemetry';
import type { SpatialAIResult, SpatialBuilding, StructuralFinding } from '../../lib/spatialAI';
import { buildStructuralFindings } from '../../lib/spatial/defects';
import { useSpatialCommand } from './useSpatialCommand';
import SpatialPromptLibrary from './SpatialPromptLibrary';
import SpatialResultPanel from './SpatialResultPanel';

export interface SpatialCommandBarProps {
  buildings: SpatialBuilding[];
  findings?: StructuralFinding[];
  telemetryData?: Record<string, BuildingTelemetry>;
  onExecuteResult: (result: SpatialAIResult | null) => void;
  activeResult: SpatialAIResult | null;
  onFocusBuilding?: (buildingId: string) => void;
}

export default function SpatialCommandBar({
  buildings,
  findings,
  telemetryData,
  onExecuteResult,
  activeResult,
  onFocusBuilding
}: SpatialCommandBarProps) {
  const [showSql, setShowSql] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Derive findings from buildings if not provided explicitly
  const resolvedFindings = useMemo(() => {
    if (findings && findings.length > 0) return findings;
    return buildStructuralFindings(buildings, []);
  }, [buildings, findings]);

  const cmd = useSpatialCommand({
    buildings,
    findings: resolvedFindings,
    telemetryData,
    onExecuteResult
  });

  // Global keyboard shortcut: Cmd+K / Ctrl+K opens and focuses the command bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        cmd.openLibrary();
      }
      if (e.key === 'Escape') {
        cmd.closeLibrary();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cmd]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmd.moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmd.moveHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cmd.libraryOpen && cmd.totalPrompts > 0) {
        cmd.runHighlighted();
      } else if (cmd.query.trim()) {
        cmd.run(cmd.query);
      }
    } else if (e.key === 'Escape') {
      cmd.closeLibrary();
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Floating Conversational Command Bar */}
      <div className="relative isolate z-[600] rounded-lg border border-[#B58B3B]/40 bg-[#121212]/95 backdrop-blur-md shadow-2xl transition-all duration-200 focus-within:border-[#E5C77B] focus-within:ring-1 focus-within:ring-[#E5C77B]/40">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (cmd.query.trim()) cmd.run(cmd.query);
          }}
          className="flex items-center gap-2.5 px-3.5 py-2.5"
        >
          {/* AI Sparkle Icon / Loading Indicator */}
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#B58B3B]/15 text-[#E5C77B] shrink-0 border border-[#B58B3B]/30">
            {cmd.isProcessing ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#E5C77B] border-t-transparent animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#E5C77B]" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={cmd.query}
            onChange={(e) => cmd.setQuery(e.target.value)}
            onFocus={cmd.openLibrary}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask your map in plain English... e.g. 'Show Class 2 high-rises within 15 km of Sydney Harbour with unresolved cracks'"
            className="flex-1 bg-transparent text-xs sm:text-sm text-[#F5F0E5] placeholder-[#777777] outline-none font-sans"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Clear Query Button */}
            {cmd.query && (
              <button
                type="button"
                onClick={cmd.clear}
                className="p-1 rounded text-[#777777] hover:text-[#F5F0E5] hover:bg-[#222222] transition-colors cursor-pointer"
                title="Clear query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Prompt Library Toggle Pill */}
            <button
              type="button"
              onClick={() => (cmd.libraryOpen ? cmd.closeLibrary() : cmd.openLibrary())}
              className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 border transition-colors cursor-pointer ${
                cmd.libraryOpen
                  ? 'bg-[#B58B3B]/20 border-[#B58B3B]/60 text-[#E5C77B]'
                  : 'bg-[#181818] border-[#2c2c2c] text-[#A7A39A] hover:text-[#F5F0E5] hover:border-[#3a3a3a]'
              }`}
              title="Browse prompt library"
            >
              <span>Prompts</span>
              <span className="px-1 py-0.2 rounded bg-[#252525] text-[9px] text-[#E5C77B] font-bold">
                {cmd.totalPrompts}
              </span>
              {cmd.libraryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Execute Query Button */}
            <button
              type="submit"
              disabled={!cmd.query.trim() || cmd.isProcessing}
              className="px-2.5 py-1.5 bg-[#E5C77B] hover:bg-[#B58B3B] disabled:opacity-40 text-[#090909] font-semibold text-xs rounded transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Query</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>

            {/* Shortcut badge */}
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-[#333333] bg-[#1a1a1a] text-[10px] font-mono text-[#777777]">
              ⌘K
            </span>
          </div>
        </form>

        {/* Categorized Prompt Library Dropdown */}
        {cmd.libraryOpen && (
          <SpatialPromptLibrary
            categories={cmd.categories}
            highlightIndex={cmd.highlightIndex}
            onHighlight={cmd.setHighlightIndex}
            onSelect={(prompt) => cmd.run(prompt.text)}
            search={cmd.librarySearch}
            onSearchChange={cmd.setLibrarySearch}
            totalPrompts={cmd.totalPrompts}
          />
        )}
      </div>

      {/* Error message banner if query failed */}
      {cmd.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-200">
          {cmd.error}
        </div>
      )}

      {/* Active AI Query Result Panel (Matches, Clauses, Near-Misses, PostGIS SQL) */}
      {activeResult && (
        <SpatialResultPanel
          result={activeResult}
          showSql={showSql}
          onToggleSql={() => setShowSql((prev) => !prev)}
          onClear={cmd.clear}
          onFocusBuilding={onFocusBuilding ?? (() => {})}
        />
      )}
    </div>
  );
}
