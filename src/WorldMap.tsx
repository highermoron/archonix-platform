import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Cpu, Globe, Layers, Maximize2, MapPin, X } from 'lucide-react';

// Only the fields the map needs. Your Building type from App.tsx fits this shape.
export type MapBuilding = {
  id: string;
  name: string;
  location: string;
  type: string;
  status: 'Low Concern' | 'Inspection Recommended' | 'Monitoring Required' | 'Urgent Assessment';
  healthIndex: number;
  lastScanDate: string;
  lat?: number;
  lng?: number;
};

type Status = MapBuilding['status'];

type WorldMapProps = {
  buildings: MapBuilding[];
  onScan: (buildingId: string) => void;
  onMemory: (buildingId: string) => void;
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
  .archonix-pin { background: transparent; border: 0; }
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
  @keyframes archonix-pulse {
    0%   { box-shadow: 0 0 0 2px var(--pin), 0 0 0 2px var(--pin); }
    100% { box-shadow: 0 0 0 2px var(--pin), 0 0 0 18px transparent; }
  }
  .archonix-tooltip {
    background: #191919; color: #F5F0E5; border: 1px solid #B58B3B;
    border-radius: 4px; font-size: 11px; box-shadow: none;
  }
  .archonix-tooltip.leaflet-tooltip-top:before { border-top-color: #B58B3B; }
  @media (prefers-reduced-motion: reduce) {
    .archonix-pin__dot--urgent { animation: none; }
    .archonix-pin__dot { transition: none; }
  }
`;

export default function WorldMap({ buildings, onScan, onMemory }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(new Set(ALL_STATUSES));

  const plotted = useMemo(
    () => buildings.filter((b) => typeof b.lat === 'number' && typeof b.lng === 'number'),
    [buildings]
  );
  const visible = useMemo(
    () => plotted.filter((b) => activeStatuses.has(b.status)),
    [plotted, activeStatuses]
  );
  const selected = visible.find((b) => b.id === selectedId) ?? null;
  const unplottedCount = buildings.length - plotted.length;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [20, 10],
      zoom: 2,
      minZoom: 2,
      worldCopyJump: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Keep tiles correct when the sidebar opens/closes or the window resizes.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Draw one pin per visible building.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    visible.forEach((b) => {
      const lat = b.lat as number;
      const lng = b.lng as number;
      const urgent = b.status === 'Urgent Assessment' ? ' archonix-pin__dot--urgent' : '';

      const icon = L.divIcon({
        className: 'archonix-pin',
        html: `<span class="archonix-pin__dot${urgent}" style="--pin:${STATUS_COLORS[b.status]}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon, title: b.name, keyboard: true });

      // textContent keeps user-entered names from being treated as HTML.
      const tip = document.createElement('span');
      tip.textContent = b.name;
      marker.bindTooltip(tip, { direction: 'top', offset: [0, -10], className: 'archonix-tooltip' });

      marker.on('click', () => {
        setSelectedId(b.id);
        const map = mapRef.current;
        if (map) map.flyTo([lat, lng], Math.max(map.getZoom(), 6), { duration: 1.2 });
      });

      marker.addTo(layer);
      markersRef.current.set(b.id, marker);
    });
  }, [visible]);

  // Highlight the selected pin.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('archonix-pin--selected', id === selectedId);
    });
  }, [selectedId, visible]);

  const focusBuilding = (b: MapBuilding) => {
    setSelectedId(b.id);
    const map = mapRef.current;
    if (map) map.flyTo([b.lat as number, b.lng as number], Math.max(map.getZoom(), 6), { duration: 1.2 });
  };

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

      {/* Filters and view controls */}
      <div className="flex flex-wrap items-center gap-2">
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
          <div ref={containerRef} className="h-[60vh] min-h-[420px] w-full" />

          {visible.length === 0 && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
              <p className="px-4 py-2 bg-[#191919]/90 border border-[#222222] rounded text-xs text-[#A7A39A]">
                No assets match the selected statuses.
              </p>
            </div>
          )}

          {selected && (
            <div className="absolute left-3 right-3 bottom-8 sm:right-auto sm:w-80 z-[500] p-4 bg-[#191919]/95 border border-[#B58B3B]/40 rounded space-y-3 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-[#F5F0E5] leading-snug">{selected.name}</h3>
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

              <div className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[selected.status] }}
                />
                <span className="text-[#F5F0E5]">{selected.status}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 bg-[#222222]/50 rounded font-mono text-xs">
                <div>
                  <span className="text-[#A7A39A] block text-[10px]">Health</span>
                  <span className="text-[#E5C77B] font-bold">{selected.healthIndex}%</span>
                </div>
                <div>
                  <span className="text-[#A7A39A] block text-[10px]">Type</span>
                  <span className="text-[#F5F0E5]">{selected.type}</span>
                </div>
                <div>
                  <span className="text-[#A7A39A] block text-[10px]">Last scan</span>
                  <span className="text-[#F5F0E5]">{selected.lastScanDate}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onScan(selected.id)}
                  className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-medium text-xs rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Run AI Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMemory(selected.id)}
                  className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] rounded flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Memory™</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Asset list */}
        <aside className="p-4 bg-[#191919] border border-[#222222] rounded lg:max-h-[calc(60vh+2px)] overflow-y-auto">
          <h3 className="text-sm font-bold text-[#F5F0E5] mb-1">Assets on the map</h3>
          <p className="text-xs text-[#A7A39A] mb-3">
            {visible.length} of {plotted.length} shown
          </p>

          <ul className="space-y-1.5">
            {visible.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => focusBuilding(b)}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    b.id === selectedId
                      ? 'bg-[#B58B3B]/15 border-[#B58B3B]/40'
                      : 'bg-[#090909] border-[#222222] hover:border-[#B58B3B]/30'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1 w-2.5 h-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[b.status] }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#F5F0E5] truncate">{b.name}</div>
                      <div className="text-[11px] text-[#A7A39A] truncate">{b.location}</div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
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
