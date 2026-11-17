import { useCallback, useMemo, useRef, useState } from 'react';
import type { BuildingTelemetry } from '../../types/telemetry';
import { filterPromptCategories } from '../../lib/spatialPromptLibrary';
import { processSpatialAIQuery } from '../../lib/spatialAI';
import type { SpatialAIResult, SpatialBuilding, StructuralFinding } from '../../lib/spatialAI';

interface UseSpatialCommandOptions {
  buildings: SpatialBuilding[];
  findings: StructuralFinding[];
  telemetryData?: Record<string, BuildingTelemetry>;
  onExecuteResult: (result: SpatialAIResult | null) => void;
}

export interface SpatialCommandState {
  query: string;
  setQuery: (value: string) => void;
  isProcessing: boolean;
  error: string | null;
  libraryOpen: boolean;
  openLibrary: () => void;
  closeLibrary: () => void;
  librarySearch: string;
  setLibrarySearch: (value: string) => void;
  highlightIndex: number;
  setHighlightIndex: (index: number) => void;
  categories: ReturnType<typeof filterPromptCategories>;
  totalPrompts: number;
  promptCountByLibrary: number;
  run: (text: string) => void;
  clear: () => void;
  moveHighlight: (delta: number) => void;
  runHighlighted: () => void;
}

export function useSpatialCommand({
  buildings,
  findings,
  telemetryData,
  onExecuteResult
}: UseSpatialCommandOptions): SpatialCommandState {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const requestId = useRef(0);

  const categories = useMemo(() => filterPromptCategories(librarySearch), [librarySearch]);
  const flatPrompts = useMemo(
    () => categories.flatMap(category => category.prompts),
    [categories]
  );

  const run = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setQuery(trimmed);
    setLibraryOpen(false);
    setError(null);
    setIsProcessing(true);

    void processSpatialAIQuery(trimmed, buildings, findings, telemetryData)
      .then(result => {
        if (requestId.current === currentRequest) onExecuteResult(result);
      })
      .catch((cause: unknown) => {
        if (requestId.current !== currentRequest) return;
        setError(cause instanceof Error ? cause.message : 'The spatial query could not be completed.');
      })
      .finally(() => {
        if (requestId.current === currentRequest) setIsProcessing(false);
      });
  }, [buildings, findings, telemetryData, onExecuteResult]);

  const clear = useCallback(() => {
    requestId.current += 1;
    setQuery('');
    setError(null);
    setIsProcessing(false);
    onExecuteResult(null);
  }, [onExecuteResult]);

  const moveHighlight = useCallback((delta: number) => {
    setLibraryOpen(true);
    if (flatPrompts.length === 0) return;
    setHighlightIndex(current => {
      const base = current < 0 ? 0 : current;
      const next = base + delta;
      if (next < 0) return flatPrompts.length - 1;
      if (next >= flatPrompts.length) return 0;
      return next;
    });
  }, [flatPrompts.length]);

  const runHighlighted = useCallback(() => {
    const prompt = flatPrompts[highlightIndex];
    if (prompt) run(prompt.text);
    else if (query.trim()) run(query);
  }, [flatPrompts, highlightIndex, query, run]);

  return {
    query,
    setQuery,
    isProcessing,
    error,
    libraryOpen,
    openLibrary: () => setLibraryOpen(true),
    closeLibrary: () => setLibraryOpen(false),
    librarySearch,
    setLibrarySearch: (value: string) => {
      setLibrarySearch(value);
      setHighlightIndex(0);
    },
    highlightIndex,
    setHighlightIndex,
    categories,
    totalPrompts: flatPrompts.length,
    promptCountByLibrary: flatPrompts.length,
    run,
    clear,
    moveHighlight,
    runHighlighted
  };
}
