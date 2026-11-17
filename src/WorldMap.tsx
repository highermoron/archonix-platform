import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  Compass, Cpu, Globe, Layers, Maximize2, MapPin, X, Activity,
  Radio, Zap, Wind, Waves, RotateCcw, AlertTriangle, Play, Pause, ChevronRight
} from 'lucide-react';
import type { BuildingTelemetry, SimulationPreset } from './types/telemetry';
import SpatialCommandBar from './components/SpatialCommandBar';
import type { SpatialAIResult } from './lib/spatialAI';
import { buildStructuralFindings } from './lib/spatial/defects';
import type { FindingSourceRecord } from './lib/spatial/defects';

// Only the fields the map needs. Your Building type from App.tsx fits this shape.
export type MapBuilding = {
  id: string;
  name: string;
  location: string;
  type: string;
  status: 'Low Concern' | 'Inspection Recommended' | 'Monitoring Required' | 'Urgent Assessment';
  healthIndex?: number;
  lastScanDate: string;
  lat?: number;
  lng?: number;
};

type Status = MapBuilding['status'];

type WorldMapProps = {
  buildings: MapBuilding[];
  scans?: FindingSourceRecord[];
  onScan: (buildingId: string) => void;
  onMemory: (buildingId: string) => void;
  canScan?: boolean;
  selectedBuildingId?: string;
  onSelectBuilding?: (building: MapBuilding) => void;
  onMapClick?: (lat: number, lng: number) => void;
  telemetryData?: Record<string, BuildingTelemetry>;
  isStreamingTelemetry?: boolean;
  onToggleStreamingTelemetry?: () => void;
  onSimulateTelemetry?: (preset: SimulationPreset, buildingId?: string) => void;
  onOpenTelemetryMonitor?: (buildingId: string) => void;
};

const STATUS_COLORS: Record<Status, string> = {
  'Low Concern': '#34d399',
  'Inspection Recommended': '#f59e0b',
  'Monitoring Required': '#60a5fa',
  'Urgent Assessment': '#f87171',
};

const ALL_STATUSES = Object.keys(STATUS_COLORS) as Status[];

const MAP_CSS = `
  .leaflet-container { background: #0d0d0d; font-family: inherit; }
  .archonix-pin { background: transparent; border: 0; position: relative; }
  .archonix-pin__dot {
    display: block; width: 16px; height: 16px; margin: 3px;
    border-radius: 9999px; background: var(--pin);
    border: 2px solid #090909;
    box-shadow: 0 0 0 2px var(--pin), 0 0 14px var(--pin);
    transition: transform 0.2s ease;
  }
  .archonix-pin:hover .archonix-pin__dot,
  .archonix-pin--selected .archonix-pin__dot { transform: scale(1.4); }
  .archonix-pin__dot--urgent { animation: archonix-pulse 1.8s ease-out infinite; }
  .archonix-pin__dot--telemetry-critical {
    background: #ef4444 !important;
    animation: archonix-radar-critical 1.1s cubic-bezier(0, 0, 0.2, 1) infinite !important;
  }
  .archonix-pin__dot--telemetry-warning {
    background: #f59e0b !important;
    animation: archonix-radar-warning 1.6s ease-out infinite !important;
  }
  @keyframes archonix-pulse {
    0%   { box-shadow: 0 0 0 2px var(--pin), 0 0 0 2px var(--pin); }
    100% { box-shadow: 0 0 0 2px var(--pin), 0 0 0 18px transparent; }
  }
  @keyframes archonix-radar-critical {
    0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.95), 0 0 12px rgba(239, 68, 68, 0.85); }
    50%  { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0.4), 0 0 22px rgba(239, 68, 68, 0.6); }
    100% { box-shadow: 0 0 0 28px rgba(239, 68, 68, 0), 0 0 6px rgba(239, 68, 68, 0.2); }
  }
  @keyframes archonix-radar-warning {
    0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.85); }
    100% { box-shadow: 0 0 0 18px rgba(245, 158, 11, 0); }
  }
  .archonix-pin__telemetry-badge {
    position: absolute;
    top: -24px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 9px;
    font-weight: 700;
    font-family: monospace;
    padding: 2px 6px;
    border-radius: 4px;
    background: #dc2626;
    color: #ffffff;
    border: 1px solid #fca5a5;
    box-shadow: 0 2px 10px rgba(0,0,0,0.8);
    pointer-events: none;
    z-index: 1000;
    animation: archonix-bounce 1.4s infinite;
  }
  @keyframes archonix-bounce {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(-3px); }
  }
  .archonix-tooltip {
    background: #191919; color: #F5F0E5; border: 1px solid #B58B3B;
    border-radius: 4px; font-size: 11px; box-shadow: none;
  }
  .archonix-tooltip.leaflet-tooltip-top:before { border-top-color: #B58B3B; }
  .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgb(181 139 59 / 35%) !important; }
  .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
    background-color: #E5C77B; color: #090909; font: 700 12px/30px monospace;
  }
  .archonix-pin__dot--ai-match {
    box-shadow: 0 0 0 3px #E5C77B, 0 0 24px #E5C77B !important;
    transform: scale(1.4) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .archonix-pin__dot--urgent,
    .archonix-pin__dot--telemetry-critical,
    .archonix-pin__dot--telemetry-warning { animation: none; }
    .archonix-pin__dot { transition: none; }
  }
`;

export default function WorldMap({
  buildings,
  scans,
  onScan,
  onMemory,
  canScan = true,
  selectedBuildingId,
  onSelectBuilding,
  onMapClick,
  telemetryData,
  isStreamingTelemetry = true,
  onToggleStreamingTelemetry,
  onSimulateTelemetry,
  onOpenTelemetryMonitor,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onMapClickRef = useRef(onMapClick);
  const onSelectBuildingRef = useRef(onSelectBuilding);
  const previousSelectedIdRef = useRef<string | null>(selectedBuildingId ?? null);

  const [selection, setSelection] = useState({
    propId: selectedBuildingId ?? null,
    id: selectedBuildingId ?? null,
  });
  const selectedId = selection.propId === (selectedBuildingId ?? null)
    ? selection.id
    : selectedBuildingId ?? null;
  const setSelectedId = useCallback((id: string | null) => {
    setSelection({ propId: selectedBuildingId ?? null, id });
  }, [selectedBuildingId]);
  const [pickedCoordinates, setPickedCoordinates] = useState<L.LatLngTuple | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(new Set(ALL_STATUSES));
  const [activeSpatialResult, setActiveSpatialResult] = useState<SpatialAIResult | null>(null);

  const plotted = useMemo(
    () => buildings.filter((b) =>
      typeof b.lat === 'number' && Number.isFinite(b.lat) && b.lat >= -90 && b.lat <= 90
      && typeof b.lng === 'number' && Number.isFinite(b.lng) && b.lng >= -180 && b.lng <= 180
    ),
    [buildings]
  );
  const visible = useMemo(() => {
    let list = plotted.filter((b) => activeStatuses.has(b.status));
    if (activeSpatialResult && activeSpatialResult.matchedBuildingIds.length > 0) {
      list = list.filter((b) => activeSpatialResult.matchedBuildingIds.includes(b.id));
    }
    return list;
  }, [plotted, activeStatuses, activeSpatialResult]);

  const handleSpatialResult = useCallback((result: SpatialAIResult | null) => {
    setActiveSpatialResult(result);
    if (!result) return;

    const map = mapRef.current;
    if (!map) return;

    if (result.matchedBuildingIds.length === 1) {
      const match = plotted.find(b => b.id === result.matchedBuildingIds[0]);
      if (match && typeof match.lat === 'number' && typeof match.lng === 'number') {
        setSelectedId(match.id);
        map.flyTo([match.lat, match.lng], 14, { duration: 1.5 });
      }
    } else if (result.matchedBuildingIds.length > 1) {
      const matches = plotted.filter(b => result.matchedBuildingIds.includes(b.id));
      const bounds = L.latLngBounds(
        matches.map(b => [b.lat as number, b.lng as number] as L.LatLngTuple)
      );
      map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 14, duration: 1.5 });
    } else if (result.suggestedCenter) {
      map.flyTo(result.suggestedCenter, result.suggestedZoom || 12, { duration: 1.5 });
    }
  }, [plotted, setSelectedId]);
  const selected = visible.find((b) => b.id === selectedId) ?? null;
  const unplottedCount = buildings.length - plotted.length;

  const selectedTelemetry = selected && telemetryData ? telemetryData[selected.id] : undefined;

  // Count telemetry critical alerts across plotted portfolio
  const criticalTelemetryCount = useMemo(() => {
    if (!telemetryData) return 0;
    return Object.values(telemetryData).filter(t => t.overallStatus === 'critical').length;
  }, [telemetryData]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onSelectBuildingRef.current = onSelectBuilding;
  }, [onSelectBuilding]);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const markers = markersRef.current;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      worldCopyJump: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.leaflet-marker-icon, .leaflet-popup')) return;

      const lat = Number(event.latlng.lat.toFixed(6));
      const lng = Number(event.latlng.lng.toFixed(6));
      setPickedCoordinates([lat, lng]);
      onMapClickRef.current?.(lat, lng);
    });

    layerRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      showCoverageOnHover: false,
    }).addTo(map);
    mapRef.current = map;

    // Keep tiles correct when the sidebar opens/closes or the window resizes.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Show the whole portfolio on the initial view and whenever its coordinates change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || plotted.length === 0) return;

    const bounds = L.latLngBounds(
      plotted.map((building) => [building.lat as number, building.lng as number] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [plotted]);

  // Draw one pin per visible building with live telemetry indicators.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    visible.forEach((b) => {
      const lat = b.lat as number;
      const lng = b.lng as number;
      const bldTelemetry = telemetryData ? telemetryData[b.id] : undefined;
      const isCriticalTelemetry = bldTelemetry?.overallStatus === 'critical';
      const isWarningTelemetry = bldTelemetry?.overallStatus === 'warning';
      const isAiMatch = Boolean(activeSpatialResult?.matchedBuildingIds.includes(b.id));

      let pulseClass = '';
      if (isCriticalTelemetry) {
        pulseClass = ' archonix-pin__dot--telemetry-critical';
      } else if (isWarningTelemetry) {
        pulseClass = ' archonix-pin__dot--telemetry-warning';
      } else if (isAiMatch) {
        pulseClass = ' archonix-pin__dot--ai-match';
      } else if (b.status === 'Urgent Assessment') {
        pulseClass = ' archonix-pin__dot--urgent';
      }

      let badgeHtml = '';
      if (isCriticalTelemetry && bldTelemetry?.activeAlert?.peakMetric) {
        badgeHtml = `<div class="archonix-pin__telemetry-badge">⚡ ${bldTelemetry.activeAlert.peakMetric}</div>`;
      } else if (isAiMatch && activeSpatialResult && activeSpatialResult.matchedBuildingIds.length <= 4) {
        badgeHtml = `<div class="archonix-pin__telemetry-badge" style="background:#B58B3B; border-color:#E5C77B;">✨ MATCH</div>`;
      }

      const icon = L.divIcon({
        className: 'archonix-pin',
        html: `${badgeHtml}<span class="archonix-pin__dot${pulseClass}" style="--pin:${STATUS_COLORS[b.status]}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon, title: b.name, keyboard: true });

      // Rich tooltip showing building name and real-time telemetry metrics
      const tip = document.createElement('div');
      tip.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 2px;">${b.name}</div>
        ${bldTelemetry ? `
          <div style="font-size: 10px; font-family: monospace; color: ${isCriticalTelemetry ? '#f87171' : isWarningTelemetry ? '#fbbf24' : '#34d399'};">
            ${isCriticalTelemetry ? `⚠️ ${bldTelemetry.activeAlert?.peakMetric || 'Critical Sensor Breach'}` : `⚡ ${bldTelemetry.sensors.accelerometer.value}g • ${bldTelemetry.sensors.tiltmeter.value}°`}
          </div>
        ` : ''}
      `;
      marker.bindTooltip(tip, { direction: 'top', offset: [0, -10], className: 'archonix-tooltip' });

      marker.on('click', () => {
        setSelectedId(b.id);
        onSelectBuildingRef.current?.(b);
      });

      marker.addTo(layer);
      markersRef.current.set(b.id, marker);
    });
  }, [visible, telemetryData, activeSpatialResult, setSelectedId]);

  // Highlight the selected pin.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('archonix-pin--selected', id === selectedId);
    });
  }, [selectedId, visible]);

  useEffect(() => {
    if (previousSelectedIdRef.current === selectedId) return;
    previousSelectedIdRef.current = selectedId;

    const building = visible.find(item => item.id === selectedId);
    if (!building) return;
    const map = mapRef.current;
    if (map) map.flyTo([building.lat as number, building.lng as number], Math.max(map.getZoom(), 6), { duration: 1.2 });
  }, [selectedId, visible]);

  const focusBuilding = (b: MapBuilding) => {
    setSelectedId(b.id);
    onSelectBuildingRef.current?.(b);
    const map = mapRef.current;
    if (map) map.flyTo([b.lat as number, b.lng as number], Math.max(map.getZoom(), 6), { duration: 1.2 });
  };

  const findings = useMemo(() => {
    return buildStructuralFindings(buildings, scans || []);
  }, [buildings, scans]);

  const handleFocusBuildingById = useCallback((buildingId: string) => {
    const b = plotted.find(item => item.id === buildingId);
    if (b) focusBuilding(b);
  }, [plotted]);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map || visible.length === 0) return;
    const bounds = L.latLngBounds(
      visible.map((b) => [b.lat as number, b.lng as number] as L.LatLngTuple)
    );
    map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 5, duration: 1.2 });
  };

  const worldView = () => {
    mapRef.current?.flyTo([20, 10], 2, { duration: 1.2 });
  };

  const toggleStatus = (status: Status) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <style>{MAP_CSS}</style>

      {/* Conversational Spatial AI Command Bar ("Talk to Your Map") */}
      <SpatialCommandBar
        buildings={plotted}
        findings={findings}
        telemetryData={telemetryData}
        activeResult={activeSpatialResult}
        onExecuteResult={handleSpatialResult}
        onFocusBuilding={handleFocusBuildingById}
      />

      {/* Top IoT Structural Health Telemetry & Event Simulator HUD */}
      <div className="p-3.5 bg-[#141414] border border-[#222222] rounded flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isStreamingTelemetry ? 'text-emerald-400 animate-pulse' : 'text-[#777777]'}`} />
            <span className="text-xs font-bold text-[#F5F0E5] tracking-wide">LIVE IOT TELEMETRY FEED</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span className="text-[#A7A39A]">|</span>
            <span className={criticalTelemetryCount > 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-medium'}>
              {criticalTelemetryCount > 0 ? `⚠️ ${criticalTelemetryCount} SENSOR ALERTS ACTIVE` : 'ALL SENSORS NOMINAL'}
            </span>
          </div>
        </div>

        {/* Event Simulator Quick Triggers */}
        {onSimulateTelemetry && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-[#A7A39A] hidden md:inline">Simulate Event:</span>
            <button
              type="button"
              onClick={() => onSimulateTelemetry('seismic')}
              className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 border border-red-700/50 rounded text-xs font-mono text-red-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate M5.2 Seismic Shockwave (0.285g peak vibration)"
            >
              <Activity className="w-3 h-3 text-red-400" />
              <span>⚡ M5.2 Tremor</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('wind')}
              className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-700/50 rounded text-xs font-mono text-amber-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate 115 km/h Gale Wind Gust (640 με strain)"
            >
              <Wind className="w-3 h-3 text-amber-400" />
              <span>💨 115km/h Wind</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('moisture')}
              className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/50 rounded text-xs font-mono text-cyan-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Simulate Basement Hydrostatic Water Ingress"
            >
              <Waves className="w-3 h-3 text-cyan-400" />
              <span>💧 Ingress Spill</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('baseline')}
              className="px-2 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-xs font-mono text-[#A7A39A] hover:text-[#F5F0E5] flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset sensors to nominal baseline"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            {onToggleStreamingTelemetry && (
              <button
                type="button"
                onClick={onToggleStreamingTelemetry}
                className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-xs text-[#E5C77B] flex items-center gap-1 transition-colors cursor-pointer"
              >
                {isStreamingTelemetry ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span className="hidden sm:inline">{isStreamingTelemetry ? 'Pause' : 'Stream'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters and view controls */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="w-full text-xs text-[#A7A39A]" role="status">
          Click anywhere on the map to set coordinates for a new building.
          {pickedCoordinates && (
            <span className="ml-1 font-mono text-[#E5C77B]">
              Selected: {pickedCoordinates[0]}, {pickedCoordinates[1]}
            </span>
          )}
        </p>
        {ALL_STATUSES.map((status) => {
          const on = activeStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={on}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs transition-colors ${
                on
                  ? 'bg-[#191919] border-[#B58B3B]/40 text-[#F5F0E5]'
                  : 'bg-transparent border-[#222222] text-[#A7A39A] hover:text-[#F5F0E5]'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status], opacity: on ? 1 : 0.35 }}
              />
              {status}
            </button>
          );
        })}

        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={fitAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit all assets</span>
          </button>
          <button
            type="button"
            onClick={worldView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>World view</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3 relative isolate rounded border border-[#222222] overflow-hidden bg-[#0d0d0d]">
          <div ref={containerRef} className="h-[64vh] min-h-[460px] w-full cursor-crosshair" />

          {visible.length === 0 && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
              <p className="px-4 py-2 bg-[#191919]/90 border border-[#222222] rounded text-xs text-[#A7A39A]">
                No assets match the selected statuses.
              </p>
            </div>
          )}

          {/* Selected Building Card with Integrated Live IoT Telemetry Drawer */}
          {selected && (
            <div className="absolute left-3 right-3 bottom-6 sm:right-auto sm:w-96 z-[500] p-4 bg-[#141414]/95 border border-[#B58B3B]/50 rounded space-y-3.5 backdrop-blur-md shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-[#F5F0E5] leading-snug">{selected.name}</h3>
                    {selectedTelemetry?.overallStatus === 'critical' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                        CRITICAL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A7A39A] mt-0.5">{selected.location}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close details"
                  className="shrink-0 text-[#A7A39A] hover:text-[#F5F0E5]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status and Health row */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[selected.status] }}
                  />
                  <span className="text-[#F5F0E5]">{selected.status}</span>
                </div>
                <span className="font-mono text-[11px] text-[#A7A39A]">
                  Health: <strong className="text-[#E5C77B]">{selected.healthIndex != null ? `${selected.healthIndex}%` : 'N/A'}</strong>
                </span>
              </div>

              {/* Live Telemetry Ticker / Gauge Strip */}
              {selectedTelemetry && (
                <div className="p-3 bg-[#0a0a0a] border border-[#222222] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedTelemetry.overallStatus === 'critical' ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
                      <span className="text-[11px] font-bold text-[#F5F0E5] tracking-wide">LIVE SENSOR TELEMETRY</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#A7A39A]">{selectedTelemetry.lastUpdated}</span>
                  </div>

                  {selectedTelemetry.activeAlert && (
                    <div className="p-2 bg-red-500/15 border border-red-500/30 rounded text-[11px] text-red-200">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                        <span>{selectedTelemetry.activeAlert.title}</span>
                      </div>
                      <div className="text-[10px] text-red-300/80 mt-0.5 font-mono">
                        Peak: {selectedTelemetry.activeAlert.peakMetric}
                      </div>
                    </div>
                  )}

                  {/* 4 Sensor Micro-Gauges */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 bg-[#141414] rounded border border-[#222222]">
                      <div className="text-[#A7A39A] text-[9px] flex items-center gap-1">
                        <Activity className="w-2.5 h-2.5 text-[#E5C77B]" /> VIBRATION
                      </div>
                      <div className={`text-sm font-bold ${selectedTelemetry.sensors.accelerometer.status === 'critical' ? 'text-red-400' : 'text-[#F5F0E5]'}`}>
                        {selectedTelemetry.sensors.accelerometer.value} {selectedTelemetry.sensors.accelerometer.unit}
                      </div>
                    </div>

                    <div className="p-2 bg-[#141414] rounded border border-[#222222]">
                      <div className="text-[#A7A39A] text-[9px] flex items-center gap-1">
                        <Compass className="w-2.5 h-2.5 text-blue-400" /> TILT
                      </div>
                      <div className={`text-sm font-bold ${selectedTelemetry.sensors.tiltmeter.status === 'critical' ? 'text-red-400' : 'text-[#F5F0E5]'}`}>
                        {selectedTelemetry.sensors.tiltmeter.value} {selectedTelemetry.sensors.tiltmeter.unit}
                      </div>
                    </div>

                    <div className="p-2 bg-[#141414] rounded border border-[#222222]">
                      <div className="text-[#A7A39A] text-[9px] flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-amber-400" /> STRAIN
                      </div>
                      <div className={`text-sm font-bold ${selectedTelemetry.sensors.strain_gauge.status === 'critical' ? 'text-red-400' : 'text-[#F5F0E5]'}`}>
                        {selectedTelemetry.sensors.strain_gauge.value} {selectedTelemetry.sensors.strain_gauge.unit}
                      </div>
                    </div>

                    <div className="p-2 bg-[#141414] rounded border border-[#222222]">
                      <div className="text-[#A7A39A] text-[9px] flex items-center gap-1">
                        <Waves className="w-2.5 h-2.5 text-cyan-400" /> MOISTURE
                      </div>
                      <div className={`text-sm font-bold ${selectedTelemetry.sensors.moisture.status === 'critical' ? 'text-red-400' : 'text-[#F5F0E5]'}`}>
                        {selectedTelemetry.sensors.moisture.value} {selectedTelemetry.sensors.moisture.unit}
                      </div>
                    </div>
                  </div>

                  {onOpenTelemetryMonitor && (
                    <button
                      type="button"
                      onClick={() => onOpenTelemetryMonitor(selected.id)}
                      className="w-full mt-1 py-1.5 bg-[#1c1c1c] hover:bg-[#252525] border border-[#333333] rounded text-[11px] font-mono text-[#E5C77B] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Full Telemetry Diagnostics</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-[#222222]">
                {canScan && (
                  <button
                    type="button"
                    onClick={() => onScan(selected.id)}
                    className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Record Inspection</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onMemory(selected.id)}
                  className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Memory™</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Asset list with real-time telemetry indicators */}
        <aside className="p-4 bg-[#191919] border border-[#222222] rounded lg:max-h-[calc(64vh+2px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-[#F5F0E5]">Assets on the map</h3>
            <span className="text-[10px] font-mono text-[#E5C77B] bg-[#222222] px-2 py-0.5 rounded">
              {plotted.length} tracked
            </span>
          </div>
          <p className="text-xs text-[#A7A39A] mb-3">
            {visible.length} of {plotted.length} shown
          </p>

          <ul className="space-y-2">
            {visible.map((b) => {
              const bldTelemetry = telemetryData ? telemetryData[b.id] : undefined;
              const isCrit = bldTelemetry?.overallStatus === 'critical';
              const isWarn = bldTelemetry?.overallStatus === 'warning';

              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => focusBuilding(b)}
                    className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer ${
                      b.id === selectedId
                        ? 'bg-[#B58B3B]/15 border-[#B58B3B]/40'
                        : isCrit
                          ? 'bg-red-950/20 border-red-700/40 hover:border-red-500'
                          : 'bg-[#090909] border-[#222222] hover:border-[#B58B3B]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`mt-1 w-2.5 h-2.5 shrink-0 rounded-full ${isCrit ? 'bg-red-500 animate-ping' : ''}`}
                          style={{ backgroundColor: isCrit ? '#ef4444' : STATUS_COLORS[b.status] }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#F5F0E5] truncate">{b.name}</div>
                          <div className="text-[11px] text-[#A7A39A] truncate">{b.location}</div>
                        </div>
                      </div>

                      {/* Micro Telemetry badge */}
                      {bldTelemetry && (
                        <div className="shrink-0 text-right font-mono">
                          <div className={`text-[10px] font-bold ${isCrit ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-[#A7A39A]'}`}>
                            {isCrit ? '⚡ ALERT' : `${bldTelemetry.sensors.accelerometer.value}g`}
                          </div>
                          <div className="text-[9px] text-[#777777]">
                            {bldTelemetry.sensors.tiltmeter.value}°
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {unplottedCount > 0 && (
            <p className="flex items-start gap-2 mt-4 pt-3 border-t border-[#222222] text-[11px] text-[#A7A39A]">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {unplottedCount} {unplottedCount === 1 ? 'building has' : 'buildings have'} no coordinates yet,
                so {unplottedCount === 1 ? 'it is' : 'they are'} not shown.
              </span>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
