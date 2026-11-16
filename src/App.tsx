import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useSupabaseBuildings } from './hooks/useSupabaseBuildings';
import { 
  Building2, ShieldAlert, Cpu, Activity, FileText, Settings, 
  Bell, Plus, Upload, ArrowRight, Eye, RefreshCw,
  LogOut, Lock, Mail, Menu, X, Zap, Layers, ArrowUpRight, 
  Compass, Download, MapPin
} from 'lucide-react';

// --- TYPES ---
type Screen = 
  | 'login' 
  | 'dashboard' 
  | 'map'
  | 'buildings' 
  | 'add-building' 
  | 'scan' 
  | 'diagnosis' 
  | 'monitor' 
  | 'alerts' 
  | 'recommendations' 
  | 'reports' 
  | 'settings';

interface Building {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  type: 'Residential' | 'Commercial' | 'Industrial' | 'Institutional' | 'Other';
  year: number;
  floors: number;
  description: string;
  status: 'Low Concern' | 'Inspection Recommended' | 'Monitoring Required' | 'Urgent Assessment';
  healthIndex?: number;
  lastScanDate: string;
  imageUrl: string;
  incidentNote?: string;
}

interface AlertItem {
  id: string;
  title: string;
  buildingName: string;
  timestamp: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Urgent';
  description: string;
  recommendation: string;
  read: boolean;
}

interface ScanRecord {
  id: string;
  buildingId: string;
  buildingName: string;
  component: string;
  date: string;
  imageUrl: string;
  imageFileName?: string;
  isUploadedImage?: boolean;
  crackLength: string;
  crackWidth: string;
  concernLevel: 'Pending Engineer Review' | EngineerClassification;
  engineerClassification?: EngineerClassification;
  engineerObservation?: string;
  observations: string[];
  summary: string;
}

type EngineerClassification =
  | 'Low Concern'
  | 'Moderate Concern'
  | 'High Concern'
  | 'Urgent Professional Assessment';

const ENGINEER_CLASSIFICATIONS: EngineerClassification[] = [
  'Low Concern',
  'Moderate Concern',
  'High Concern',
  'Urgent Professional Assessment'
];

// --- INITIAL DEMO DATA (AUSTRALIAN CONTEXT WITH COORDINATES) ---
const INITIAL_BUILDINGS: Building[] = [
  {
    id: 'bld-001',
    name: 'Barangaroo Commercial Tower 4',
    location: 'Barangaroo NSW 2000',
    lat: -33.8615,
    lng: 151.2019,
    type: 'Commercial',
    year: 2018,
    floors: 39,
    description: 'A-Grade commercial asset featuring post-tensioned concrete slabs and high-performance structural steel curtain walling.',
    status: 'Low Concern',
    healthIndex: 94.5,
    lastScanDate: '10 November 2026',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18fefec?auto=format&fit=crop&w=1200&q=80',
    incidentNote: 'Minor basement efflorescence logged on Level B2 North Wall.'
  },
  {
    id: 'bld-002',
    name: 'Parramatta Riverfront Residences',
    location: 'Parramatta NSW 2150',
    lat: -33.8136,
    lng: 151.0034,
    type: 'Residential',
    year: 2021,
    floors: 24,
    description: 'High-density multi-residential reinforced concrete superstructure with basement car parking levels.',
    status: 'Inspection Recommended',
    healthIndex: 78.2,
    lastScanDate: '28 October 2026',
    imageUrl: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80',
    incidentNote: 'INCIDENT RECORDED: Diagonal shear fissure (0.65mm) detected on Level 14 Load Column.'
  },
  {
    id: 'bld-003',
    name: 'Silverwater Logistics Distribution Hub',
    location: 'Silverwater NSW 2128',
    lat: -33.8340,
    lng: 151.0462,
    type: 'Industrial',
    year: 2015,
    floors: 2,
    description: 'Large-span steel portal frame warehouse with heavy-duty slab-on-ground industrial flooring.',
    status: 'Monitoring Required',
    healthIndex: 82.0,
    lastScanDate: '15 September 2026',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
    incidentNote: 'Expansion joint settlement recorded in Bay 4 loading dock.'
  }
];

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'alt-1',
    title: 'Diagonal Shear Fissure Detected',
    buildingName: 'Parramatta Riverfront Residences',
    timestamp: 'Today, 08:42 AM',
    severity: 'High',
    description: 'Computer-vision analysis identified a hairline diagonal crack spanning column interface level 14.',
    recommendation: 'Arrange a certified structural engineering inspection within 14 business days.',
    read: false
  },
  {
    id: 'alt-2',
    title: 'Basement Slab Moisture Seepage & Efflorescence',
    buildingName: 'Barangaroo Commercial Tower 4',
    timestamp: 'Yesterday, 04:15 PM',
    severity: 'Moderate',
    description: 'Subsurface wall scanner detected localized efflorescence and minor concrete spalling.',
    recommendation: 'Log in Building Memory and compare with previous quarter waterproofing scan.',
    read: false
  },
  {
    id: 'alt-3',
    title: 'Scheduled Bi-Annual Structural Health Audit Due',
    buildingName: 'Silverwater Logistics Distribution Hub',
    timestamp: '02 November 2026',
    severity: 'Low',
    description: 'Routine compliance window open for annual AS 4349 property condition evaluation.',
    recommendation: 'Initiate new multi-component AI scan via ARCHONIX workspace.',
    read: true
  }
];

const INITIAL_SCANS: ScanRecord[] = [
  {
    id: 'scn-001',
    buildingId: 'bld-002',
    buildingName: 'Parramatta Riverfront Residences',
    component: 'Columns',
    date: '28 October 2026',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18fefec?auto=format&fit=crop&w=1200&q=80',
    crackLength: '142 mm',
    crackWidth: '0.65 mm',
    concernLevel: 'High Concern',
    observations: [
      'Diagonal micro-fissuring along primary reinforced concrete column.',
      'Surface rust staining indicating internal rebar oxidation.',
      'Localized compressive stress indicators detected near floor junction.'
    ],
    summary: 'Preliminary computer vision telemetry classifies this observation under High Concern. Recommended immediate professional engineering review in accordance with Australian Standards.'
  },
  {
    id: 'scn-002',
    buildingId: 'bld-001',
    buildingName: 'Barangaroo Commercial Tower 4',
    component: 'Walls',
    date: '10 November 2026',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    crackLength: '35 mm',
    crackWidth: '0.15 mm',
    concernLevel: 'Low Concern',
    observations: [
      'Superficial shrinkage cracking observed in plasterboard partition lining.',
      'Structural core remains unaffected.',
      'No evidence of progressive widening compared to baseline scan.'
    ],
    summary: 'Observation consistent with normal thermal movement and drying shrinkage. Low structural risk profile.'
  }
];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[character];
  });
}

// --- INTERACTIVE MAP COMPONENT ---
function IncidentMap({ buildings, onSelectBuilding }: { buildings: Building[], onSelectBuilding: (id: string) => void }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string>(buildings[1]?.id || buildings[0]?.id || '');
  const activeAsset = buildings.find(building => building.id === activeAssetId) || buildings[0] || INITIAL_BUILDINGS[0];

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([-33.845, 151.09], 11);

      // Dark CartoDB Positron/DarkMatter tiles matching Midnight Black UI
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers before re-rendering
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    buildings.forEach((bld) => {
      const isHighRisk = bld.status === 'Inspection Recommended' || bld.status === 'Urgent Assessment';
      const isModerate = bld.status === 'Monitoring Required';

      const pinColor = isHighRisk ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';

      const marker = L.circleMarker([bld.lat, bld.lng], {
        radius: isHighRisk ? 12 : 9,
        fillColor: pinColor,
        color: '#E5C77B',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      }).addTo(map);

      marker.bindPopup(`
        <div style="background:#191919; color:#F5F0E5; padding:8px; border-radius:6px; font-family:sans-serif; min-width:200px;">
          <div style="font-size:10px; color:#E5C77B; font-family:monospace; text-transform:uppercase;">${escapeHtml(bld.type)} • ${escapeHtml(bld.status)}</div>
          <div style="font-weight:bold; font-size:13px; margin:4px 0;">${escapeHtml(bld.name)}</div>
          <div style="font-size:11px; color:#A7A39A; margin-bottom:6px;">${escapeHtml(bld.incidentNote || 'No critical anomalies logged.')}</div>
          <div style="font-size:11px; font-family:monospace; color:#E5C77B;">Health Index: ${bld.healthIndex != null ? `${bld.healthIndex}%` : 'Not available'}</div>
        </div>
      `);

      marker.on('click', () => {
        setActiveAssetId(bld.id);
      });
    });

    return () => {};
  }, [buildings]);

  const flyToBuilding = (bld: Building) => {
    setActiveAssetId(bld.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([bld.lat, bld.lng], 14, { duration: 1.2 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Geospatial Incident & Telemetry Map</h1>
          <p className="text-sm text-[#A7A39A]">Pinpoint recorded structural anomalies, crack detections, and sensor telemetry across NSW.</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono bg-[#191919] px-4 py-2 rounded border border-[#222222]">
          <span className="flex items-center gap-1.5 text-red-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span> Incident Recorded</span>
          <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Monitoring</span>
          <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Optimal</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Canvas */}
        <div className="lg:col-span-2 bg-[#191919] border border-[#222222] rounded overflow-hidden relative h-[520px]">
          <div ref={mapContainerRef} className="w-full h-full z-10" />
        </div>

        {/* Selected Incident Inspector Panel */}
        <div className="p-6 bg-[#191919] border border-[#222222] rounded flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase text-[#E5C77B]">Selected Site Telemetry</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                activeAsset.status === 'Inspection Recommended' || activeAsset.status === 'Urgent Assessment'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : activeAsset.status === 'Monitoring Required'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {activeAsset.status}
              </span>
            </div>

            <div className="h-40 rounded overflow-hidden mb-4 border border-[#222222]">
              <img src={activeAsset.imageUrl} alt={activeAsset.name} className="w-full h-full object-cover" />
            </div>

            <h3 className="text-lg font-bold text-[#F5F0E5]">{activeAsset.name}</h3>
            <p className="text-xs text-[#A7A39A] font-mono mb-4">{activeAsset.location} ({activeAsset.lat.toFixed(4)}, {activeAsset.lng.toFixed(4)})</p>

            <div className="p-3 bg-[#090909] border border-[#222222] rounded mb-4">
              <div className="text-[10px] font-mono uppercase text-[#E5C77B] mb-1">Recorded Incident Log</div>
              <p className="text-xs text-[#F5F0E5] leading-relaxed">{activeAsset.incidentNote || 'Routine structural telemetry active. No critical incidents logged.'}</p>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase text-[#A7A39A]">Quick Jump to Monitored Sites</div>
              {buildings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => flyToBuilding(b)}
                  className={`w-full text-left px-3 py-2 rounded text-xs flex items-center justify-between transition-colors ${
                    activeAsset.id === b.id ? 'bg-[#B58B3B]/20 text-[#E5C77B] border border-[#B58B3B]/40' : 'bg-[#222222]/50 text-[#A7A39A] hover:text-[#F5F0E5]'
                  }`}
                >
                  <span className="truncate">{b.name}</span>
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onSelectBuilding(activeAsset.id)}
            className="w-full py-2.5 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors flex items-center justify-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            <span>Inspect Site in AI Scanner</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('lachlan.ross@archonix.com.au');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const { buildings: supabaseBuildings, loading: buildingsLoading, error: buildingsError } = useSupabaseBuildings();

  const [buildings, setBuildings] = useState<Building[]>(() => {
    const saved = localStorage.getItem('archonix_buildings_au_v2');
    return saved ? JSON.parse(saved) : INITIAL_BUILDINGS;
  });

  const activeBuildings = useMemo(() => {
    if (supabaseBuildings.length === 0) {
      return buildings.length > 0 ? buildings : INITIAL_BUILDINGS;
    }

    const remoteIds = new Set(supabaseBuildings.map(building => building.id));
    const localAdditions = buildings.filter(building =>
      !INITIAL_BUILDINGS.some(initial => initial.id === building.id) && !remoteIds.has(building.id)
    );

    return [
      ...supabaseBuildings.map(profile => {
        const existing = buildings.find(building => building.id === profile.id);
        const classification = profile.building_classification.toLowerCase();
        const type: Building['type'] = classification.includes('residential')
          ? 'Residential'
          : classification.includes('industrial')
            ? 'Industrial'
            : classification.includes('institutional') || classification.includes('education') || classification.includes('health')
              ? 'Institutional'
              : classification.includes('commercial')
                ? 'Commercial'
                : 'Other';
        const status: Building['status'] = profile.monitoring_status === 'attention_required'
          ? 'Inspection Recommended'
          : profile.monitoring_status === 'overdue'
            ? 'Urgent Assessment'
            : profile.monitoring_status === 'archived'
              ? 'Monitoring Required'
              : 'Low Concern';

        return {
          id: profile.id,
          name: profile.name,
          location: [profile.street_address, profile.suburb, profile.state, profile.postcode].filter(Boolean).join(', '),
          lat: profile.latitude,
          lng: profile.longitude,
          type,
          year: profile.construction_year,
          floors: profile.floors_above_ground,
          description: profile.description,
          status,
          healthIndex: existing?.healthIndex,
          lastScanDate: existing?.lastScanDate || 'Not scanned',
          imageUrl: existing?.imageUrl || INITIAL_BUILDINGS[0].imageUrl,
          incidentNote: existing?.incidentNote
        };
      }),
      ...localAdditions
    ];
  }, [buildings, supabaseBuildings]);

  const [alerts, setAlerts] = useState<AlertItem[]>(() => {
    const saved = localStorage.getItem('archonix_alerts_au_v2');
    return saved ? JSON.parse(saved) : INITIAL_ALERTS;
  });

  const [scans, setScans] = useState<ScanRecord[]>(() => {
    const saved = localStorage.getItem('archonix_scans_au_v2');
    return saved ? JSON.parse(saved) : INITIAL_SCANS;
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('bld-002');
  const activeSelectedBuildingId = activeBuildings.some(building => building.id === selectedBuildingId)
    ? selectedBuildingId
    : activeBuildings[0]?.id || '';
  const [activeScanComponent, setActiveScanComponent] = useState<string>('Columns');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [currentScanResult, setCurrentScanResult] = useState<ScanRecord | null>(scans[0]);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [engineerClassification, setEngineerClassification] = useState<EngineerClassification | ''>('');
  const [engineerObservation, setEngineerObservation] = useState<string>('');

  const [newBuilding, setNewBuilding] = useState({
    name: '',
    location: '',
    lat: -33.8688,
    lng: 151.2093,
    type: 'Commercial' as Building['type'],
    year: 2022,
    floors: 10,
    description: '',
    incidentNote: '',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80'
  });

  useEffect(() => {
    localStorage.setItem('archonix_buildings_au_v2', JSON.stringify(buildings));
  }, [buildings]);

  useEffect(() => {
    localStorage.setItem('archonix_alerts_au_v2', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    try {
      localStorage.setItem('archonix_scans_au_v2', JSON.stringify(scans));
    } catch (error) {
      console.error('Unable to persist scan history in local storage.', error);
      alert('Scan history could not be saved in this browser. Free up local storage and try again.');
    }
  }, [scans]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticated(true);
    setCurrentScreen('dashboard');
  };

  const handleDemoLogin = () => {
    setUserEmail('lachlan.ross@archonix.com.au');
    setPasswordInput('EnterpriseSecure2026!');
    setIsAuthenticated(true);
    setCurrentScreen('dashboard');
  };

  const handleRegisterBuilding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuilding.name || !newBuilding.location) return;

    const created: Building = {
      id: `bld-${Date.now()}`,
      name: newBuilding.name,
      location: newBuilding.location,
      lat: Number(newBuilding.lat) || -33.8688,
      lng: Number(newBuilding.lng) || 151.2093,
      type: newBuilding.type,
      year: Number(newBuilding.year),
      floors: Number(newBuilding.floors),
      description: newBuilding.description || 'Newly registered structural asset under automated monitoring.',
      incidentNote: newBuilding.incidentNote || 'Baseline telemetry initialized.',
      status: newBuilding.incidentNote ? 'Inspection Recommended' : 'Low Concern',
      healthIndex: newBuilding.incidentNote ? 79.0 : 96.0,
      lastScanDate: 'Today',
      imageUrl: newBuilding.imageUrl
    };

    setBuildings([created, ...buildings]);
    setCurrentScreen('map');
    setNewBuilding({
      name: '',
      location: '',
      lat: -33.8688,
      lng: 151.2093,
      type: 'Commercial',
      year: 2022,
      floors: 10,
      description: '',
      incidentNote: '',
      imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80'
    });
  };

  const startAiScanSimulation = () => {
    setIsScanning(true);
    setScanProgress(0);
    let prog = 0;
    const interval = setInterval(() => {
      prog += 15;
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        setIsScanning(false);

        const targetBld = activeBuildings.find(b => b.id === activeSelectedBuildingId) || activeBuildings[0];
        if (!targetBld) {
          setIsScanning(false);
          alert('No buildings are available to scan. Check the building data connection and try again.');
          return;
        }
        const newRecord: ScanRecord = {
          id: `scn-${Date.now()}`,
          buildingId: targetBld.id,
          buildingName: targetBld.name,
          component: activeScanComponent,
          date: 'Today',
          imageUrl: uploadedImageUrl || targetBld.imageUrl,
          imageFileName: uploadedImageUrl ? uploadedFileName || undefined : undefined,
          isUploadedImage: Boolean(uploadedImageUrl),
          crackLength: uploadedImageUrl ? 'Not measured' : `${(Math.random() * 80 + 20).toFixed(1)} mm`,
          crackWidth: uploadedImageUrl ? 'Not measured' : `${(Math.random() * 0.5 + 0.05).toFixed(2)} mm`,
          concernLevel: uploadedImageUrl
            ? 'Pending Engineer Review'
            : Math.random() > 0.5 ? 'Moderate Concern' : 'Low Concern',
          observations: uploadedImageUrl ? [] : [
            `Automated visual inspection of ${activeScanComponent.toLowerCase()} surfaces completed.`,
            `Surface micro-texture consistency evaluated against baseline parameters.`,
            `Minor environmental weathering noted along joint interfaces.`
          ],
          summary: uploadedImageUrl
            ? 'Custom photographic evidence uploaded. Automated fissure detection inference is unavailable in local mode; a qualified engineer must classify the image.'
            : `AI computer vision scan completed successfully on ${targetBld.name} (${activeScanComponent}). No immediate structural compromise detected; routine monitoring recommended.`
        };

        setScans(previousScans => [newRecord, ...previousScans]);
        setCurrentScanResult(newRecord);
        setEngineerClassification('');
        setEngineerObservation('');
        setCurrentScreen('diagnosis');
      } else {
        setScanProgress(prog);
      }
    }, 180);
  };

  const resetDemoData = () => {
    setBuildings(INITIAL_BUILDINGS);
    setAlerts(INITIAL_ALERTS);
    setScans(INITIAL_SCANS);
    localStorage.clear();
    alert('ARCHONIX Australian Demonstration telemetry reset successfully.');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please choose a JPEG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        alert('The selected image could not be read. Please try another file.');
        return;
      }
      setUploadedImageUrl(reader.result);
      setUploadedFileName(file.name);
    };
    reader.onerror = () => {
      console.error('Unable to read selected inspection image.', reader.error);
      alert('The selected image could not be read. Please try another file.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearUploadedImage = () => {
    setUploadedImageUrl(null);
    setUploadedFileName(null);
    setEngineerClassification('');
    setEngineerObservation('');
  };

  const openScanResult = (scan: ScanRecord) => {
    setCurrentScanResult(scan);
    setShowBoundingBoxes(!scan.isUploadedImage);
    setEngineerClassification(scan.engineerClassification || '');
    setEngineerObservation(scan.engineerObservation || '');
    setCurrentScreen('diagnosis');
  };

  const handleEngineerReviewSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentScanResult || !engineerClassification) return;

    const observation = engineerObservation.trim();
    const reviewedScan: ScanRecord = {
      ...currentScanResult,
      concernLevel: engineerClassification,
      engineerClassification,
      engineerObservation: observation,
      summary: `Engineer classification recorded as ${engineerClassification}.${observation ? ` Observation: ${observation}` : ''}`
    };
    setScans(previousScans =>
      previousScans.map(scan => scan.id === reviewedScan.id ? reviewedScan : scan)
    );
    setCurrentScanResult(reviewedScan);
  };

  if (!isAuthenticated || currentScreen === 'login') {
    return (
      <div className="min-h-screen bg-[#090909] text-[#F5F0E5] flex flex-col lg:flex-row font-sans selection:bg-[#B58B3B] selection:text-white">
        <div className="lg:w-1/2 relative bg-[#191919] p-12 flex flex-col justify-between border-r border-[#222222] overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#B58B3B_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded bg-[#B58B3B]/10 border border-[#B58B3B]/40 flex items-center justify-center text-[#E5C77B]">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold tracking-widest text-lg text-[#F5F0E5]">ARCHONIX</span>
                <span className="block text-xs text-[#B58B3B] font-mono tracking-wider">AUSTRALIAN ENTERPRISE TELEMETRY</span>
              </div>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-[#F5F0E5] mb-6">
              Buildings Have a Health.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E5C77B] to-[#B58B3B]">
                We Monitor It.
              </span>
            </h1>
            <p className="text-[#A7A39A] text-lg max-w-md leading-relaxed">
              Advanced computer vision structural intelligence platform designed for Australian property portfolios, engineers, and facility operators.
            </p>
          </div>
          <div className="relative z-10 mt-12 grid grid-cols-3 gap-6 pt-8 border-t border-[#222222]">
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">0.05mm</div>
              <div className="text-xs text-[#A7A39A] mt-1">Fissure Resolution</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">GIS Map</div>
              <div className="text-xs text-[#A7A39A] mt-1">Incident Pinpointing</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">AS 4349</div>
              <div className="text-xs text-[#A7A39A] mt-1">Audit-Ready Reports</div>
            </div>
          </div>
          <div className="relative z-10 mt-8 text-xs text-[#A7A39A]">
            © 2026 ARCHONIX Structural Intelligence Systems • Sydney & Melbourne Operations
          </div>
        </div>

        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#F5F0E5] mb-2">Access Command Center</h2>
              <p className="text-sm text-[#A7A39A]">Sign in to inspect your structural portfolio and Building Memory™ records.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Work Email *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#A7A39A]">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input 
                    type="email" 
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#191919] border border-[#222222] rounded text-[#F5F0E5] placeholder-[#A7A39A] focus:outline-none focus:border-[#B58B3B] transition-colors text-sm"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A]">Password *</label>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#A7A39A]">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-[#191919] border border-[#222222] rounded text-[#F5F0E5] placeholder-[#A7A39A] focus:outline-none focus:border-[#B58B3B] transition-colors text-sm"
                    placeholder="••••••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#A7A39A] hover:text-[#F5F0E5]">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full py-3 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold rounded transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#B58B3B]/10">
                <span>Launch ARCHONIX Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-8 pt-6 border-t border-[#222222] text-center">
              <p className="text-xs text-[#A7A39A] mb-3">Preloaded Demo Credentials Ready</p>
              <button onClick={handleDemoLogin} className="px-4 py-2 bg-[#191919] hover:bg-[#222222] border border-[#222222] rounded text-xs text-[#E5C77B] font-mono transition-colors inline-flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#B58B3B]" />
                <span>One-Click Demo Entry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Overview / Dashboard', icon: Activity },
    { id: 'map', label: 'Incident & Asset Map', icon: MapPin },
    { id: 'buildings', label: 'My Buildings', icon: Building2 },
    { id: 'add-building', label: 'Add Building', icon: Plus },
    { id: 'scan', label: 'AI Building Scan', icon: Cpu },
    { id: 'monitor', label: 'Health Monitor (Memory™)', icon: Layers },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.filter(a => !a.read).length },
    { id: 'recommendations', label: 'AI Recommendations', icon: Zap },
    { id: 'reports', label: 'Reports & History', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#090909] text-[#F5F0E5] flex font-sans selection:bg-[#B58B3B] selection:text-white">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#191919] border-r border-[#222222] transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 px-6 border-b border-[#222222] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#B58B3B]/10 border border-[#B58B3B]/40 flex items-center justify-center text-[#E5C77B]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold tracking-wider text-sm text-[#F5F0E5]">ARCHONIX</span>
              <span className="block text-[10px] text-[#B58B3B] font-mono">AUSTRALIA</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#A7A39A] hover:text-[#F5F0E5]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]">
          <div className="px-3 py-2 text-[10px] font-mono text-[#A7A39A] uppercase tracking-wider">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentScreen(item.id as Screen);
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-xs font-medium transition-colors ${isActive ? 'bg-[#B58B3B]/15 text-[#E5C77B] border border-[#B58B3B]/30' : 'text-[#A7A39A] hover:bg-[#222222] hover:text-[#F5F0E5]'}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#E5C77B]' : 'text-[#A7A39A]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400 font-mono border border-red-500/30">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="pt-6 mt-6 border-t border-[#222222]">
            <div className="px-3 py-2 mt-1 bg-[#222222]/50 rounded border border-[#222222]">
              <div className="text-xs font-medium text-[#F5F0E5] truncate">Lachlan Ross</div>
              <div className="text-[10px] text-[#A7A39A] truncate font-mono">Senior Structural Analyst</div>
            </div>
            <button onClick={() => setIsAuthenticated(false)} className="w-full mt-3 flex items-center gap-3 px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'lg:pl-64' : 'pl-0'}`}>
        <header className="h-16 bg-[#191919] border-b border-[#222222] px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded bg-[#222222] text-[#A7A39A] hover:text-[#F5F0E5] transition-colors">
              <Menu className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#A7A39A] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>TELEMETRY STREAM ACTIVE • SYD-MEL HUB</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentScreen('map')} className="px-3 py-1.5 rounded bg-[#222222] text-[#E5C77B] hover:bg-[#333333] text-xs font-mono flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>Live GIS Map</span>
            </button>
            <button onClick={() => setCurrentScreen('alerts')} className="relative p-2 rounded bg-[#222222] text-[#A7A39A] hover:text-[#F5F0E5] transition-colors">
              <Bell className="w-4 h-4" />
              {alerts.filter(a => !a.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {alerts.filter(a => !a.read).length}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 bg-[#090909] overflow-y-auto">
          {buildingsLoading && (
            <div role="status" className="mb-4 p-3 rounded border border-[#222222] bg-[#191919] text-xs text-[#A7A39A]">
              Loading buildings from Supabase…
            </div>
          )}
          {buildingsError && (
            <div role="alert" className="mb-4 p-3 rounded border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
              Building data could not be loaded from Supabase: {buildingsError} Using saved or demo buildings instead.
            </div>
          )}
          {!buildingsLoading && !buildingsError && (
            <div role="status" className="mb-4 p-3 rounded border border-[#222222] bg-[#191919] text-xs text-[#A7A39A]">
              {supabaseBuildings.length > 0
                ? `Loaded ${supabaseBuildings.length} buildings from Supabase.`
                : 'No buildings found in Supabase; using saved or demo buildings.'}
            </div>
          )}
          {currentScreen === 'map' && (
            <IncidentMap
              buildings={activeBuildings}
              onSelectBuilding={(id) => {
                setSelectedBuildingId(id);
                setCurrentScreen('scan');
              }}
            />
          )}

          {currentScreen === 'dashboard' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Structural Command Dashboard</h1>
                  <p className="text-sm text-[#A7A39A]">Real-time portfolio telemetry and automated structural health indexing.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentScreen('map')}
                    className="px-4 py-3 bg-[#191919] hover:bg-[#222222] border border-[#B58B3B]/40 text-[#E5C77B] font-semibold text-xs rounded transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>VIEW INCIDENT MAP</span>
                  </button>
                  <button
                    onClick={() => setCurrentScreen('scan')}
                    className="px-5 py-3 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#B58B3B]/20 cursor-pointer"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>START NEW BUILDING SCAN</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Total Buildings</div>
                  <div className="text-2xl font-bold text-[#F5F0E5] font-mono">{activeBuildings.length}</div>
                  <div className="text-[10px] text-emerald-400 mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> 100% Monitored
                  </div>
                </div>
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Health Index</div>
                  <div className="text-2xl font-bold text-[#E5C77B] font-mono">84.9%</div>
                  <div className="text-[10px] text-[#A7A39A] mt-2">Portfolio Average</div>
                </div>
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Active Alerts</div>
                  <div className="text-2xl font-bold text-red-400 font-mono">{alerts.filter(a => !a.read).length}</div>
                  <div className="text-[10px] text-red-400 mt-2">Requires Review</div>
                </div>
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Scans Completed</div>
                  <div className="text-2xl font-bold text-[#F5F0E5] font-mono">{scans.length + 24}</div>
                  <div className="text-[10px] text-emerald-400 mt-2">YTD Telemetry</div>
                </div>
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Attention Required</div>
                  <div className="text-2xl font-bold text-amber-400 font-mono">1</div>
                  <div className="text-[10px] text-amber-400 mt-2">Engineers Notified</div>
                </div>
                <div className="p-4 bg-[#191919] border border-[#222222] rounded">
                  <div className="text-xs text-[#A7A39A] font-mono mb-1">Awaiting Inspection</div>
                  <div className="text-2xl font-bold text-[#F5F0E5] font-mono">0</div>
                  <div className="text-[10px] text-emerald-400 mt-2">Queue Cleared</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-6 bg-[#191919] border border-[#222222] rounded">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-base font-bold text-[#F5F0E5]">Structural Health Trend (Q1 - Q4 2026)</h3>
                      <p className="text-xs text-[#A7A39A]">Longitudinal indexing across NSW asset portfolio</p>
                    </div>
                    <span className="px-2 py-1 bg-[#222222] text-[#E5C77B] text-xs font-mono rounded border border-[#222222]">Live Telemetry</span>
                  </div>
                  <div className="h-64 w-full flex items-end gap-3 pt-6 pb-2 px-2 border-b border-[#222222]">
                    {[65, 70, 68, 75, 72, 78, 80, 82, 81, 84, 85, 84.9].map((val, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                        <div className="absolute -top-8 bg-[#222222] text-[#E5C77B] text-[10px] font-mono px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-[#B58B3B]/30">
                          {val}% Health
                        </div>
                        <div className="w-full bg-gradient-to-t from-[#B58B3B]/40 to-[#E5C77B] rounded-t transition-all duration-500 group-hover:brightness-125" style={{ height: `${val}%` }}></div>
                        <span className="text-[10px] text-[#A7A39A] font-mono">M{idx + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-[#191919] border border-[#222222] rounded flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-[#F5F0E5]">Recent Alerts</h3>
                      <button onClick={() => setCurrentScreen('alerts')} className="text-xs text-[#B58B3B] hover:underline">View All</button>
                    </div>
                    <div className="space-y-3">
                      {alerts.slice(0, 3).map((alt) => (
                        <div key={alt.id} className="p-3 bg-[#222222]/50 border border-[#222222] rounded">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-[#F5F0E5] truncate">{alt.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${alt.severity === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                              {alt.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#A7A39A] truncate">{alt.buildingName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setCurrentScreen('map')} className="w-full mt-4 py-2.5 bg-[#222222] hover:bg-[#B58B3B]/20 border border-[#222222] hover:border-[#B58B3B]/40 text-xs text-[#E5C77B] rounded transition-colors flex items-center justify-center gap-2">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Locate Incidents on Map</span>
                  </button>
                </div>
              </div>

              <section className="p-6 bg-[#191919] border border-[#222222] rounded">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#F5F0E5]">Recent Scans</h3>
                    <p className="text-xs text-[#A7A39A]">Saved inspection results and uploaded evidence.</p>
                  </div>
                  <button onClick={() => setCurrentScreen('reports')} className="text-xs text-[#B58B3B] hover:underline">View Reports</button>
                </div>
                {scans.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {scans.slice(0, 3).map(scan => (
                      <button
                        key={scan.id}
                        type="button"
                        onClick={() => openScanResult(scan)}
                        className="flex items-center gap-3 p-3 bg-[#090909] border border-[#222222] hover:border-[#B58B3B]/40 rounded text-left transition-colors"
                      >
                        <img src={scan.imageUrl} alt="" className="w-16 h-16 shrink-0 object-cover rounded bg-[#222222]" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-[#F5F0E5] truncate">{scan.buildingName}</span>
                          <span className="block text-[11px] text-[#A7A39A] mt-1">{scan.component} · {scan.date}</span>
                          <span className="block text-[10px] text-[#E5C77B] mt-1 truncate">
                            {scan.engineerClassification || scan.concernLevel}
                          </span>
                          {scan.imageFileName && <span className="block text-[10px] text-[#A7A39A] truncate">{scan.imageFileName}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#A7A39A]">No scans recorded yet. Upload an image and start an AI analysis to create your first record.</p>
                )}
              </section>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#F5F0E5]">Monitored Portfolio Assets</h3>
                  <button onClick={() => setCurrentScreen('buildings')} className="text-xs text-[#B58B3B] hover:underline">Manage Portfolio →</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {activeBuildings.map((bld) => (
                    <div key={bld.id} className="bg-[#191919] border border-[#222222] rounded overflow-hidden flex flex-col justify-between group">
                      <div>
                        <div className="h-40 overflow-hidden relative">
                          <img src={bld.imageUrl} alt={bld.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute top-3 right-3 px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-[#090909]/80 backdrop-blur border border-[#222222] text-[#E5C77B]">
                            {bld.type}
                          </div>
                        </div>
                        <div className="p-5">
                          <h4 className="font-bold text-[#F5F0E5] mb-1">{bld.name}</h4>
                          <p className="text-xs text-[#A7A39A] mb-4 flex items-center gap-1">
                            <Compass className="w-3.5 h-3.5 text-[#B58B3B]" /> {bld.location}
                          </p>
                          <div className="grid grid-cols-2 gap-2 py-3 border-t border-b border-[#222222] text-xs font-mono mb-4">
                            <div>
                              <span className="text-[#A7A39A] block">Health Index</span>
                              <span className="text-[#E5C77B] font-bold">{bld.healthIndex != null ? `${bld.healthIndex}%` : 'Not available'}</span>
                            </div>
                            <div>
                              <span className="text-[#A7A39A] block">Status</span>
                              <span className={bld.status === 'Low Concern' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>{bld.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="px-5 pb-5 pt-0 flex items-center gap-2">
                        <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('scan'); }} className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-medium text-xs rounded transition-colors flex items-center justify-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Scan Building</span>
                        </button>
                        <button onClick={() => setCurrentScreen('map')} className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs rounded transition-colors" title="Locate on Map">
                          <MapPin className="w-3.5 h-3.5 text-[#E5C77B]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentScreen === 'buildings' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Building Portfolio Management</h1>
                  <p className="text-sm text-[#A7A39A]">Registered architectural assets and automated telemetry profiles.</p>
                </div>
                <button onClick={() => setCurrentScreen('add-building')} className="px-4 py-2.5 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Register New Building</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeBuildings.map((bld) => (
                  <div key={bld.id} className="p-5 bg-[#191919] border border-[#222222] rounded flex flex-col justify-between">
                    <div>
                      <div className="h-44 rounded overflow-hidden mb-4 relative">
                        <img src={bld.imageUrl} alt={bld.name} className="w-full h-full object-cover" />
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-mono bg-[#090909]/80 text-[#E5C77B]">{bld.type}</div>
                      </div>
                      <h3 className="font-bold text-[#F5F0E5] text-base mb-1">{bld.name}</h3>
                      <p className="text-xs text-[#A7A39A] mb-3">{bld.location}</p>
                      <p className="text-xs text-[#A7A39A] mb-4 line-clamp-2">{bld.description}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-[#222222]">
                      <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('scan'); }} className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-medium text-xs rounded transition-colors">Run AI Scan</button>
                      <button onClick={() => setCurrentScreen('map')} className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs text-[#E5C77B] rounded font-mono">Map Pin</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentScreen === 'add-building' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5] mb-1">Register New Building & Incident Pin</h1>
                <p className="text-sm text-[#A7A39A]">Input structural parameters and GPS coordinates to plot the site on the GIS Incident Map.</p>
              </div>
              <form onSubmit={handleRegisterBuilding} className="p-6 bg-[#191919] border border-[#222222] rounded space-y-5">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Building Name *</label>
                  <input type="text" required value={newBuilding.name} onChange={(e) => setNewBuilding({...newBuilding, name: e.target.value})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="e.g. Circular Quay Tower" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Location / Suburb *</label>
                    <input type="text" required value={newBuilding.location} onChange={(e) => setNewBuilding({...newBuilding, location: e.target.value})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="e.g. Sydney NSW 2000" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Category *</label>
                    <select value={newBuilding.type} onChange={(e) => setNewBuilding({...newBuilding, type: e.target.value as Building['type']})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                      <option value="Commercial">Commercial</option>
                      <option value="Residential">Residential</option>
                      <option value="Industrial">Industrial</option>
                      <option value="Institutional">Institutional</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Latitude (GPS)</label>
                    <input type="number" step="any" value={newBuilding.lat} onChange={(e) => setNewBuilding({...newBuilding, lat: Number(e.target.value)})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Longitude (GPS)</label>
                    <input type="number" step="any" value={newBuilding.lng} onChange={(e) => setNewBuilding({...newBuilding, lng: Number(e.target.value)})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#E5C77B] mb-2">Recorded Incident / Structural Observation (Highlights Red on Map)</label>
                  <input type="text" value={newBuilding.incidentNote} onChange={(e) => setNewBuilding({...newBuilding, incidentNote: e.target.value})} className="w-full px-4 py-3 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Leave blank if no incident, or describe crack/impact event..." />
                </div>
                <div className="flex items-center gap-4 pt-4 border-t border-[#222222]">
                  <button type="submit" className="px-6 py-3 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded">Save & Plot on Map</button>
                  <button type="button" onClick={() => setCurrentScreen('buildings')} className="px-6 py-3 bg-[#222222] text-[#A7A39A] text-xs rounded">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {currentScreen === 'scan' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">AI Computer Vision Inspection Workspace</h1>
                <p className="text-sm text-[#A7A39A]">Upload structural component photographs for automated fissure detection and defect classification.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-6">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Select Target Building</label>
                    <select value={activeSelectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                      {activeBuildings.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Structural Component</label>
                    <select value={activeScanComponent} onChange={(e) => setActiveScanComponent(e.target.value)} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                      {['Walls', 'Columns', 'Beams', 'Ceilings', 'Pillars', 'Floors', 'Foundations', 'Other'].map(comp => (<option key={comp} value={comp}>{comp}</option>))}
                    </select>
                  </div>
                  <button onClick={startAiScanSimulation} disabled={isScanning} className="w-full py-3 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold rounded text-xs flex items-center justify-center gap-2 cursor-pointer">
                    {isScanning ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Analyzing ({scanProgress}%)</span></> : <><Cpu className="w-4 h-4" /><span>START AI ANALYSIS</span></>}
                  </button>
                </div>
                <div className="lg:col-span-2 p-6 bg-[#191919] border border-[#222222] rounded">
                  <div className="border-2 border-dashed border-[#222222] rounded-xl p-6 text-center bg-[#090909] relative overflow-hidden">
                    {isScanning && (
                      <div className="absolute inset-0 bg-[#090909]/90 z-20 flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full border-4 border-[#B58B3B]/20 border-t-[#E5C77B] animate-spin"></div>
                        <div className="text-sm font-mono text-[#E5C77B]">Scanning Neural Weights & Fissures... {scanProgress}%</div>
                      </div>
                    )}
                    <div className="h-64 rounded overflow-hidden relative mb-4">
                      <img src={uploadedImageUrl || activeBuildings.find(b => b.id === activeSelectedBuildingId)?.imageUrl || INITIAL_BUILDINGS[0].imageUrl} alt="Structural inspection preview" className="w-full h-full object-cover" />
                    </div>
                    <label className="px-4 py-2 bg-[#222222] hover:bg-[#333333] text-[#F5F0E5] text-xs font-medium rounded cursor-pointer inline-flex items-center gap-2">
                      <Upload className="w-4 h-4 text-[#E5C77B]" />
                      <span>Upload New Photograph</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {uploadedImageUrl && (
                      <div className="mt-4 p-3 bg-[#191919] border border-[#B58B3B]/40 rounded space-y-2 text-left">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-[#E5C77B] font-medium truncate">{uploadedFileName}</span>
                          <button type="button" onClick={clearUploadedImage} className="text-[#A7A39A] hover:text-[#F5F0E5]">Remove</button>
                        </div>
                        <img src={uploadedImageUrl} alt="Uploaded structural inspection evidence" className="w-full max-h-96 object-contain rounded border border-[#222222] bg-[#090909]" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 'diagnosis' && currentScanResult && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#F5F0E5]">AI Structural Diagnosis & Analysis Results</h1>
                  <p className="text-sm text-[#A7A39A]">Preliminary computer-vision telemetry report for {currentScanResult.buildingName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCurrentScreen('map')} className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded font-mono flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> View on Map
                  </button>
                  <button onClick={() => setCurrentScreen('reports')} className="px-4 py-2 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded flex items-center gap-2">
                    <FileText className="w-4 h-4" /> View Full Report
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-[#A7A39A]">Fissure Detection Overlay</span>
                    {!currentScanResult.isUploadedImage && (
                      <button onClick={() => setShowBoundingBoxes(!showBoundingBoxes)} className="px-3 py-1 bg-[#222222] text-xs font-mono text-[#E5C77B] rounded">
                        {showBoundingBoxes ? 'Hide Overlays' : 'Show Overlays'}
                      </button>
                    )}
                  </div>
                  <div className="h-80 rounded overflow-hidden relative border border-[#222222]">
                    <img src={currentScanResult.imageUrl} alt="Structural inspection scan" className="w-full h-full object-cover" />
                    {!currentScanResult.isUploadedImage && showBoundingBoxes && (
                      <div className="absolute top-1/4 left-1/3 w-36 h-20 border-2 border-red-500 bg-red-500/10 rounded flex items-start p-1 animate-pulse">
                        <span className="bg-red-500 text-white text-[9px] font-mono px-1 rounded">Fissure ID #A4-01 ({currentScanResult.crackWidth})</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                  {currentScanResult.isUploadedImage ? (
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#B58B3B]/15 border border-[#B58B3B]/40 text-[11px] font-semibold text-[#E5C77B] uppercase tracking-wider">
                        CV Model Offline — {currentScanResult.engineerClassification ? 'Engineer Review Recorded' : 'Manual Review Required'}
                      </div>
                      <p className="text-xs text-[#A7A39A] leading-relaxed">
                        Custom photographic evidence uploaded. Automated fissure detection inference is unavailable in local mode—no AI severity score has been generated.
                      </p>
                      <div className="p-3 rounded bg-[#090909] border border-[#222222] text-[11px] text-[#A7A39A]">
                        <strong className="text-[#F5F0E5] block mb-1">Engineering Notice (AS 4349):</strong>
                        Visual evidence must be inspected and classified by a qualified structural engineer prior to issuing a condition rating.
                      </div>
                      {currentScanResult.engineerClassification && (
                        <div className="p-3 rounded bg-[#090909] border border-[#B58B3B]/30 text-xs">
                          <strong className="block text-[#E5C77B] mb-1">Recorded classification: {currentScanResult.engineerClassification}</strong>
                          {currentScanResult.engineerObservation && <p className="text-[#A7A39A]">{currentScanResult.engineerObservation}</p>}
                        </div>
                      )}
                      <form onSubmit={handleEngineerReviewSubmit} className="space-y-3">
                        <h3 className="text-xs font-bold text-[#F5F0E5] uppercase tracking-wider">Engineer Classification &amp; Observation</h3>
                        <label className="block text-[11px] text-[#A7A39A]">
                          Defect severity
                          <select
                            required
                            value={engineerClassification}
                            onChange={e => setEngineerClassification(ENGINEER_CLASSIFICATIONS.find(level => level === e.target.value) || '')}
                            className="mt-1 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-xs text-[#F5F0E5]"
                          >
                            <option value="">Select a classification</option>
                            {ENGINEER_CLASSIFICATIONS.map(level => <option key={level} value={level}>{level}</option>)}
                          </select>
                        </label>
                        <label className="block text-[11px] text-[#A7A39A]">
                          Observation
                          <textarea
                            required
                            value={engineerObservation}
                            onChange={e => setEngineerObservation(e.target.value)}
                            rows={3}
                            placeholder="Describe the observed defect and relevant location..."
                            className="mt-1 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-xs text-[#F5F0E5] placeholder:text-[#77736B]"
                          />
                        </label>
                        <button type="submit" className="w-full py-2.5 bg-[#222222] hover:bg-[#333333] text-[#E5C77B] font-semibold text-xs rounded">
                          {currentScanResult.engineerClassification ? 'Update Engineer Review' : 'Save Engineer Review'}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => {
                          clearUploadedImage();
                          setCurrentScreen('scan');
                        }}
                        className="w-full py-2.5 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors"
                      >
                        Start Another Scan
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-sm font-bold text-[#F5F0E5] font-mono uppercase">{currentScanResult.concernLevel}</h3>
                      <p className="text-xs text-[#A7A39A] leading-relaxed">{currentScanResult.summary}</p>
                      <button onClick={() => setCurrentScreen('scan')} className="w-full py-2.5 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded">Start Another Scan</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentScreen === 'monitor' && (
            <div className="space-y-6">
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Building Memory™ & Longitudinal Monitoring</h1>
              <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-6">
                <h3 className="font-bold text-lg text-[#F5F0E5]">Parramatta Riverfront Residences — Column #14 Inspection Timeline</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-4 bg-[#090909] border border-[#222222] rounded space-y-3">
                    <div className="flex justify-between text-xs font-mono"><span className="text-[#A7A39A]">Baseline Scan</span><span>10 January 2026</span></div>
                    <img src="https://images.unsplash.com/photo-1541888946425-d0fbb18fefec?auto=format&fit=crop&w=1200&q=80" alt="Baseline" className="w-full h-56 object-cover rounded grayscale" />
                    <div className="text-xs font-mono text-[#E5C77B]">Recorded Width: 0.45 mm</div>
                  </div>
                  <div className="p-4 bg-[#090909] border border-[#222222] rounded space-y-3">
                    <div className="flex justify-between text-xs font-mono"><span className="text-[#E5C77B]">Latest Scan</span><span>28 October 2026</span></div>
                    <img src="https://images.unsplash.com/photo-1541888946425-d0fbb18fefec?auto=format&fit=crop&w=1200&q=80" alt="Latest" className="w-full h-56 object-cover rounded" />
                    <div className="text-xs font-mono text-red-400">Recorded Width: 0.65 mm (+44.4%)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentScreen === 'alerts' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Alerts & Notification Centre</h1>
                <button onClick={() => setAlerts(alerts.map(a => ({...a, read: true})))} className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded font-mono">Mark All as Read</button>
              </div>
              <div className="space-y-4">
                {alerts.map((alt) => (
                  <div key={alt.id} className="p-5 bg-[#191919] border border-[#222222] rounded flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-[#F5F0E5] text-sm">{alt.title} — <span className="text-[#E5C77B]">{alt.buildingName}</span></h3>
                      <p className="text-xs text-[#A7A39A] mt-1">{alt.description}</p>
                    </div>
                    <button onClick={() => setCurrentScreen('map')} className="px-3 py-1.5 bg-[#222222] text-xs text-[#E5C77B] rounded font-mono">Locate on Map</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentScreen === 'recommendations' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-[#F5F0E5]">AI Intelligent Recommendations</h1>
              <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-3">
                <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-red-500/20 text-red-400">Priority: High</span>
                <h3 className="font-bold text-base text-[#F5F0E5]">Certified Structural Engineering Assessment — Parramatta Riverfront Residences</h3>
                <p className="text-xs text-[#A7A39A]">Visible diagonal cracking identified in primary reinforced concrete column #14 has expanded by 44.4% over 9 months. Immediate engagement with a registered NPER structural engineer is strongly advised.</p>
              </div>
            </div>
          )}

          {currentScreen === 'reports' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Reports & Audit History</h1>
                <button onClick={() => window.print()} className="px-4 py-2.5 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded flex items-center gap-2"><Download className="w-4 h-4" /> Download PDF Report</button>
              </div>
              <div className="p-8 bg-[#191919] border border-[#222222] rounded space-y-6 max-w-4xl mx-auto">
                <h2 className="font-bold text-lg text-[#F5F0E5]">ARCHONIX STRUCTURAL TELEMETRY REPORT • ARC-2026-SYD-8821</h2>
                <p className="text-xs text-[#F5F0E5] leading-relaxed">Asset: Parramatta Riverfront Residences (Parramatta NSW 2150). Automated computer-vision analysis indicates diagonal micro-fissuring along primary reinforced concrete columns. Immediate professional structural inspection is required under AS 4349 protocols.</p>
              </div>
            </div>
          )}

          {currentScreen === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <h1 className="text-2xl font-bold text-[#F5F0E5]">Account Settings & Preferences</h1>
              <div className="p-6 bg-[#191919] border border-[#222222] rounded flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#F5F0E5]">Reset Demo Telemetry</h4>
                  <p className="text-[11px] text-[#A7A39A]">Restore initial Australian preloaded buildings and map pins.</p>
                </div>
                <button onClick={resetDemoData} className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 text-xs rounded">Reset Data</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}