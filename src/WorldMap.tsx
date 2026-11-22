import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  Compass, Cpu, Globe, Layers, Maximize2, MapPin, X, Activity,
  Radio, Zap, Wind, Waves, RotateCcw, AlertTriangle, Play, Pause,
  ChevronRight, Crosshair, Plus, CheckCircle2, Satellite, Map as MapIcon
} from 'lucide-react';
import type { BuildingTelemetry, SimulationPreset } from './types/telemetry';
import SpatialCommandBar from './components/SpatialCommandBar';
import type { SpatialAIResult } from './lib/spatialAI';
import { buildStructuralFindings } from './lib/spatial/defects';
import type { FindingSourceRecord } from './lib/spatial/defects';

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

export type NewPinPayload = {
  name: string;
  location: string;
  type: string;
  lat: number;
  lng: number;
  incidentNote?: string;
};

type Status = MapBuilding['status'];
type BaseLayerType = 'street' | 'satellite' | 'dark';

type WorldMapProps = {
  buildings: MapBuilding[];
  scans?: FindingSourceRecord[];
  onScan: (buildingId: string) => void;
  onMemory: (buildingId: string) => void;
  canScan?: boolean;
  selectedBuildingId?: string;
  onSelectBuilding?: (building: MapBuilding) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onCreatePin?: (payload: NewPinPayload) => Promise<void> | void;
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

const TILE_LAYERS: Record<BaseLayerType, { url: string; attribution: string; label: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    label: 'Satellite',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    label: 'Tactical Dark',
  },
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    label: 'Street',
  },
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
  .archonix-target-pin {
    background: transparent;
    border: 0;
  }
  .archonix-target-pin__reticle {
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: 2px solid #E5C77B;
    background: rgba(229, 199, 123, 0.22);
    box-shadow: 0 0 20px rgba(229, 199, 123, 0.9), inset 0 0 8px rgba(229, 199, 123, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    animation: archonix-target-pulse 1.5s infinite;
  }
  .archonix-target-pin__core {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: #ffffff;
    border: 2px solid #090909;
  }
  @keyframes archonix-target-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.12); }
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
  onCreatePin,
  telemetryData,
  isStreamingTelemetry = true,
  onToggleStreamingTelemetry,
  onSimulateTelemetry,
  onOpenTelemetryMonitor,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.MarkerClusterGroup | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const markersRef = useRef>(new Map());
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

  const [baseLayer, setBaseLayer] = useState<BaseLayerType>('satellite');
  const [pickedCoordinates, setPickedCoordinates] = useState<L.LatLngTuple | null>(null);
  const [isRegisterDrawerOpen, setIsRegisterDrawerOpen] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newBuildingLocation, setNewBuildingLocation] = useState('');
  const [newBuildingType, setNewBuildingType] = useState('Commercial');
  const [newIncidentNote, setNewIncidentNote] = useState('');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);

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

  // Reverse-geocode clicked/dragged pin so user doesn't need to type a street address
  const resolveSuburbFromCoords = useCallback(async (lat: number, lng: number) => {
    setIsDetectingLocation(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );
      const data = await res.json();
      const locality =
        data.address?.suburb ||
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.county ||
        '';
      const state = data.address?.state || data.address?.country || '';
      const postcode = data.address?.postcode || '';
      const resolved = [locality, state, postcode].filter(Boolean).join(' ');
      if (resolved) {
        setNewBuildingLocation(resolved);
      } else {
        setNewBuildingLocation(`GPS Sector (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    } catch {
      setNewBuildingLocation(`GPS Sector (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    } finally {
      setIsDetectingLocation(false);
    }
  }, []);

  // Place or move the draggable precision target marker on the map
  const placeTargetPin = useCallback((lat: number, lng: number, openDrawer = true) => {
    const fixedLat = Number(lat.toFixed(6));
    const fixedLng = Number(lng.toFixed(6));
    setPickedCoordinates([fixedLat, fixedLng]);
    onMapClickRef.current?.(fixedLat, fixedLng);
    resolveSuburbFromCoords(fixedLat, fixedLng);

    if (openDrawer) {
      setSelectedId(null);
      setIsRegisterDrawerOpen(true);
    }

    const map = mapRef.current;
    if (!map) return;

    if (targetMarkerRef.current) {
      targetMarkerRef.current.setLatLng([fixedLat, fixedLng]);
    } else {
      const targetIcon = L.divIcon({
        className: 'archonix-target-pin',
        html: `<div class="archonix-target-pin__reticle"><div class="archonix-target-pin__core"></div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([fixedLat, fixedLng], {
        icon: targetIcon,
        draggable: true,
        zIndexOffset: 2000,
      }).addTo(map);

      marker.bindTooltip('Drag pin onto exact roof corner', {
        direction: 'top',
        offset: [0, -16],
        className: 'archonix-tooltip',
      });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const draggedLat = Number(pos.lat.toFixed(6));
        const draggedLng = Number(pos.lng.toFixed(6));
        setPickedCoordinates([draggedLat, draggedLng]);
        onMapClickRef.current?.(draggedLat, draggedLng);
        resolveSuburbFromCoords(draggedLat, draggedLng);
      });

      targetMarkerRef.current = marker;
    }
  }, [resolveSuburbFromCoords, setSelectedId]);

  const clearTargetPin = useCallback(() => {
    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }
    setPickedCoordinates(null);
    setIsRegisterDrawerOpen(false);
    setNewBuildingName('');
    setNewBuildingLocation('');
    setNewIncidentNote('');
  }, []);

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

  // Initialize Leaflet map
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const markers = markersRef.current;

    const map = L.map(container, {
      center: [-33.8688, 151.2093],
      zoom: 13,
      minZoom: 2,
      worldCopyJump: true,
    });

    const initialLayer = L.tileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
      maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current = initialLayer;

    map.on('click', (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.leaflet-marker-icon, .leaflet-popup')) return;
      placeTargetPin(event.latlng.lat, event.latlng.lng, true);
    });

    layerRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      showCoverageOnHover: false,
    }).addTo(map);
    mapRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [placeTargetPin]);

  // Switch tile layer when user toggles Satellite / Tactical Dark / Street
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }
    const cfg = TILE_LAYERS[baseLayer];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || plotted.length === 0) return;

    const bounds = L.latLngBounds(
      plotted.map((building) => [building.lat as number, building.lng as number] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [plotted]);

  // Render existing building pins
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
        setIsRegisterDrawerOpen(false);
        setSelectedId(b.id);
        onSelectBuildingRef.current?.(b);
      });

      marker.addTo(layer);
      markersRef.current.set(b.id, marker);
    });
  }, [visible, telemetryData, activeSpatialResult, setSelectedId]);

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
    if (map) map.flyTo([building.lat as number, building.lng as number], Math.max(map.getZoom(), 15), { duration: 1.2 });
  }, [selectedId, visible]);

  const focusBuilding = (b: MapBuilding) => {
    setIsRegisterDrawerOpen(false);
    setSelectedId(b.id);
    onSelectBuildingRef.current?.(b);
    const map = mapRef.current;
    if (map) map.flyTo([b.lat as number, b.lng as number], Math.max(map.getZoom(), 15), { duration: 1.2 });
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
    map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 15, duration: 1.2 });
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

  const handleDropPinAtCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    placeTargetPin(center.lat, center.lng, true);
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedCoordinates || !newBuildingName.trim()) return;

    setIsSavingPin(true);
    try {
      const payload: NewPinPayload = {
        name: newBuildingName.trim(),
        location: newBuildingLocation.trim() || `GPS (${pickedCoordinates[0]}, ${pickedCoordinates[1]})`,
        type: newBuildingType,
        lat: pickedCoordinates[0],
        lng: pickedCoordinates[1],
        incidentNote: newIncidentNote.trim() || undefined,
      };

      if (onCreatePin) {
        await onCreatePin(payload);
      } else {
        // Direct fallback POST to Neon API if onCreatePin prop isn't wired yet
        await fetch('/api/buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_code: `ARC-${Date.now().toString().slice(-6)}`,
            name: payload.name,
            suburb: payload.location,
            latitude: payload.lat,
            longitude: payload.lng,
            building_classification: payload.type,
          }),
        });
      }
      clearTargetPin();
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <div className="space-y-4">
      <style>{MAP_CSS}</style>

      {/* Conversational Spatial AI Command Bar */}
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

        {onSimulateTelemetry && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-[#A7A39A] hidden md:inline">Simulate Event:</span>
            <button
              type="button"
              onClick={() => onSimulateTelemetry('seismic')}
              className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 border border-red-700/50 rounded text-xs font-mono text-red-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Activity className="w-3 h-3 text-red-400" />
              <span>⚡ M5.2 Tremor</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('wind')}
              className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-700/50 rounded text-xs font-mono text-amber-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Wind className="w-3 h-3 text-amber-400" />
              <span>💨 115km/h Wind</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('moisture')}
              className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/50 rounded text-xs font-mono text-cyan-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Waves className="w-3 h-3 text-cyan-400" />
              <span>💧 Ingress Spill</span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateTelemetry('baseline')}
              className="px-2 py-1 bg-[#222222] hover:bg-[#333333] border border-[#333333] rounded text-xs font-mono text-[#A7A39A] hover:text-[#F5F0E5] flex items-center gap-1 transition-colors cursor-pointer"
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

      {/* Filters, Precision Pin Trigger, and View Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-1">
          <p className="text-xs text-[#A7A39A] flex items-center gap-1.5" role="status">
            <Crosshair className="w-3.5 h-3.5 text-[#E5C77B]" />
            <span>Click directly on any building rooftop to lock a 6-decimal GPS pin (drag pin to fine-tune).</span>
            {pickedCoordinates && (
              <span className="ml-1 font-mono text-[#E5C77B]">
                Target: {pickedCoordinates[0]}, {pickedCoordinates[1]}
              </span>
            )}
          </p>

          <button
            type="button"
            onClick={handleDropPinAtCenter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Drop Pin on Map</span>
          </button>
        </div>

        {ALL_STATUSES.map((status) => {
          const on = activeStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={on}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs transition-colors cursor-pointer ${
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit all assets</span>
          </button>
          <button
            type="button"
            onClick={worldView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>World view</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map Viewport */}
        <div className="lg:col-span-3 relative isolate rounded border border-[#222222] overflow-hidden bg-[#0d0d0d]">
          <div ref={containerRef} className="h-[68vh] min-h-[500px] w-full cursor-crosshair" />

          {/* Map Base Layer Switcher (Satellite / Tactical Dark / Street) */}
          <div className="absolute top-3 right-3 z-[500] flex items-center bg-[#141414]/95 border border-[#333333] rounded p-1 backdrop-blur-md shadow-lg">
            {(['satellite', 'dark', 'street'] as BaseLayerType[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBaseLayer(mode)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  baseLayer === mode
                    ? 'bg-[#E5C77B] text-[#090909] font-bold'
                    : 'text-[#A7A39A] hover:text-[#F5F0E5]'
                }`}
              >
                {mode === 'satellite' ? <Satellite className="w-3 h-3" /> : <MapIcon className="w-3 h-3" />}
                <span>{TILE_LAYERS[mode].label}</span>
              </button>
            ))}
          </div>

          {/* Inline Slide-Over Pin Registration Drawer (Keeps Map & Draggable Pin Visible) */}
          {isRegisterDrawerOpen && pickedCoordinates && (
            <form
              onSubmit={handleSaveNewPin}
              className="absolute top-3 right-3 bottom-3 w-[calc(100%-1.5rem)] sm:w-96 z-[600] p-4 bg-[#141414]/95 border border-[#E5C77B]/60 rounded-lg backdrop-blur-md shadow-2xl flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2 border-b border-[#222222] pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 text-[#E5C77B] text-xs font-mono font-bold">
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>PRECISION PIN LOCKED</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#F5F0E5] mt-0.5">
                      Register Structural Asset
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={clearTargetPin}
                    aria-label="Cancel pin placement"
                    className="text-[#A7A39A] hover:text-[#F5F0E5] p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Live-synced 6-decimal GPS coordinates */}
                <div className="p-2.5 bg-[#0a0a0a] border border-[#222222] rounded space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#A7A39A]">
                    <span>LOCKED ROOFTOP COORDINATES</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> ±11cm GPS
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs text-[#E5C77B]">
                    <div className="px-2 py-1 bg-[#141414] rounded border border-[#222222]">
                      LAT: {pickedCoordinates[0]}
                    </div>
                    <div className="px-2 py-1 bg-[#141414] rounded border border-[#222222]">
                      LNG: {pickedCoordinates[1]}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#777777] pt-0.5">
                    Tip: Drag the gold target marker on the map to adjust exact building corner.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-[#A7A39A] uppercase mb-1">
                    Building / Structure Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newBuildingName}
                    onChange={(e) => setNewBuildingName(e.target.value)}
                    placeholder="e.g. Circular Quay Tower North Wing"
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#333333] focus:border-[#E5C77B] rounded text-xs text-[#F5F0E5] outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-mono text-[#A7A39A] uppercase mb-1">
                      Category
                    </label>
                    <select
                      value={newBuildingType}
                      onChange={(e) => setNewBuildingType(e.target.value)}
                      className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#333333] focus:border-[#E5C77B] rounded text-xs text-[#F5F0E5] outline-none"
                    >
                      <option value="Commercial">Commercial</option>
                      <option value="Residential High-Rise">Residential High-Rise</option>
                      <option value="Bridge / Infrastructure">Bridge / Infrastructure</option>
                      <option value="Industrial">Industrial</option>
                      <option value="Civic / Hospital">Civic / Hospital</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-[#A7A39A] uppercase mb-1">
                      Sector / Suburb {isDetectingLocation && '(...)'}
                    </label>
                    <input
                      type="text"
                      value={newBuildingLocation}
                      onChange={(e) => setNewBuildingLocation(e.target.value)}
                      placeholder="Auto-detected from GPS"
                      className="w-full px-2.5 py-2 bg-[#0a0a0a] border border-[#333333] focus:border-[#E5C77B] rounded text-xs text-[#F5F0E5] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-[#A7A39A] uppercase mb-1">
                    Incident / Structural Observation
                  </label>
                  <textarea
                    rows={2}
                    value={newIncidentNote}
                    onChange={(e) => setNewIncidentNote(e.target.value)}
                    placeholder="Leave blank if nominal, or describe crack/load concern (flags Red)..."
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#333333] focus:border-[#E5C77B] rounded text-xs text-[#F5F0E5] outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[#222222]">
                <button
                  type="submit"
                  disabled={isSavingPin || !newBuildingName.trim()}
                  className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] disabled:opacity-50 text-[#090909] font-bold text-xs rounded transition-colors cursor-pointer"
                >
                  {isSavingPin ? 'Saving to Neon...' : 'Save & Lock Pin'}
                </button>
                <button
                  type="button"
                  onClick={clearTargetPin}
                  className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs text-[#A7A39A] hover:text-[#F5F0E5] rounded cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Selected Building Card with Integrated Live IoT Telemetry Drawer */}
          {selected && !isRegisterDrawerOpen && (
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

        {/* Asset list */}
        <aside className="p-4 bg-[#191919] border border-[#222222] rounded lg:max-h-[calc(68vh+2px)] overflow-y-auto">
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