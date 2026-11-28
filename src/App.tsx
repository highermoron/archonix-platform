import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSupabaseBuildings } from './hooks/useSupabaseBuildings';
import type { NewPinPayload } from './WorldMap';
import { supabase } from './lib/supabase';
import type { UserRole } from './archonix';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { 
  Building2, ShieldAlert, Cpu, Activity, FileText, Settings, 
  Bell, Plus, Upload, ArrowRight, Eye,
  LogOut, Lock, Mail, Menu, X, Zap,
  Compass, Download, MapPin, Search, ClipboardCheck, Clock, Users,
  CheckCircle, CircleAlert, History, Trash2, FileUp, CalendarClock,
  Radio, Sparkles
} from 'lucide-react';
import TelemetryPanel from './components/TelemetryPanel';
import { DemoAuthLanding } from './components/DemoAuthLanding';
import { 
  createDefaultBuildingTelemetry, 
  generateInitialTelemetry, 
  tickTelemetry, 
  executeSimulation, 
  subscribeToSupabaseTelemetry 
} from './lib/telemetryService';
import type { BuildingTelemetry, SimulationPreset } from './types/telemetry';

const WorldMap = React.lazy(() => import('./WorldMap'));

// --- TYPES ---
type Screen = 
  | 'login' 
  | 'onboarding'
  | 'password-reset'
  | 'dashboard' 
  | 'map'
  | 'buildings' 
  | 'add-building' 
  | 'import-buildings'
  | 'scan' 
  | 'diagnosis' 
  | 'review-queue'
  | 'audit-log'
  | 'monitor' 
  | 'alerts' 
  | 'recommendations' 
  | 'work-orders'
  | 'reports' 
  | 'settings';

type DemoOperatorRole = 'Structural Inspector' | 'Operations Lead';
type CurrentUserRole = UserRole | DemoOperatorRole | 'DEMO';

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
  buildingId?: string;
  scanId?: string;
  source?: 'manual' | 'demo';
}

interface ScanRecord {
  id: string;
  buildingId: string;
  buildingName: string;
  component: string;
  date: string;
  imageUrl: string;
  crackLength: string;
  crackWidth: string;
  concernLevel: 'Low Concern' | 'Moderate Concern' | 'High Concern' | 'Urgent Professional Assessment';
  observations: string[];
  summary: string;
  source?: 'manual' | 'demo';
  reviewStatus?: 'Draft' | 'Submitted' | 'Under Review' | 'Changes Requested' | 'Approved' | 'Closed';
  checklist?: { label: string; complete: boolean }[];
  checklistTemplateId?: string;
  createdBy?: string;
  reviewerNotes?: string[];
  updatedAt?: string;
}

interface WorkOrder {
  id: string;
  buildingId: string;
  title: string;
  description: string;
  assignedTo: string;
  dueDate: string;
  status: 'Open' | 'In Progress' | 'Completed';
  relatedScanId?: string;
  createdAt: string;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  component: string;
  items: string[];
}

interface AuditEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actor: string;
  timestamp: string;
  details: string;
}

interface OrganizationMembership {
  id: string;
  name: string;
  role: UserRole;
}

interface CsvImportRow {
  building: Building;
  line: number;
}

const DEFAULT_CHECKLIST: ChecklistTemplate = {
  id: 'checklist-general-visual',
  name: 'General visual inspection',
  component: 'All',
  items: [
    'Photograph the component and its surrounding context',
    'Record visible cracking, separation, or displacement',
    'Note visible moisture, staining, or corrosion',
    'Record the component location and access limitations',
    'Compare with prior records where available'
  ]
};

function isUserRole(value: unknown): value is UserRole {
  return value === 'administrator' || value === 'structural_engineer' || value === 'inspector' || value === 'viewer';
}

async function readOrganizationMembership(userId: string): Promise<OrganizationMembership | null> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', membership.organization_id)
    .single();
  if (organizationError) throw organizationError;
  if (!isUserRole(membership.role)) throw new Error('The organization has an unsupported member role.');
  return { id: membership.organization_id, name: organization.name, role: membership.role };
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
    } else if (closedQuote) {
      if (character === ',') {
        row.push(field.trim());
        field = '';
        closedQuote = false;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        row.push(field.trim());
        if (row.some(value => value.length > 0)) rows.push(row);
        row = [];
        field = '';
        closedQuote = false;
      } else if (!/\s/.test(character)) {
        throw new Error('CSV contains unexpected characters after a quoted field.');
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error('CSV contains a quote inside an unquoted field.');
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

const LEGACY_GLOBAL_DEMO_IMAGE_URL = 'https://images.unsplash.com/photo-1541888946425-d0fbb18fefec?auto=format&fit=crop&w=1200&q=80';
const LEGACY_DCM_DEMO_IMAGE_URL = 'https://dcmyesschool.com/storage/assets/hero-banners/1791887233_website%20banner%20%2802%29.jpg';
const LEGACY_DCM_DEMO_DESCRIPTION = 'Urgent assessment requested by the user. The official school website photo is a visual reference only, not inspection evidence. No on-site inspection or structural findings are recorded; construction year and floor count are unverified.';

// --- INITIAL GLOBAL DEMO DATA WITH REPRESENTATIVE COORDINATES ---
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
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
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
  },
  {
    id: 'bld-world-001',
    name: 'The Shard',
    location: 'London, United Kingdom',
    lat: 51.5045,
    lng: -0.0865,
    type: 'Commercial',
    year: 2013,
    floors: 72,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-002',
    name: 'Empire State Building',
    location: 'New York, United States',
    lat: 40.7484,
    lng: -73.9857,
    type: 'Commercial',
    year: 1931,
    floors: 102,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-003',
    name: 'Eiffel Tower',
    location: 'Paris, France',
    lat: 48.8584,
    lng: 2.2945,
    type: 'Other',
    year: 1889,
    floors: 3,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-004',
    name: 'Burj Khalifa',
    location: 'Dubai, United Arab Emirates',
    lat: 25.1972,
    lng: 55.2744,
    type: 'Commercial',
    year: 2010,
    floors: 163,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-005',
    name: 'Marina Bay Sands',
    location: 'Singapore',
    lat: 1.2834,
    lng: 103.8607,
    type: 'Commercial',
    year: 2010,
    floors: 57,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-006',
    name: 'Tokyo Tower',
    location: 'Tokyo, Japan',
    lat: 35.6586,
    lng: 139.7454,
    type: 'Other',
    year: 1958,
    floors: 5,
    description: 'Illustrative global demo pin only. Verify this asset and its coordinates before operational use; no condition assessment is represented.',
    status: 'Monitoring Required',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'bld-world-007',
    name: 'DCM YES School (Assessment Requested)',
    location: 'Block-B, Rajguru Nagar, Ludhiana, Punjab 141012, India',
    lat: 30.87818,
    lng: 75.782954,
    type: 'Institutional',
    year: 0,
    floors: 0,
    description: 'Urgent assessment requested by the user. The official school website campus illustration is for visual reference only, not a site photo or inspection evidence. No on-site inspection or structural findings are recorded; construction year and floor count are unverified.',
    status: 'Urgent Assessment',
    lastScanDate: 'Not scanned',
    imageUrl: 'https://dcmyesschool.com/storage/facilities/01.png',
    incidentNote: 'User-requested urgent assessment designation; no inspection findings recorded.'
  }
];

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'alt-1',
    title: 'Diagonal Shear Fissure Detected',
    buildingName: 'Parramatta Riverfront Residences',
    timestamp: 'Today, 08:42 AM',
    severity: 'High',
    description: 'Preloaded demo alert for a sample diagonal crack observation. No image analysis was performed.',
    recommendation: 'Arrange a certified structural engineering inspection within 14 business days.',
    read: false,
    buildingId: 'bld-002',
    scanId: 'scn-001',
    source: 'demo'
  },
  {
    id: 'alt-2',
    title: 'Basement Slab Moisture Seepage & Efflorescence',
    buildingName: 'Barangaroo Commercial Tower 4',
    timestamp: 'Yesterday, 04:15 PM',
    severity: 'Moderate',
    description: 'Preloaded demo alert for a sample moisture and efflorescence observation.',
    recommendation: 'Log in Building Memory and compare with previous quarter waterproofing scan.',
    read: false,
    buildingId: 'bld-001',
    scanId: 'scn-002',
    source: 'demo'
  },
  {
    id: 'alt-3',
    title: 'Scheduled Bi-Annual Structural Health Audit Due',
    buildingName: 'Silverwater Logistics Distribution Hub',
    timestamp: '02 November 2026',
    severity: 'Low',
    description: 'Routine compliance window open for annual AS 4349 property condition evaluation.',
    recommendation: 'Schedule a routine inspection and record findings in the workspace.',
    read: true,
    buildingId: 'bld-003',
    source: 'demo'
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
    summary: 'Preloaded demo record. The observations and measurements are illustrative only and are not an engineering assessment.',
    source: 'demo'
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
    summary: 'Preloaded demo record. The observations and measurements are illustrative only and are not an engineering assessment.',
    source: 'demo'
  }
];

function formatRecordDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function currentLocalDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeLocalId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function currentTimestamp() {
  return new Date().toISOString();
}

function dateAfterDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function persistJson(key: string, value: unknown): string | null {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('archonix:storage', { detail: { key, error: null, operation: 'write' } }));
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser storage error';
    console.error(`Could not persist ${key}:`, message);
    window.dispatchEvent(new CustomEvent('archonix:storage', { detail: { key, error: message, operation: 'write' } }));
    return message;
  }
}

function reportStorageError(key: string, error: string) {
  console.error(`Could not read ${key}:`, error);
  window.dispatchEvent(new CustomEvent('archonix:storage', { detail: { key, error, operation: 'read' } }));
}

function workspaceStorageKey(key: string, scope: string) {
  return scope === 'demo' ? key : `${key}_${scope}`;
}

function readStoredJson<T>(
  key: string,
  fallback: T,
  onError: (key: string, message: string) => void = reportStorageError
): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;

    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) throw new Error('Saved data is not a list.');
    return parsed as T;
  } catch (error) {
    onError(key, error instanceof Error ? error.message : 'Invalid saved data.');
    return fallback;
  }
}

function readWorkspaceJson<T>(key: string, scope: string, fallback: T): T {
  return readStoredJson(workspaceStorageKey(key, scope), fallback);
}

function statusForConcern(concern: ScanRecord['concernLevel']): Building['status'] {
  if (concern === 'Urgent Professional Assessment') return 'Urgent Assessment';
  if (concern === 'High Concern') return 'Inspection Recommended';
  if (concern === 'Moderate Concern') return 'Monitoring Required';
  return 'Low Concern';
}

function addMissingBuildingTelemetry(
  telemetry: Record<string, BuildingTelemetry>,
  buildings: Pick<Building, 'id' | 'name'>[]
): Record<string, BuildingTelemetry> {
  let next = telemetry;
  for (const building of buildings) {
    if (!next[building.id]) {
      next = {
        ...next,
        [building.id]: createDefaultBuildingTelemetry(building.id, building.name)
      };
    }
  }
  return next;
}

const DEFAULT_NEW_BUILDING = {
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
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isDemoSession, setIsDemoSession] = useState<boolean>(false);
  const isDemoSessionRef = useRef(false);
  const [authLoading, setAuthLoading] = useState<boolean>(Boolean(supabase));
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [passwordConfirmInput, setPasswordConfirmInput] = useState('');
  const [todayDate, setTodayDate] = useState(currentLocalDate);
  const [reportGeneratedDate] = useState(() => new Date().toLocaleDateString());
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string; role: CurrentUserRole } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const workspaceStorageScope = isDemoSession ? 'demo' : userId ? `user-${userId}` : null;
  const [dataScopeLoaded, setDataScopeLoaded] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [organizationNameInput, setOrganizationNameInput] = useState('');
  const [invitationTokenInput, setInvitationTokenInput] = useState('');
  const [organizationSubmitting, setOrganizationSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('lachlan.ross@archonix.com.au');
  const [fullNameInput, setFullNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [emailUpdateNotice, setEmailUpdateNotice] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<UserRole, 'administrator'>>('viewer');
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const { buildings: supabaseBuildings, loading: buildingsLoading, error: buildingsError } = useSupabaseBuildings();
  const [initialLocalData] = useState(() => {
    const errors: string[] = [];
    const collectError = (key: string, message: string) => {
      console.error(`Could not read ${key}:`, message);
      errors.push(`Could not read ${key}: ${message}`);
    };

    return {
      buildings: readStoredJson('archonix_buildings_au_v2', INITIAL_BUILDINGS, collectError),
      alerts: readStoredJson('archonix_alerts_au_v2', INITIAL_ALERTS, collectError),
      scans: readStoredJson('archonix_scans_au_v2', INITIAL_SCANS, collectError),
      workOrders: readStoredJson('archonix_work_orders_au_v1', [], collectError),
      checklistTemplates: readStoredJson('archonix_checklist_templates_v1', [DEFAULT_CHECKLIST], collectError),
      auditLog: readStoredJson('archonix_audit_log_v1', [], collectError),
      errors
    };
  });
  const [storageError, setStorageError] = useState<string | null>(() =>
    initialLocalData.errors.length > 0 ? initialLocalData.errors.join('; ') : null
  );

  const [buildings, setBuildings] = useState<Building[]>(initialLocalData.buildings);
  const activeBuildings = useMemo(() => {
    if (supabaseBuildings.length === 0) {
      if (isDemoSession && buildings.length === 0) return INITIAL_BUILDINGS;
      return buildings;
    }

    const remoteIds = new Set(supabaseBuildings.map(building => building.id));
    const localAdditions = buildings.filter(building =>
      !INITIAL_BUILDINGS.some(initial => initial.id === building.id) && !remoteIds.has(building.id)
    );

    const remoteBuildings: Building[] = supabaseBuildings.map(profile => {
      const local = buildings.find(building => building.id === profile.id);
      const classification = (profile.building_classification || 'Other').toLowerCase();
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
        year: profile.construction_year || 2022,
        floors: profile.floors_above_ground || 1,
        description: profile.description || 'Structural asset loaded from the connected database.',
        status: local?.status || status,
        healthIndex: local?.healthIndex,
        lastScanDate: local?.lastScanDate || 'Not scanned',
        imageUrl: local?.imageUrl || INITIAL_BUILDINGS[0].imageUrl,
        incidentNote: local?.incidentNote
      };
    });

    return [...remoteBuildings, ...localAdditions];
  }, [buildings, supabaseBuildings, isDemoSession]);

  const [alerts, setAlerts] = useState<AlertItem[]>(initialLocalData.alerts);

  const [scans, setScans] = useState<ScanRecord[]>(initialLocalData.scans);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialLocalData.workOrders);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('bld-002');
  const activeSelectedBuildingId = activeBuildings.some(building => building.id === selectedBuildingId)
    ? selectedBuildingId
    : activeBuildings[0]?.id || '';
  const [activeScanComponent, setActiveScanComponent] = useState<string>('Columns');
  const [currentScanResult, setCurrentScanResult] = useState<ScanRecord | null>(scans[0]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [scanConcern, setScanConcern] = useState<ScanRecord['concernLevel']>('Low Concern');
  const [scanCrackLength, setScanCrackLength] = useState('');
  const [scanCrackWidth, setScanCrackWidth] = useState('');
  const [scanNotes, setScanNotes] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [buildingTypeFilter, setBuildingTypeFilter] = useState('All types');
  const [buildingStatusFilter, setBuildingStatusFilter] = useState('All statuses');
  const [buildingSort, setBuildingSort] = useState('Name (A–Z)');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('All severities');
  const [reportBuildingId, setReportBuildingId] = useState('');
  const [workOrderBuildingId, setWorkOrderBuildingId] = useState('');
  const [workOrderTitle, setWorkOrderTitle] = useState('');
  const [workOrderDescription, setWorkOrderDescription] = useState('');
  const [workOrderAssignee, setWorkOrderAssignee] = useState('');
  const [workOrderDueDate, setWorkOrderDueDate] = useState('');
  const [workOrderError, setWorkOrderError] = useState<string | null>(null);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>(initialLocalData.checklistTemplates);
  const [selectedChecklistId, setSelectedChecklistId] = useState(DEFAULT_CHECKLIST.id);
  const [checklistResponses, setChecklistResponses] = useState<Record<string, boolean>>({});
  const [checklistNameInput, setChecklistNameInput] = useState('');
  const [checklistComponentInput, setChecklistComponentInput] = useState('All');
  const [checklistItemsInput, setChecklistItemsInput] = useState('');
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>(initialLocalData.auditLog);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [buildingCsvPreview, setBuildingCsvPreview] = useState<CsvImportRow[]>([]);
  const [buildingCsvErrors, setBuildingCsvErrors] = useState<string[]>([]);
  const [buildingCsvName, setBuildingCsvName] = useState('');
  const [buildingRegistrationError, setBuildingRegistrationError] = useState<string | null>(null);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const availableChecklistTemplates = checklistTemplates.filter(template =>
    template.component === 'All' || template.component === activeScanComponent
  );
  const selectedChecklist = availableChecklistTemplates.find(template => template.id === selectedChecklistId)
    || availableChecklistTemplates[0];

  const [newBuilding, setNewBuilding] = useState(DEFAULT_NEW_BUILDING);

  // --- LIVE IOT STRUCTURAL HEALTH TELEMETRY STATE ---
  const [telemetryState, setTelemetryState] = useState<Record<string, BuildingTelemetry>>(() =>
    generateInitialTelemetry(INITIAL_BUILDINGS)
  );
  const telemetryMap = useMemo(
    () => addMissingBuildingTelemetry(telemetryState, activeBuildings),
    [telemetryState, activeBuildings]
  );
  const [isTelemetryStreaming, setIsTelemetryStreaming] = useState<boolean>(true);
  const [monitorActiveTab, setMonitorActiveTab] = useState<'telemetry' | 'memory'>('telemetry');

  // Live telemetry ticker loop: simulates real-time micro-fluctuations every 2.5s
  useEffect(() => {
    if (!isTelemetryStreaming) return;
    const interval = window.setInterval(() => {
      setTelemetryState(prev => tickTelemetry(addMissingBuildingTelemetry(prev, activeBuildings)));
    }, 2500);
    return () => window.clearInterval(interval);
  }, [isTelemetryStreaming, activeBuildings]);

  // Optional Supabase Realtime Telemetry Subscription
  useEffect(() => {
    const unsubscribe = subscribeToSupabaseTelemetry((reading) => {
      setTelemetryState(prev => {
        const completeTelemetry = addMissingBuildingTelemetry(prev, activeBuildings);
        const bld = completeTelemetry[reading.building_id];
        if (!bld) return completeTelemetry;
        const now = new Date().toLocaleTimeString();
        const sensorKey = reading.sensor_type as keyof typeof bld.sensors;
        if (!bld.sensors[sensorKey]) return completeTelemetry;

        const currentSensor = bld.sensors[sensorKey];
        const val = Number(reading.value);
        const status = val >= currentSensor.criticalThreshold ? 'critical' : val >= currentSensor.warningThreshold ? 'warning' : 'normal';

        return {
          ...completeTelemetry,
          [reading.building_id]: {
            ...bld,
            lastUpdated: now,
            sensors: {
              ...bld.sensors,
              [sensorKey]: {
                ...currentSensor,
                value: val,
                status,
                timestamp: now,
                history: [...currentSensor.history.slice(1), val]
              }
            }
          }
        };
      });
    });

    return () => unsubscribe();
  }, [activeBuildings]);

  useEffect(() => {
    const handleStorageResult = (event: Event) => {
      const { key, error, operation } = (event as CustomEvent<{
        key: string;
        error: string | null;
        operation: 'read' | 'write';
      }>).detail;
      const errorPrefix = operation === 'read' ? `Could not read ${key}:` : `Could not save ${key}:`;
      setStorageError(current => error ? `${errorPrefix} ${error}` : current?.startsWith(errorPrefix) ? null : current);
    };
    window.addEventListener('archonix:storage', handleStorageResult);
    return () => window.removeEventListener('archonix:storage', handleStorageResult);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTodayDate(currentLocalDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const scope = workspaceStorageScope;
    if (!scope || dataScopeLoaded === scope) return;
    const timer = window.setTimeout(() => {
      const demoScope = scope === 'demo';
      const savedChecklists = readWorkspaceJson<ChecklistTemplate[]>(
        'archonix_checklist_templates_v1',
        scope,
        [DEFAULT_CHECKLIST]
      );
      const loadedChecklists = savedChecklists.length > 0 ? savedChecklists : [DEFAULT_CHECKLIST];
      const savedBuildings = readWorkspaceJson<Building[]>(
        'archonix_buildings_au_v2',
        scope,
        demoScope ? INITIAL_BUILDINGS : []
      );
      const loadedBuildings = demoScope
        ? [
            ...savedBuildings.map(saved => {
              const initial = INITIAL_BUILDINGS.find(building => building.id === saved.id);
              if (!initial) return saved;

              const needsImageUpdate = saved.imageUrl === LEGACY_GLOBAL_DEMO_IMAGE_URL
                || (saved.id === 'bld-world-007' && saved.imageUrl === LEGACY_DCM_DEMO_IMAGE_URL);
              const needsSchoolDescriptionUpdate = saved.id === 'bld-world-007'
                && saved.description === LEGACY_DCM_DEMO_DESCRIPTION;
              return needsImageUpdate || needsSchoolDescriptionUpdate
                ? {
                    ...saved,
                    name: initial.name,
                    imageUrl: needsImageUpdate ? initial.imageUrl : saved.imageUrl,
                    description: needsSchoolDescriptionUpdate ? initial.description : saved.description
                  }
                : { ...saved, name: initial.name };
            }),
            ...INITIAL_BUILDINGS.filter(initial =>
              !savedBuildings.some(saved => saved.id === initial.id)
            )
          ]
        : savedBuildings;
      setBuildings(loadedBuildings);
      setAlerts(readWorkspaceJson('archonix_alerts_au_v2', scope, demoScope ? INITIAL_ALERTS : []));
      setScans(readWorkspaceJson('archonix_scans_au_v2', scope, demoScope ? INITIAL_SCANS : []));
      setWorkOrders(readWorkspaceJson('archonix_work_orders_au_v1', scope, []));
      setChecklistTemplates(loadedChecklists);
      setSelectedChecklistId(loadedChecklists[0].id);
      setAuditLog(readWorkspaceJson('archonix_audit_log_v1', scope, []));
      setCurrentScanResult(demoScope ? INITIAL_SCANS[0] : null);
      setEditingRecordId(null);
      setSelectedBuildingId(demoScope ? 'bld-002' : '');
      setActiveScanComponent('Columns');
      setScanConcern('Low Concern');
      setScanCrackLength('');
      setScanCrackWidth('');
      setChecklistResponses({});
      setNewBuilding(DEFAULT_NEW_BUILDING);
      setUploadedImageUrl(null);
      setUploadedFileName(null);
      setScanNotes('');
      setScanError(null);
      setReviewNote('');
      setReviewError(null);
      setWorkOrderBuildingId('');
      setWorkOrderTitle('');
      setWorkOrderDescription('');
      setWorkOrderAssignee('');
      setWorkOrderDueDate('');
      setWorkOrderError(null);
      setBuildingCsvPreview([]);
      setBuildingCsvErrors([]);
      setBuildingCsvName('');
      setGeneratedInvite(null);
      setInviteEmail('');
      setInviteError(null);
      setDataScopeLoaded(scope);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_buildings_au_v2', workspaceStorageScope), buildings);
    }
  }, [buildings, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_alerts_au_v2', workspaceStorageScope), alerts);
    }
  }, [alerts, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_scans_au_v2', workspaceStorageScope), scans);
    }
  }, [scans, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_work_orders_au_v1', workspaceStorageScope), workOrders);
    }
  }, [workOrders, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_checklist_templates_v1', workspaceStorageScope), checklistTemplates);
    }
  }, [checklistTemplates, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (workspaceStorageScope && dataScopeLoaded === workspaceStorageScope) {
      persistJson(workspaceStorageKey('archonix_audit_log_v1', workspaceStorageScope), auditLog);
    }
  }, [auditLog, workspaceStorageScope, dataScopeLoaded]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;
    const applySession = (session: Session | null, event?: AuthChangeEvent) => {
      if (!active) return;
      if (!session) {
        if (!isDemoSessionRef.current) {
          setCurrentUser(null);
          setUserId(null);
          setOrganizationId(null);
          setOrganizationName('');
          setIsAuthenticated(false);
          setOrganizationLoading(false);
          setOrganizationError(null);
        }
        return;
      }

      setCurrentUser({
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.user_metadata.full_name || session.user.email || 'Team member',
        role: 'viewer'
      });
      setUserId(session.user.id);
      setOrganizationLoading(true);
      setOrganizationError(null);
      isDemoSessionRef.current = false;
      setIsDemoSession(false);
      setIsAuthenticated(true);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      setCurrentScreen(event === 'PASSWORD_RECOVERY' ? 'password-reset' : 'onboarding');
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      applySession(data.session, 'INITIAL_SESSION');
      if (active) setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session, event);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId || isDemoSession || isPasswordRecovery) return;
    let active = true;

    void readOrganizationMembership(userId).then(membership => {
      if (!active) return;
      if (!membership) {
        setOrganizationId(null);
        setOrganizationName('');
        setOrganizationLoading(false);
        setCurrentScreen('onboarding');
        return;
      }

      setOrganizationId(membership.id);
      setOrganizationName(membership.name);
      setCurrentUser(current => current ? { ...current, role: membership.role } : current);
      setOrganizationLoading(false);
      setCurrentScreen('dashboard');
    }).catch(error => {
      if (!active) return;
      setOrganizationError(error instanceof Error ? error.message : 'Could not load organization membership.');
      setOrganizationLoading(false);
      setCurrentScreen('onboarding');
    });

    return () => {
      active = false;
    };
  }, [userId, isDemoSession, isPasswordRecovery]);

  const canEdit = isDemoSession || currentUser?.role === 'administrator'
    || currentUser?.role === 'structural_engineer' || currentUser?.role === 'inspector';
  const canManageBuildings = isDemoSession || currentUser?.role === 'administrator';
  const canReview = isDemoSession || currentUser?.role === 'administrator'
    || currentUser?.role === 'structural_engineer';

  const recordAudit = (action: string, entity: string, entityId: string, details: string) => {
    const event: AuditEvent = {
      id: makeLocalId('audit'),
      action,
      entity,
      entityId,
      actor: currentUser?.email || 'Demo workspace',
      timestamp: currentTimestamp(),
      details
    };
    setAuditLog(current => [event, ...current].slice(0, 500));
  };

  const handleSimulateTelemetry = (preset: SimulationPreset, targetBuildingId?: string) => {
    const result = executeSimulation(preset, telemetryMap, targetBuildingId);
    setTelemetryState(result.updatedTelemetry);

    if (result.generatedAlert) {
      const newAlert: AlertItem = {
        id: makeLocalId('alt-iot'),
        title: result.generatedAlert.title,
        buildingName: result.generatedAlert.buildingName,
        timestamp: 'Just now',
        severity: result.generatedAlert.severity,
        description: result.generatedAlert.description,
        recommendation: result.generatedAlert.recommendation,
        read: false,
        buildingId: result.generatedAlert.buildingId,
        source: 'demo'
      };

      setAlerts(current => [newAlert, ...current]);
      recordAudit(
        `IoT Telemetry Breach: ${result.generatedAlert.title}`,
        'Telemetry',
        result.generatedAlert.buildingId,
        result.generatedAlert.description
      );
    } else if (preset === 'baseline') {
      recordAudit('Reset IoT telemetry sensors', 'Telemetry', 'all', 'All structural health telemetry sensors reset to safe nominal baseline.');
    }
  };

  const handleOrganizationSetup = async (event: React.FormEvent, mode: 'create' | 'join') => {
    event.preventDefault();
    if (!supabase || !userId) {
      setOrganizationError('Sign in to create or join an organization.');
      return;
    }

    setOrganizationSubmitting(true);
    setOrganizationError(null);
    try {
      if (mode === 'create') {
        const name = organizationNameInput.trim();
        if (name.length < 2 || name.length > 120) {
          throw new Error('Organization name must be between 2 and 120 characters.');
        }
        const { error } = await supabase.rpc('create_organization', { organization_name: name });
        if (error) throw error;
      } else {
        const token = invitationTokenInput.trim();
        if (!token) throw new Error('Enter the invitation token supplied by your organization administrator.');
        const { error } = await supabase.rpc('join_organization', { invitation_token: token });
        if (error) throw error;
      }

      const membership = await readOrganizationMembership(userId);
      if (!membership) throw new Error('The organization action completed, but membership could not be loaded. Sign out and sign in again.');
      setOrganizationId(membership.id);
      setOrganizationName(membership.name);
      setCurrentUser(current => current ? { ...current, role: membership.role } : current);
      recordAudit(mode === 'create' ? 'Created organization' : 'Joined organization', 'Organization', membership.id, membership.name);
      setCurrentScreen('dashboard');
    } catch (error) {
      setOrganizationError(error instanceof Error ? error.message : 'Organization setup failed.');
    } finally {
      setOrganizationSubmitting(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    setAuthError(null);
    setAuthNotice(null);
    if (!supabase) {
      setAuthError('Password recovery is unavailable because Supabase is not configured.');
      return;
    }
    if (!userEmail.trim()) {
      setAuthError('Enter your account email first.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail.trim(), {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setAuthNotice('If an account exists for that email, a password reset link has been sent.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not request a password reset.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setAuthError(null);
    setAuthNotice(null);
    if (!supabase) {
      setAuthError('Email confirmation is unavailable because Supabase is not configured.');
      return;
    }
    if (!userEmail.trim()) {
      setAuthError('Enter the email address you used to sign up first.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail.trim(),
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setAuthNotice('If that address has a pending confirmation, a new link has been sent.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not resend the confirmation email.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    if (passwordInput.length < 8) {
      setAuthError('Use a password with at least 8 characters.');
      return;
    }
    if (passwordInput !== passwordConfirmInput) {
      setAuthError('The passwords do not match.');
      return;
    }
    if (!supabase) {
      setAuthError('Password updates are unavailable because Supabase is not configured.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordInput });
      if (error) throw error;
      setPasswordInput('');
      setPasswordConfirmInput('');
      setIsPasswordRecovery(false);
      setAuthNotice('Password updated successfully.');
      setCurrentScreen(organizationId ? 'dashboard' : 'onboarding');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not update your password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailUpdateNotice(null);
    if (!supabase || !newAccountEmail.trim()) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: newAccountEmail.trim() });
      if (error) throw error;
      setEmailUpdateNotice('Check your email to confirm the address change. Your account email updates after confirmation.');
      setNewAccountEmail('');
      recordAudit('Requested email change', 'Account', currentUser?.id || '', 'Email change confirmation requested.');
    } catch (error) {
      setEmailUpdateNotice(error instanceof Error ? error.message : 'Could not update the account email.');
    }
  };

  const handleCreateInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviteError(null);
    setGeneratedInvite(null);
    if (!supabase || currentUser?.role !== 'administrator') {
      setInviteError('Only organization administrators can invite members.');
      return;
    }
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_organization_invite', {
        p_invited_email: inviteEmail.trim(),
        p_invited_role: inviteRole
      });
      if (error) throw error;
      if (typeof data !== 'string' || !data) throw new Error('The invitation token was not returned.');
      setGeneratedInvite(data);
      recordAudit('Created organization invitation', 'Invitation', inviteEmail.trim(), `Invitation created for role ${inviteRole}.`);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Could not create the organization invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleAddChecklist = (event: React.FormEvent) => {
    event.preventDefault();
    const items = checklistItemsInput.split('\n').map(item => item.trim()).filter(Boolean);
    if (!checklistNameInput.trim() || items.length === 0) {
      setChecklistError('Enter a template name and at least one checklist item.');
      return;
    }
    const template: ChecklistTemplate = {
      id: makeLocalId('checklist'),
      name: checklistNameInput.trim(),
      component: checklistComponentInput,
      items
    };
    setChecklistTemplates(current => [...current, template]);
    setSelectedChecklistId(template.id);
    setChecklistNameInput('');
    setChecklistItemsInput('');
    setChecklistError(null);
    recordAudit('Created checklist template', 'Checklist template', template.id, template.name);
  };

  const handleDeleteChecklist = (template: ChecklistTemplate) => {
    if (checklistTemplates.length <= 1) return;
    setChecklistTemplates(current => current.filter(item => item.id !== template.id));
    if (selectedChecklistId === template.id) {
      setSelectedChecklistId(checklistTemplates.find(item => item.id !== template.id)?.id || DEFAULT_CHECKLIST.id);
    }
    recordAudit('Deleted checklist template', 'Checklist template', template.id, template.name);
  };

  const handleBuildingCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBuildingCsvName(file.name);
    setBuildingCsvPreview([]);
    setBuildingCsvErrors([]);

    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a file with a .csv extension.');
      if (file.size > 5 * 1024 * 1024) throw new Error('CSV files must be 5 MB or smaller.');
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row.');
      if (rows.length > 10_001) throw new Error('CSV imports are limited to 10,000 data rows.');
      const headers = rows[0].map(header => header.toLowerCase().replace(/[\s_-]+/g, ''));
      if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
      const headerIndex = new Map(headers.map((header, index) => [header, index]));
      const requiredHeaders = ['name', 'location', 'lat', 'lng'];
      const missingHeaders = requiredHeaders.filter(header => !headerIndex.has(header));
      if (missingHeaders.length) throw new Error(`Missing required columns: ${missingHeaders.join(', ')}.`);

      const imported: CsvImportRow[] = [];
      const errors: string[] = [];
      const knownBuildings = new Set(activeBuildings.map(building => `${building.name.toLowerCase()}|${building.location.toLowerCase()}`));
      const getValue = (row: string[], key: string) => row[headerIndex.get(key) ?? -1]?.trim() || '';

      rows.slice(1).forEach((row, index) => {
        const line = index + 2;
        const name = getValue(row, 'name');
        const location = getValue(row, 'location');
        const latitude = Number(getValue(row, 'lat'));
        const longitude = Number(getValue(row, 'lng'));
        const typeText = getValue(row, 'type').toLowerCase();
        const type = (['residential', 'commercial', 'industrial', 'institutional', 'other'].includes(typeText)
          ? typeText[0].toUpperCase() + typeText.slice(1)
          : typeText ? '' : 'Other') as Building['type'];
        const yearText = getValue(row, 'year');
        const floorsText = getValue(row, 'floors');
        const year = yearText ? Number(yearText) : new Date().getFullYear();
        const floors = floorsText ? Number(floorsText) : 1;
        const identity = `${name.toLowerCase()}|${location.toLowerCase()}`;
        const rowErrors: string[] = [];

        if (row.length > headers.length) rowErrors.push('row has more values than the header');
        if (!name) rowErrors.push('name is required');
        if (!location) rowErrors.push('location is required');
        if (!getValue(row, 'lat')) rowErrors.push('lat is required');
        if (!getValue(row, 'lng')) rowErrors.push('lng is required');
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) rowErrors.push('lat must be between -90 and 90');
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) rowErrors.push('lng must be between -180 and 180');
        if (typeText && !type) rowErrors.push('type must be Residential, Commercial, Industrial, Institutional, or Other');
        if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 2) rowErrors.push('year is invalid');
        if (!Number.isInteger(floors) || floors < 1 || floors > 300) rowErrors.push('floors must be between 1 and 300');
        if (knownBuildings.has(identity)) rowErrors.push('building name and location already exist');

        if (rowErrors.length) {
          errors.push(`Row ${line}: ${rowErrors.join('; ')}.`);
          return;
        }
        knownBuildings.add(identity);
        imported.push({
          line,
          building: {
            id: `bld-${crypto.randomUUID()}`,
            name,
            location,
            lat: latitude,
            lng: longitude,
            type,
            year,
            floors,
            description: getValue(row, 'description') || 'Imported from CSV.',
            status: 'Low Concern',
            lastScanDate: 'Not scanned',
            imageUrl: INITIAL_BUILDINGS[0].imageUrl
          }
        });
      });

      setBuildingCsvPreview(imported);
      setBuildingCsvErrors(errors);
    } catch (error) {
      setBuildingCsvErrors([error instanceof Error ? error.message : 'Could not parse the CSV file.']);
    }
  };

  const importValidBuildings = () => {
    if (!canManageBuildings || buildingCsvPreview.length === 0) return;
    const imported = buildingCsvPreview.map(row => row.building);
    setBuildings(current => [...imported, ...current]);
    recordAudit('Imported buildings from CSV', 'Building portfolio', buildingCsvName, `${imported.length} valid buildings imported; ${buildingCsvErrors.length} rows skipped.`);
    setBuildingCsvPreview([]);
    setBuildingCsvErrors([]);
    setBuildingCsvName('');
    setCurrentScreen('buildings');
  };

  const downloadBuildingCsvTemplate = () => {
    const csv = 'name,location,lat,lng,type,year,floors,description\r\nExample Building,Sydney NSW 2000,-33.8688,151.2093,Commercial,2020,12,Optional description\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'archonix-buildings-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const requestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setBrowserNotificationPermission('unsupported');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotificationPermission(permission);
    } catch (error) {
      setStorageError(error instanceof Error ? `Browser notification permission: ${error.message}` : 'Could not request notification permission.');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    if (!supabase) {
      setAuthError('Account access is unavailable because Supabase is not configured. Use the clearly labelled demo workspace instead.');
      return;
    }

    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: userEmail,
          password: passwordInput,
          options: { data: { full_name: fullNameInput.trim() } }
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        if (!data.session) {
          setAuthNotice('Account created. Check your email for a confirmation link, then sign in.');
          setPasswordInput('');
          setIsSignUp(false);
          return;
        }

        const roles: UserRole[] = ['administrator', 'structural_engineer', 'inspector', 'viewer'];
        const role = data.session.user.app_metadata.role;
        setCurrentUser({
          id: data.session.user.id,
          email: data.session.user.email || userEmail,
          name: data.session.user.user_metadata.full_name || fullNameInput.trim() || userEmail,
          role: roles.includes(role) ? role : 'viewer'
        });
        setOrganizationLoading(true);
        setUserId(data.session.user.id);
        isDemoSessionRef.current = false;
        setIsDemoSession(false);
        setIsAuthenticated(true);
        setCurrentScreen('onboarding');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: passwordInput
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      if (!data.session) {
        setAuthError('Sign-in did not establish an authenticated session. Please try again.');
        return;
      }

      const roles: UserRole[] = ['administrator', 'structural_engineer', 'inspector', 'viewer'];
      const role = data.session.user.app_metadata.role;
      setCurrentUser({
        id: data.session.user.id,
        email: data.session.user.email || userEmail,
        name: data.session.user.user_metadata.full_name || data.session.user.email || userEmail,
        role: roles.includes(role) ? role : 'viewer'
      });
      setOrganizationLoading(true);
      setUserId(data.session.user.id);
      isDemoSessionRef.current = false;
      setIsDemoSession(false);
      setIsAuthenticated(true);
      setCurrentScreen('onboarding');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Account request failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = (operator?: { email: string; role: string }) => {
    const email = operator?.email.trim() || 'lachlan.ross@archonix.com.au';
    const role: CurrentUserRole = operator?.role === 'Structural Inspector' || operator?.role === 'Operations Lead'
      ? operator.role
      : 'DEMO';
    setUserEmail(email);
    setPasswordInput('');
    isDemoSessionRef.current = true;
    setCurrentUser({ id: 'demo', email, name: operator ? 'Demo Operator' : 'Demo Analyst', role });
    setUserId(null);
    setOrganizationId(null);
    setOrganizationName('');
    setOrganizationLoading(false);
    setIsDemoSession(true);
    setIsAuthenticated(true);
    setCurrentScreen('dashboard');
  };

  const registerBuilding = async (buildingInput: typeof DEFAULT_NEW_BUILDING) => {
    if (!canManageBuildings) throw new Error('Your account role cannot register buildings.');
    const name = buildingInput.name.trim();
    const location = buildingInput.location.trim();
    const latitude = Number(buildingInput.lat);
    const longitude = Number(buildingInput.lng);
    if (!name || !location) throw new Error('Enter a building name and location.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Enter valid latitude and longitude coordinates.');
    }

    let createdId = makeLocalId('bld');

    if (!isDemoSession) {
      try {
        const response = await fetch('/api/buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_code: `ARC-${Date.now().toString(36).toUpperCase()}`,
            name,
            street_address: location,
            latitude,
            longitude,
            construction_year: Number(buildingInput.year),
            building_classification: buildingInput.type,
            floors_above_ground: Number(buildingInput.floors),
            description: buildingInput.description || 'Newly registered structural asset under automated monitoring.',
            monitoring_status: buildingInput.incidentNote ? 'attention_required' : 'active',
            is_demo_data: false
          })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error || `Building save failed (${response.status})`);
        }
        const saved = await response.json() as { id?: string };
        if (saved.id) createdId = saved.id;
      } catch (error: unknown) {
        throw new Error(error instanceof Error ? error.message : 'Building could not be saved.');
      }
    }

    const created: Building = {
      id: createdId,
      name,
      location,
      lat: latitude,
      lng: longitude,
      type: buildingInput.type,
      year: Number(buildingInput.year),
      floors: Number(buildingInput.floors),
      description: buildingInput.description || 'Newly registered structural asset under automated monitoring.',
      incidentNote: buildingInput.incidentNote || 'Baseline telemetry initialized.',
      status: buildingInput.incidentNote ? 'Inspection Recommended' : 'Low Concern',
      healthIndex: buildingInput.incidentNote ? 79.0 : 96.0,
      lastScanDate: 'Today',
      imageUrl: buildingInput.imageUrl
    };

    setBuildings(current => [created, ...current]);
    recordAudit('Registered building', 'Building', created.id, `${created.name} · ${created.location}`);
    setCurrentScreen('map');
  };

  const handleRegisterBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuildingRegistrationError(null);
    try {
      await registerBuilding(newBuilding);
      setNewBuilding(DEFAULT_NEW_BUILDING);
    } catch (error) {
      setBuildingRegistrationError(error instanceof Error ? error.message : 'Building could not be saved.');
    }
  };

  const handleCreateMapPin = async (payload: NewPinPayload) => {
    const buildingTypes: Building['type'][] = ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Other'];
    const type = buildingTypes.find(buildingType => buildingType === payload.type) || 'Other';
    await registerBuilding({
      ...DEFAULT_NEW_BUILDING,
      name: payload.name,
      location: payload.location,
      lat: payload.lat,
      lng: payload.lng,
      type,
      incidentNote: payload.incidentNote || ''
    });
  };

  const saveInspectionRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setScanError('Your account role does not allow recording inspections.');
      return;
    }
    const targetBld = activeBuildings.find(building => building.id === activeSelectedBuildingId);
    if (!targetBld) {
      setScanError('Select a building before saving an inspection record.');
      return;
    }

    const observations = scanNotes.split('\n').map(note => note.trim()).filter(Boolean);
    if (observations.length === 0) {
      setScanError('Add at least one observation before saving this record.');
      return;
    }

    const date = currentTimestamp();
    const existing = editingRecordId ? scans.find(scan => scan.id === editingRecordId) : undefined;
    if (editingRecordId && !existing) {
      setScanError('The inspection record being edited could not be found.');
      return;
    }
    const existingChecklistTemplateAvailable = Boolean(
      existing?.checklistTemplateId && checklistTemplates.some(template => template.id === existing.checklistTemplateId)
    );
    const recordFields = {
      buildingId: targetBld.id,
      buildingName: targetBld.name,
      component: activeScanComponent,
      imageUrl: uploadedImageUrl || targetBld.imageUrl,
      crackLength: scanCrackLength ? `${scanCrackLength} mm` : 'Not measured',
      crackWidth: scanCrackWidth ? `${scanCrackWidth} mm` : 'Not measured',
      concernLevel: scanConcern,
      observations,
      summary: 'Inspector-entered observation. This record is not an automated structural assessment.',
      source: 'manual' as const,
      reviewStatus: existing?.reviewStatus || 'Draft' as const,
      checklist: existing && !existingChecklistTemplateAvailable
        ? existing.checklist || []
        : selectedChecklist
          ? selectedChecklist.items.map(label => ({ label, complete: checklistResponses[label] === true }))
          : existing?.checklist || [],
      checklistTemplateId: existing && !existingChecklistTemplateAvailable
        ? existing.checklistTemplateId
        : selectedChecklist?.id || existing?.checklistTemplateId,
      createdBy: existing?.createdBy || currentUser?.email || 'Demo workspace'
    };
    const newRecord: ScanRecord = existing
      ? { ...existing, ...recordFields, date: existing.date, updatedAt: date }
      : { ...recordFields, id: makeLocalId('scn'), date };

    if (existing) {
      setScans(current => current.map(scan => scan.id === existing.id ? newRecord : scan));
      recordAudit('Updated inspection record', 'Inspection', newRecord.id, `${targetBld.name} · ${activeScanComponent}`);
    } else {
      setScans(current => [newRecord, ...current]);
      recordAudit('Created inspection record', 'Inspection', newRecord.id, `${targetBld.name} · ${activeScanComponent}`);
    }
    setBuildings(current => current.map(building => building.id === targetBld.id
      ? {
          ...building,
          status: statusForConcern(scanConcern),
          incidentNote: observations[0],
          lastScanDate: new Date(date).toLocaleDateString()
        }
      : building
    ));
    if (!existing && (scanConcern === 'High Concern' || scanConcern === 'Urgent Professional Assessment')) {
      setAlerts(current => [{
        id: makeLocalId('alt'),
        title: `${scanConcern} recorded`,
        buildingName: targetBld.name,
        timestamp: new Date(date).toLocaleString(),
        severity: scanConcern === 'High Concern' ? 'High' : 'Urgent',
        description: observations[0],
        recommendation: 'Arrange review by a qualified structural professional.',
        read: false,
        buildingId: targetBld.id,
        scanId: newRecord.id,
        source: 'manual'
      }, ...current]);
    }
    setCurrentScanResult(newRecord);
    setScanError(null);
    setChecklistResponses({});
    setEditingRecordId(null);
    setCurrentScreen('diagnosis');
  };

  const startEditingInspection = (scan: ScanRecord) => {
    if (!canEdit || scan.source !== 'manual' || !['Draft', 'Changes Requested'].includes(scan.reviewStatus || 'Draft')) return;
    setEditingRecordId(scan.id);
    setSelectedBuildingId(scan.buildingId);
    setActiveScanComponent(scan.component);
    setScanConcern(scan.concernLevel);
    const length = Number.parseFloat(scan.crackLength);
    const width = Number.parseFloat(scan.crackWidth);
    setScanCrackLength(Number.isFinite(length) ? String(length) : '');
    setScanCrackWidth(Number.isFinite(width) ? String(width) : '');
    setScanNotes(scan.observations.join('\n'));
    setUploadedImageUrl(scan.imageUrl);
    setUploadedFileName('Current inspection image');
    const matchingTemplate = checklistTemplates.find(template => template.id === scan.checklistTemplateId);
    if (matchingTemplate) setSelectedChecklistId(matchingTemplate.id);
    setChecklistResponses(Object.fromEntries((scan.checklist || []).map(item => [item.label, item.complete])));
    setScanError(null);
    setCurrentScreen('scan');
  };

  const updateInspectionReview = (
    scan: ScanRecord,
    nextStatus: NonNullable<ScanRecord['reviewStatus']>,
    note = ''
  ) => {
    const previousStatus = scan.reviewStatus || 'Draft';
    const isSubmit = nextStatus === 'Submitted'
      && canEdit
      && (previousStatus === 'Draft' || previousStatus === 'Changes Requested');
    const isReviewTransition = canReview && (
      (nextStatus === 'Under Review' && previousStatus === 'Submitted')
      || (['Changes Requested', 'Approved'].includes(nextStatus) && previousStatus === 'Under Review')
      || (nextStatus === 'Closed' && previousStatus === 'Approved')
    );

    if (scan.source !== 'manual' || (!isSubmit && !isReviewTransition)) {
      setReviewError('This review transition is not available for your role or the current record status.');
      return;
    }
    if (nextStatus === 'Changes Requested' && !note.trim()) {
      setReviewError('Add a note explaining what needs to change.');
      return;
    }

    const updated: ScanRecord = {
      ...scan,
      reviewStatus: nextStatus,
      reviewerNotes: note.trim()
        ? [...(scan.reviewerNotes || []), `${currentTimestamp()}: ${note.trim()}`]
        : scan.reviewerNotes
    };
    setScans(current => current.map(item => item.id === scan.id ? updated : item));
    setCurrentScanResult(current => current?.id === scan.id ? updated : current);
    recordAudit('Changed inspection review status', 'Inspection', scan.id, `${previousStatus} → ${nextStatus}${note.trim() ? `: ${note.trim()}` : ''}`);
    setReviewNote('');
    setReviewError(null);
  };

  const resetDemoData = () => {
    setBuildings(INITIAL_BUILDINGS);
    setAlerts(INITIAL_ALERTS);
    setScans(INITIAL_SCANS);
    setWorkOrders([]);
    setCurrentScanResult(INITIAL_SCANS[0] || null);
    setEditingRecordId(null);
    setChecklistResponses({});
    setChecklistTemplates([DEFAULT_CHECKLIST]);
    setSelectedChecklistId(DEFAULT_CHECKLIST.id);
    setAuditLog([]);
    localStorage.removeItem('archonix_buildings_au_v2');
    localStorage.removeItem('archonix_alerts_au_v2');
    localStorage.removeItem('archonix_scans_au_v2');
    localStorage.removeItem('archonix_work_orders_au_v1');
    localStorage.removeItem('archonix_checklist_templates_v1');
    localStorage.removeItem('archonix_audit_log_v1');
    localStorage.removeItem('archonix_notified_task_ids_v1');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setScanError('Choose a JPG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setScanError('Image must be 8 MB or smaller.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setScanError('Could not read the selected image.');
        return;
      }
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          setScanError('Could not prepare the selected image for storage.');
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setUploadedImageUrl(canvas.toDataURL('image/jpeg', 0.78));
        setUploadedFileName(file.name);
        setScanError(null);
      };
      image.onerror = () => setScanError('The selected file is not a readable image.');
      image.src = reader.result;
    };
    reader.onerror = () => setScanError('Could not read the selected image.');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearUploadedImage = () => {
    setUploadedImageUrl(null);
    setUploadedFileName(null);
  };

  const createWorkOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setWorkOrderError('Your account role does not allow creating inspection tasks.');
      return;
    }
    const building = activeBuildings.find(item => item.id === workOrderBuildingId);
    if (!building || !workOrderTitle.trim() || !workOrderDueDate) {
      setWorkOrderError('Choose a building, enter a task title, and set a due date.');
      return;
    }
    const created: WorkOrder = {
      id: makeLocalId('task'),
      buildingId: building.id,
      title: workOrderTitle.trim(),
      description: workOrderDescription.trim(),
      assignedTo: workOrderAssignee.trim() || 'Unassigned',
      dueDate: workOrderDueDate,
      status: 'Open',
      relatedScanId: currentScanResult?.buildingId === building.id ? currentScanResult.id : undefined,
      createdAt: currentTimestamp()
    };
    setWorkOrders(current => [created, ...current]);
    recordAudit('Created inspection task', 'Task', created.id, `${created.title} · due ${created.dueDate}`);
    setWorkOrderTitle('');
    setWorkOrderDescription('');
    setWorkOrderAssignee('');
    setWorkOrderDueDate('');
    setWorkOrderError(null);
  };

  const updateWorkOrderStatus = (order: WorkOrder, status: WorkOrder['status']) => {
    if (order.status === status) return;
    setWorkOrders(current => current.map(item => item.id === order.id ? { ...item, status } : item));
    recordAudit('Updated inspection task', 'Task', order.id, `${order.status} → ${status}`);
  };

  const toggleAlertRead = (alertItem: AlertItem) => {
    setAlerts(current => current.map(item => item.id === alertItem.id ? { ...item, read: !item.read } : item));
    recordAudit(alertItem.read ? 'Marked alert unread' : 'Marked alert read', 'Alert', alertItem.id, alertItem.title);
  };

  const scheduleFollowUp = (scan: ScanRecord) => {
    setWorkOrderBuildingId(scan.buildingId);
    setWorkOrderTitle(`Follow-up review: ${scan.component}`);
    setWorkOrderDescription(`Review inspection record ${scan.id}: ${scan.observations.join(' ')}`);
    setWorkOrderDueDate(dateAfterDays(14));
    setCurrentScreen('work-orders');
  };

  const openAlertTarget = (alertItem: AlertItem) => {
    setAlerts(current => current.map(item => item.id === alertItem.id ? { ...item, read: true } : item));
    recordAudit('Opened alert', 'Alert', alertItem.id, alertItem.title);
    if (alertItem.scanId) {
      const scan = scans.find(item => item.id === alertItem.scanId);
      if (scan) {
        setCurrentScanResult(scan);
        setCurrentScreen('diagnosis');
        return;
      }
    }
    if (alertItem.buildingId) setSelectedBuildingId(alertItem.buildingId);
    setCurrentScreen('map');
  };

  const filteredBuildings = useMemo(() => {
    const query = buildingSearch.trim().toLowerCase();
    const matches = activeBuildings.filter(building =>
      (!query || `${building.name} ${building.location}`.toLowerCase().includes(query))
      && (buildingTypeFilter === 'All types' || building.type === buildingTypeFilter)
      && (buildingStatusFilter === 'All statuses' || building.status === buildingStatusFilter)
    );
    return matches.sort((left, right) => {
      if (buildingSort === 'Health (high–low)') return (right.healthIndex ?? -1) - (left.healthIndex ?? -1);
      if (buildingSort === 'Status') return left.status.localeCompare(right.status);
      return left.name.localeCompare(right.name);
    });
  }, [activeBuildings, buildingSearch, buildingTypeFilter, buildingStatusFilter, buildingSort]);
  const filteredAlerts = alerts.filter(alertItem =>
    alertSeverityFilter === 'All severities' || alertItem.severity === alertSeverityFilter
  );
  const reportBuilding = activeBuildings.find(building => building.id === reportBuildingId)
    || activeBuildings.find(building => building.id === activeSelectedBuildingId)
    || activeBuildings[0];
  const reportScans = reportBuilding
    ? scans.filter(scan => scan.buildingId === reportBuilding.id)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    : [];
  const memoryBuilding = activeBuildings.find(building => building.id === selectedBuildingId) || activeBuildings[0];
  const memoryScans = memoryBuilding
    ? scans.filter(scan => scan.buildingId === memoryBuilding.id)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    : [];
  const memoryLatest = memoryScans[0];
  const memoryPrevious = memoryLatest
    ? memoryScans.find(scan => scan.component === memoryLatest.component && scan.id !== memoryLatest.id)
    : undefined;
  const memoryComparisonScans = memoryLatest
    ? memoryScans.filter(scan => scan.component === memoryLatest.component).slice(0, 2)
    : [];
  const latestWidth = memoryLatest ? Number.parseFloat(memoryLatest.crackWidth) : Number.NaN;
  const previousWidth = memoryPrevious ? Number.parseFloat(memoryPrevious.crackWidth) : Number.NaN;
  const widthChange = Number.isFinite(latestWidth) && Number.isFinite(previousWidth)
    ? `${latestWidth >= previousWidth ? '+' : ''}${(latestWidth - previousWidth).toFixed(2)} mm`
    : null;
  const actionableScans = scans.filter(scan =>
    scan.concernLevel === 'High Concern' || scan.concernLevel === 'Urgent Professional Assessment'
  );
  const openWorkOrders = workOrders.filter(order => order.status !== 'Completed').length;
  const portfolioHealth = activeBuildings
    .map(building => building.healthIndex)
    .filter((value): value is number => value != null);
  const portfolioHealthAverage = portfolioHealth.length
    ? `${(portfolioHealth.reduce((sum, value) => sum + value, 0) / portfolioHealth.length).toFixed(1)}%`
    : 'Not available';
  const buildingsWithRecords = activeBuildings.filter(building => scans.some(scan => scan.buildingId === building.id)).length;
  const reviewQueue = scans.filter(scan =>
    scan.source === 'manual' && (scan.reviewStatus === 'Submitted' || scan.reviewStatus === 'Under Review')
  );
  const dueWorkOrders = useMemo(() => workOrders.filter(order =>
    order.status !== 'Completed' && order.dueDate <= todayDate
  ), [workOrders, todayDate]);

  useEffect(() => {
    if (!workspaceStorageScope || dataScopeLoaded !== workspaceStorageScope
      || browserNotificationPermission !== 'granted' || typeof Notification === 'undefined'
      || dueWorkOrders.length === 0) return;
    const storageKey = workspaceStorageKey('archonix_notified_task_ids_v1', workspaceStorageScope);
    const saved = localStorage.getItem(storageKey);
    let notifiedIds: string[];
    try {
      notifiedIds = saved ? JSON.parse(saved) as string[] : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid saved notification state';
      reportStorageError('Browser task notification history', message);
      return;
    }

    const notified = new Set(notifiedIds);
    const newlyNotified = dueWorkOrders.filter(order => !notified.has(order.id));
    newlyNotified.forEach(order => {
      const overdue = order.dueDate < todayDate;
      try {
        new Notification(overdue ? 'Inspection task overdue' : 'Inspection task due today', {
          body: `${order.title} · ${order.dueDate}`,
          tag: `archonix-${order.id}`
        });
        notified.add(order.id);
      } catch (error) {
        reportStorageError('Browser notification', error instanceof Error ? error.message : 'Notification could not be displayed.');
      }
    });
    if (newlyNotified.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...notified]));
      } catch (error) {
        reportStorageError(storageKey, error instanceof Error ? error.message : 'Could not save notification history.');
      }
    }
  }, [dueWorkOrders, browserNotificationPermission, todayDate, workspaceStorageScope, dataScopeLoaded]);

  const criticalTelemetryCount = useMemo(() => {
    return Object.values(telemetryMap).filter(t => t.overallStatus === 'critical').length;
  }, [telemetryMap]);

  if (!isAuthenticated || currentScreen === 'login' || currentScreen === 'password-reset') {
    if (!supabase) {
      return <DemoAuthLanding onEnterWorkspace={handleDemoLogin} />;
    }

    const isResettingPassword = currentScreen === 'password-reset';
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
                <span className="block text-xs text-[#B58B3B] font-mono tracking-wider">WORLD ENTERPRISE TELEMETRY</span>
              </div>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-[#F5F0E5] mb-6">
              Buildings Have a Health.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E5C77B] to-[#B58B3B]">
                We Monitor It.
              </span>
            </h1>
            <p className="text-[#A7A39A] text-lg max-w-md leading-relaxed">
              A structural asset workspace for recording inspection evidence, tracking follow-up tasks, and reviewing building history.
            </p>
          </div>
          <div className="relative z-10 mt-12 grid grid-cols-3 gap-6 pt-8 border-t border-[#222222]">
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">Manual</div>
              <div className="text-xs text-[#A7A39A] mt-1">Inspection Records</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">GIS Map</div>
              <div className="text-xs text-[#A7A39A] mt-1">Incident Pinpointing</div>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono text-[#E5C77B]">PDF</div>
              <div className="text-xs text-[#A7A39A] mt-1">Print-ready Reports</div>
            </div>
          </div>
          <div className="relative z-10 mt-8 text-xs text-[#A7A39A]">
            © 2026 ARCHONIX World Enterprise Telemetry • Global Operations
          </div>
        </div>

        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            {!supabase ? (
              <div>
                <div className="mb-6">
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] font-mono uppercase tracking-wider text-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Interactive demo
                  </span>
                  <h2 className="mt-4 text-3xl font-bold text-[#F5F0E5]">Explore the command center</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#A7A39A]">
                    Production sign-in is not configured. Enter the browser-based demo to explore the full interface with sample building data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDemoLogin()}
                  className="w-full px-5 py-4 bg-[#E5C77B] hover:bg-[#F0D88F] text-[#090909] font-semibold rounded transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#B58B3B]/15"
                >
                  <Zap className="w-4 h-4" />
                  <span>Enter Demo Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="mt-3 text-center text-[11px] text-[#A7A39A]">
                  No account required · Demo data stays in this browser
                </p>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-[#F5F0E5] mb-2">{isResettingPassword ? 'Choose a new password' : isSignUp ? 'Create your account' : 'Access Command Center'}</h2>
                  <p className="text-sm text-[#A7A39A]">{isResettingPassword ? 'Set a new password for your account.' : isSignUp ? 'Create an ARCHONIX account with your work email.' : 'Sign in with your ARCHONIX team account.'}</p>
                </div>
                <form onSubmit={isResettingPassword ? handlePasswordUpdate : handleAuthSubmit} className="space-y-6">
              {isSignUp && !isResettingPassword && (
                <div>
                  <label htmlFor="auth-full-name" className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Full Name *</label>
                  <input
                    id="auth-full-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullNameInput}
                    onChange={event => setFullNameInput(event.target.value)}
                    className="w-full px-4 py-3 bg-[#191919] border border-[#222222] rounded text-[#F5F0E5] placeholder-[#A7A39A] focus:outline-none focus:border-[#B58B3B] transition-colors text-sm"
                    placeholder="Your name"
                  />
                </div>
              )}
              {!isResettingPassword && <div>
                <label htmlFor="auth-email" className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Work Email *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#A7A39A]">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input 
                    id="auth-email"
                    type="email" 
                    required
                    autoComplete="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#191919] border border-[#222222] rounded text-[#F5F0E5] placeholder-[#A7A39A] focus:outline-none focus:border-[#B58B3B] transition-colors text-sm"
                  />
                </div>
              </div>}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="auth-password" className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A]">{isResettingPassword ? 'New password *' : 'Password *'}</label>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#A7A39A]">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input 
                    id="auth-password"
                    type={showPassword ? "text" : "password"} 
                    required
                    minLength={8}
                    autoComplete={isSignUp || isResettingPassword ? 'new-password' : 'current-password'}
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
              {isResettingPassword && (
                <div>
                  <label htmlFor="auth-password-confirm" className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Confirm new password *</label>
                  <input
                    id="auth-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={passwordConfirmInput}
                    onChange={event => setPasswordConfirmInput(event.target.value)}
                    className="w-full px-4 py-3 bg-[#191919] border border-[#222222] rounded text-[#F5F0E5] text-sm"
                  />
                </div>
              )}
              <button type="submit" disabled={authLoading || !supabase} className="w-full py-3 bg-[#E5C77B] hover:bg-[#B58B3B] disabled:opacity-50 text-[#090909] font-semibold rounded transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#B58B3B]/10">
                <span>{authLoading ? 'Please wait…' : isResettingPassword ? 'Update password' : isSignUp ? 'Create account' : 'Sign in'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            {authError && <p role="alert" className="mt-4 p-3 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-300">{authError}</p>}
            {authNotice && <p role="status" className="mt-4 p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">{authNotice}</p>}
            {!isResettingPassword && <p className="mt-5 text-center text-xs text-[#A7A39A]">
              {isSignUp ? 'Already have an account?' : 'New to ARCHONIX?'}
              {' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className="text-[#E5C77B] hover:underline"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>}
            {!isSignUp && !isResettingPassword && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                <button type="button" disabled={authLoading} onClick={() => void handlePasswordResetRequest()} className="text-[#E5C77B] hover:underline disabled:opacity-50">Forgot password?</button>
                <button type="button" disabled={authLoading} onClick={() => void handleResendConfirmation()} className="text-[#E5C77B] hover:underline disabled:opacity-50">Resend confirmation email</button>
              </div>
            )}
            {isResettingPassword && (
              <button type="button" onClick={() => {
                setIsPasswordRecovery(false);
                setCurrentScreen('dashboard');
                setAuthError(null);
                setAuthNotice(null);
              }} className="mt-5 w-full text-center text-xs text-[#E5C77B] hover:underline">Cancel password update</button>
            )}
            {!isResettingPassword && <div className="mt-8 pt-6 border-t border-[#222222] text-center">
              <p className="text-xs text-[#A7A39A] mb-3">Local demo workspace — data is stored in this browser</p>
              <button onClick={() => handleDemoLogin()} className="px-4 py-2 bg-[#191919] hover:bg-[#222222] border border-[#222222] rounded text-xs text-[#E5C77B] font-mono transition-colors inline-flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#B58B3B]" />
                <span>Enter Demo Workspace</span>
              </button>
            </div>}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !isDemoSession && !organizationId) {
    return (
      <div className="min-h-screen bg-[#090909] text-[#F5F0E5] flex items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono tracking-widest text-[#B58B3B]">ARCHONIX ORGANIZATION SETUP</p>
              <h1 className="mt-2 text-2xl font-bold">Set up your workspace</h1>
              <p className="mt-2 text-sm text-[#A7A39A]">Signed in as {currentUser?.email}. Create an organization or accept an invitation.</p>
            </div>
            <button onClick={() => {
              if (supabase) void supabase.auth.signOut();
              setIsAuthenticated(false);
              setCurrentUser(null);
              setUserId(null);
              setOrganizationId(null);
              setOrganizationName('');
              setOrganizationLoading(false);
              setCurrentScreen('login');
            }} className="px-3 py-2 bg-[#191919] border border-[#222222] rounded text-xs text-[#A7A39A]">Sign out</button>
          </div>

          {organizationLoading && <p role="status" className="p-3 bg-[#191919] border border-[#222222] rounded text-xs text-[#A7A39A]">Checking organization membership…</p>}
          {organizationError && (
            <div role="alert" className="p-4 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200 space-y-2">
              <p>{organizationError}</p>
              <p>Ensure the organization onboarding migration in <code>supabase/migrations</code> has been applied to this Supabase project.</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <form onSubmit={event => void handleOrganizationSetup(event, 'create')} className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
              <div className="flex items-center gap-2 text-[#E5C77B]"><Users className="w-4 h-4" /><h2 className="font-bold text-sm">Create an organization</h2></div>
              <p className="text-xs text-[#A7A39A]">You will become its administrator. You can invite members from Settings.</p>
              <label className="block text-xs text-[#A7A39A]">Organization name
                <input required minLength={2} maxLength={120} value={organizationNameInput} onChange={event => setOrganizationNameInput(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#333] rounded text-sm text-[#F5F0E5]" placeholder="Company or team name" />
              </label>
              <button type="submit" disabled={organizationSubmitting || organizationLoading} className="w-full py-2.5 bg-[#E5C77B] disabled:opacity-50 text-[#090909] font-semibold text-xs rounded">{organizationSubmitting ? 'Creating…' : 'Create organization'}</button>
            </form>

            <form onSubmit={event => void handleOrganizationSetup(event, 'join')} className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
              <div className="flex items-center gap-2 text-[#E5C77B]"><Mail className="w-4 h-4" /><h2 className="font-bold text-sm">Join by invitation</h2></div>
              <p className="text-xs text-[#A7A39A]">Use the one-time token provided by your organization administrator. The invitation must match your signed-in email.</p>
              <label className="block text-xs text-[#A7A39A]">Invitation token
                <input required value={invitationTokenInput} onChange={event => setInvitationTokenInput(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#333] rounded text-sm text-[#F5F0E5] font-mono" placeholder="Paste invitation token" />
              </label>
              <button type="submit" disabled={organizationSubmitting || organizationLoading} className="w-full py-2.5 bg-[#222222] border border-[#B58B3B]/40 disabled:opacity-50 text-[#E5C77B] font-semibold text-xs rounded">{organizationSubmitting ? 'Joining…' : 'Join organization'}</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && workspaceStorageScope && dataScopeLoaded !== workspaceStorageScope
    && (isDemoSession || organizationId)) {
    return (
      <div className="min-h-screen bg-[#090909] text-[#A7A39A] flex items-center justify-center text-sm" role="status">
        {isDemoSession ? 'Loading the local demo workspace…' : 'Loading your organization workspace…'}
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: Activity, section: 'Overview' },
    { id: 'map', label: 'Incident & Asset Map', icon: MapPin, section: 'Overview' },
    { id: 'buildings', label: 'My Buildings', icon: Building2, section: 'Portfolio' },
    { id: 'add-building', label: 'Add Building', icon: Plus, section: 'Portfolio' },
    { id: 'import-buildings', label: 'Import Buildings', icon: FileUp, section: 'Portfolio' },
    { id: 'scan', label: 'Record Inspection', icon: Cpu, section: 'Operations' },
    { id: 'monitor', label: 'IoT Telemetry & Health', icon: Radio, badge: criticalTelemetryCount > 0 ? criticalTelemetryCount : undefined, section: 'Operations' },
    { id: 'review-queue', label: 'Review Queue', icon: CheckCircle, badge: reviewQueue.length, section: 'Operations' },
    { id: 'alerts', label: 'Alerts & Tasks', icon: Bell, badge: alerts.filter(a => !a.read).length + dueWorkOrders.length, section: 'Operations' },
    { id: 'recommendations', label: 'Recommendations', icon: Zap, section: 'Operations' },
    { id: 'work-orders', label: 'Inspection Tasks', icon: ClipboardCheck, badge: openWorkOrders, section: 'Operations' },
    { id: 'reports', label: 'Reports & History', icon: FileText, section: 'Governance' },
    { id: 'audit-log', label: 'Audit History', icon: History, section: 'Governance' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'Governance' },
  ].filter(item => item.id === 'add-building'
    || item.id === 'import-buildings'
      ? canManageBuildings
      : item.id === 'review-queue'
        ? canReview
    : ['scan', 'work-orders'].includes(item.id)
      ? canEdit
      : true);

  const navSections = ['Overview', 'Portfolio', 'Operations', 'Governance'] as const;

  return (
    <div className="min-h-screen bg-transparent text-[#F5F0E5] flex font-sans selection:bg-[#B58B3B]/40 selection:text-[#F5F0E5]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 liquid-glass border-r border-white/[0.08] transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 px-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E5C77B]/20 to-[#B58B3B]/5 border border-[#B58B3B]/40 flex items-center justify-center text-[#E5C77B] shadow-inner shadow-[#E5C77B]/10">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold tracking-[0.14em] text-sm text-[#F5F0E5]">ARCHONIX</span>
              <span className="block text-[9px] text-[#B58B3B] font-mono tracking-[0.2em]">WORLD TELEMETRY</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-[#A7A39A] hover:text-[#F5F0E5]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {isDemoSession && (
            <div className="p-3 rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  </span>
                  <span className="text-xs font-semibold text-amber-200">Demo workspace</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-md border border-amber-500/30 bg-[#090909]/60 text-[9px] font-mono text-amber-300">
                  LOCAL
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#A7A39A]">
                Sample data is stored in this browser only.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Reset all demo data to the preloaded sample workspace?')) resetDemoData();
                }}
                className="mt-2.5 w-full px-3 py-1.5 rounded-lg border border-amber-500/25 bg-[#090909]/50 text-[10px] font-mono text-amber-200 hover:bg-amber-500/15 transition-colors cursor-pointer"
              >
                Reset Demo Data
              </button>
            </div>
          )}

          {navSections.map((section) => {
            const sectionItems = navItems.filter((item) => item.section === section);
            if (sectionItems.length === 0) return null;
            return (
              <div key={section} className="space-y-0.5">
                <div className="px-3 pb-1 text-[10px] font-mono text-[#7C7870] uppercase tracking-[0.14em]">{section}</div>
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentScreen(item.id as Screen);
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-[#B58B3B]/20 to-[#B58B3B]/5 text-[#F5E6BE] border border-[#B58B3B]/35 shadow-sm shadow-[#B58B3B]/10'
                          : 'text-[#A7A39A] border border-transparent hover:bg-white/[0.04] hover:text-[#F5F0E5]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-[#E5C77B]' : 'text-[#7C7870]'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 font-mono border border-red-500/30">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="pt-4 mt-4 border-t border-white/[0.06]">
            <div className="px-3 py-2.5 bg-white/[0.03] rounded-xl border border-white/[0.06]">
              <div className="text-xs font-semibold text-[#F5F0E5] truncate">{currentUser?.name || 'Demo Analyst'}</div>
              <div className="text-[10px] text-[#A7A39A] truncate font-mono mt-0.5">
                {isDemoSession
                  ? currentUser?.role === 'DEMO' ? 'DEMO' : currentUser?.role || 'DEMO'
                  : currentUser?.role.replaceAll('_', ' ')}
              </div>
            </div>
            <button onClick={() => {
              if (!isDemoSession && supabase) void supabase.auth.signOut();
              isDemoSessionRef.current = false;
              setIsAuthenticated(false);
              setIsDemoSession(false);
              setCurrentUser(null);
              setUserId(null);
              setOrganizationId(null);
              setOrganizationName('');
              setOrganizationLoading(false);
              setCurrentScreen('login');
            }} className="w-full mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'lg:pl-64' : 'pl-0'}`}>
        <header className="h-16 liquid-glass border-b border-white/[0.08] px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-[#A7A39A] hover:text-[#F5F0E5] transition-colors cursor-pointer">
              <Menu className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] text-[#A7A39A] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
              <span>
                {isDemoSession
                  ? `LOCAL DEMO • ${currentUser?.role === 'DEMO' ? 'DEMO' : currentUser?.role || 'DEMO'}`
                  : `${organizationName.toUpperCase()} • WORKSPACE`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setMonitorActiveTab('telemetry');
                setCurrentScreen('monitor');
              }}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] text-xs font-mono text-[#F5F0E5] transition-all cursor-pointer"
            >
              <Radio className={`w-3.5 h-3.5 ${criticalTelemetryCount > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`} />
              <span className={criticalTelemetryCount > 0 ? 'text-red-300 font-bold' : ''}>
                {criticalTelemetryCount > 0 ? `IOT ALERT (${criticalTelemetryCount})` : 'IOT STREAMING'}
              </span>
            </button>
            <button
              onClick={() => setCurrentScreen('map')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B58B3B]/15 hover:bg-[#B58B3B]/25 border border-[#B58B3B]/40 text-xs font-mono text-[#E5C77B] transition-all cursor-pointer shadow-sm shadow-[#B58B3B]/10"
              title="Open Conversational Spatial AI (⌘K)"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E5C77B]" />
              <span>Spatial AI (⌘K)</span>
            </button>
            <button onClick={() => setCurrentScreen('map')} className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] text-[#E5C77B] text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer">
              <MapPin className="w-3.5 h-3.5" />
              <span>Live GIS Map</span>
            </button>
            <button onClick={() => setCurrentScreen('alerts')} className="relative p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.06] text-[#A7A39A] hover:text-[#F5F0E5] transition-all cursor-pointer">
              <Bell className="w-4 h-4" />
              {alerts.filter(a => !a.read).length + dueWorkOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center shadow-sm shadow-red-500/40">
                  {alerts.filter(a => !a.read).length + dueWorkOrders.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 bg-transparent overflow-y-auto">
          {!isDemoSession && buildingsLoading && (
            <div role="status" className="mb-4 p-3 rounded-xl border border-white/[0.06] bg-[#141414] text-xs text-[#A7A39A]">
              Loading buildings from the database…
            </div>
          )}
          {!isDemoSession && buildingsError && (
            <div role="alert" className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
              Building data could not be loaded from Neon: {buildingsError} Showing local buildings, if available.
            </div>
          )}
          {storageError && <div role="alert" className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200">Some browser data could not be read or saved: {storageError}. Export or copy important records before leaving.</div>}
          {currentScreen === 'map' && (
            <React.Suspense fallback={<div className="p-8 text-center text-sm text-[#A7A39A]" role="status">Loading map…</div>}>
              <WorldMap
                buildings={activeBuildings}
                scans={scans}
                canScan={canEdit}
                selectedBuildingId={activeSelectedBuildingId || undefined}
                onSelectBuilding={(building) => setSelectedBuildingId(building.id)}
                onMapClick={canManageBuildings ? (lat, lng) => {
                  setNewBuilding(current => ({ ...current, lat, lng }));
                } : undefined}
                onCreatePin={handleCreateMapPin}
                onScan={(id) => {
                  if (!canEdit) return;
                  setSelectedBuildingId(id);
                  setCurrentScreen('scan');
                }}
                onMemory={(id) => {
                  setSelectedBuildingId(id);
                  setCurrentScreen('monitor');
                }}
                telemetryData={telemetryMap}
                isStreamingTelemetry={isTelemetryStreaming}
                onToggleStreamingTelemetry={() => setIsTelemetryStreaming(s => !s)}
                onSimulateTelemetry={handleSimulateTelemetry}
                onOpenTelemetryMonitor={(id) => {
                  setSelectedBuildingId(id);
                  setMonitorActiveTab('telemetry');
                  setCurrentScreen('monitor');
                }}
              />
            </React.Suspense>
          )}

          {currentScreen === 'dashboard' && (
            <div className="space-y-8 animate-screen-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#B58B3B] mb-1">Portfolio Command</p>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Structural Command Dashboard</h1>
                  <p className="text-sm text-[#A7A39A] mt-1">Building status, saved inspection records, alerts, and follow-up work.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentScreen('map')}
                    className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-[#B58B3B]/40 text-[#E5C77B] font-semibold text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>VIEW INCIDENT MAP</span>
                  </button>
                  {canEdit && <button
                    onClick={() => setCurrentScreen('scan')}
                    className="px-5 py-2.5 bg-gradient-to-r from-[#E5C77B] to-[#C9A24B] hover:from-[#F0D58D] hover:to-[#D5AE56] text-[#090909] font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#B58B3B]/20 cursor-pointer"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>RECORD INSPECTION</span>
                  </button>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 liquid-glass-card rounded-xl transition-all">
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Total Buildings</div>
                  <div className="text-3xl font-bold text-[#F5F0E5] font-mono tracking-tight">{activeBuildings.length}</div>
                  <div className="text-[11px] text-[#A7A39A] mt-2">{buildingsWithRecords} with inspection records</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all">
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Health Index</div>
                  <div className="text-3xl font-bold text-[#E5C77B] font-mono tracking-tight">{portfolioHealthAverage}</div>
                  <div className="text-[11px] text-[#A7A39A] mt-2">Portfolio Average</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all cursor-pointer" onClick={() => setCurrentScreen('alerts')}>
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Active Alerts</div>
                  <div className="text-3xl font-bold text-red-400 font-mono tracking-tight">{alerts.filter(a => !a.read).length}</div>
                  <div className="text-[11px] text-red-400/90 mt-2">Requires Review</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all cursor-pointer" onClick={() => { setMonitorActiveTab('telemetry'); setCurrentScreen('monitor'); }}>
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>IoT Telemetry</span>
                    <Radio className={`w-3.5 h-3.5 ${isTelemetryStreaming ? 'text-emerald-400 animate-pulse' : 'text-[#777777]'}`} />
                  </div>
                  <div className={`text-3xl font-bold font-mono tracking-tight ${criticalTelemetryCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {criticalTelemetryCount > 0 ? `${criticalTelemetryCount} CRIT` : 'NOMINAL'}
                  </div>
                  <div className="text-[11px] text-[#A7A39A] mt-2">{activeBuildings.length * 4} sensors online</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all">
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Scans Completed</div>
                  <div className="text-3xl font-bold text-[#F5F0E5] font-mono tracking-tight">{scans.length}</div>
                  <div className="text-[11px] text-emerald-400 mt-2">Recorded inspections</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all">
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Attention Required</div>
                  <div className="text-3xl font-bold text-amber-400 font-mono tracking-tight">{activeBuildings.filter(building => building.status === 'Inspection Recommended' || building.status === 'Urgent Assessment').length}</div>
                  <div className="text-[11px] text-amber-400/90 mt-2">Buildings need review</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all cursor-pointer" onClick={() => setCurrentScreen('work-orders')}>
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Awaiting Inspection</div>
                  <div className="text-3xl font-bold text-[#F5F0E5] font-mono tracking-tight">{openWorkOrders}</div>
                  <div className={`text-[11px] mt-2 ${dueWorkOrders.length ? 'text-amber-300' : 'text-[#A7A39A]'}`}>{dueWorkOrders.length} due today or overdue</div>
                </div>
                <div className="p-5 liquid-glass-card rounded-xl transition-all cursor-pointer" onClick={() => setCurrentScreen('review-queue')}>
                  <div className="text-[11px] text-[#A7A39A] font-mono uppercase tracking-wider mb-2">Review Queue</div>
                  <div className="text-3xl font-bold text-[#F5F0E5] font-mono tracking-tight">{reviewQueue.length}</div>
                  <div className="text-[11px] text-[#A7A39A] mt-2">Submitted inspections</div>
                </div>
              </div>

              {/* Quick Demo / Pitch Shortcuts Bar */}
              <div className="p-4 liquid-glass-card rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#B58B3B]/15 border border-[#B58B3B]/35 text-[#E5C77B]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#F5F0E5]">Quick Showcase Actions</div>
                    <div className="text-[11px] text-[#A7A39A]">Jump straight into live GIS, AI search, telemetry simulation, or executive reports.</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('map')}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-mono text-[#E5C77B] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Live GIS Map</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeBuildings[0];
                      if (target) {
                        setSelectedBuildingId(target.id);
                        handleSimulateTelemetry('seismic', target.id);
                      }
                      setMonitorActiveTab('telemetry');
                      setCurrentScreen('monitor');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-mono text-amber-200 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Simulate Seismic Alert</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('reports')}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-mono text-[#F5F0E5] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#E5C77B]" />
                    <span>Executive Report</span>
                  </button>
                </div>
              </div>

              {/* Continuous Structural Health Telemetry Stream Preview */}
              <section className="p-5 liquid-glass-card rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded border ${criticalTelemetryCount > 0 ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                      <Radio className={`w-5 h-5 ${isTelemetryStreaming ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-[#F5F0E5]">Continuous Structural Health Telemetry</h2>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${criticalTelemetryCount > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'} border`}>
                          {criticalTelemetryCount > 0 ? `${criticalTelemetryCount} Sensor Alerts Active` : 'All Sensors Nominal'}
                        </span>
                      </div>
                      <p className="text-xs text-[#A7A39A] mt-0.5">
                        Live triaxial vibration, tilt displacement, microstrain, and basement ingress monitoring.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCurrentScreen('map')}
                      className="px-3 py-1.5 bg-[#222222] hover:bg-[#333333] text-xs font-mono text-[#E5C77B] rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>View GIS Map</span>
                    </button>
                    <button
                      onClick={() => {
                        setMonitorActiveTab('telemetry');
                        setCurrentScreen('monitor');
                      }}
                      className="px-3 py-1.5 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold text-xs rounded transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Full Diagnostics</span>
                    </button>
                  </div>
                </div>

                {telemetryMap[activeSelectedBuildingId] && (
                  <TelemetryPanel
                    telemetry={telemetryMap[activeSelectedBuildingId]}
                    isStreaming={isTelemetryStreaming}
                    onToggleStreaming={() => setIsTelemetryStreaming(s => !s)}
                    onSimulate={handleSimulateTelemetry}
                    compact={true}
                  />
                )}
              </section>

              {dueWorkOrders.length > 0 && (
                <section className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="w-4 h-4 mt-0.5 text-amber-300" />
                    <div>
                      <h2 className="text-sm font-bold text-amber-200">{dueWorkOrders.length} inspection task{dueWorkOrders.length === 1 ? '' : 's'} due or overdue</h2>
                      <p className="text-xs text-amber-100/70 mt-1">{dueWorkOrders.slice(0, 3).map(order => order.title).join(' · ')}</p>
                    </div>
                  </div>
                  <button onClick={() => setCurrentScreen('work-orders')} className="px-3 py-2 bg-[#222222] rounded text-xs text-[#E5C77B]">Review tasks</button>
                </section>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-6 bg-[#191919] border border-[#222222] rounded">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-base font-bold text-[#F5F0E5]">Recent Inspection History</h3>
                      <p className="text-xs text-[#A7A39A]">Latest saved observations across the portfolio</p>
                    </div>
                    <button onClick={() => setCurrentScreen('reports')} className="px-2 py-1 bg-[#222222] text-[#E5C77B] text-xs font-mono rounded border border-[#222222]">View reports</button>
                  </div>
                  <div className="space-y-3">
                    {scans.slice(0, 5).map(scan => (
                      <button key={scan.id} onClick={() => { setCurrentScanResult(scan); setCurrentScreen('diagnosis'); }} className="w-full flex items-center justify-between gap-4 p-3 bg-[#090909] border border-[#222222] rounded text-left hover:border-[#B58B3B]/40">
                        <span className="min-w-0">
                          <span className="block text-xs text-[#F5F0E5] truncate">{scan.buildingName} · {scan.component}</span>
                          <span className="block text-[10px] text-[#A7A39A]">{formatRecordDate(scan.date)}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-[#E5C77B]">{scan.concernLevel}</span>
                      </button>
                    ))}
                    {scans.length === 0 && <p className="text-xs text-[#A7A39A]">No inspection records yet.</p>}
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
                            <div className="flex items-center gap-1">
                              {alt.source === 'demo' && <span className="text-[9px] text-[#A7A39A]">DEMO</span>}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${alt.severity === 'High' || alt.severity === 'Urgent' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                                {alt.severity}
                              </span>
                            </div>
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
                        {canEdit && <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('scan'); }} className="flex-1 py-2 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-medium text-xs rounded transition-colors flex items-center justify-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Record Inspection</span>
                        </button>}
                        <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('map'); }} className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs rounded transition-colors" title="Locate on Map">
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
            <div className="space-y-6 animate-screen-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#B58B3B] mb-1">Asset Registry</p>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Building Portfolio Management</h1>
                  <p className="text-sm text-[#A7A39A] mt-1">Registered architectural assets and automated telemetry profiles.</p>
                </div>
                {canManageBuildings && <div className="flex flex-wrap gap-2.5">
                  <button onClick={() => setCurrentScreen('import-buildings')} className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-[#B58B3B]/40 text-[#E5C77B] font-semibold text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer">
                    <FileUp className="w-4 h-4" /><span>Import CSV</span>
                  </button>
                  <button onClick={() => setCurrentScreen('add-building')} className="px-4 py-2.5 bg-gradient-to-r from-[#E5C77B] to-[#C9A24B] hover:from-[#F0D58D] hover:to-[#D5AE56] text-[#090909] font-semibold text-xs rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-[#B58B3B]/15 cursor-pointer">
                    <Plus className="w-4 h-4" />
                    <span>Register New Building</span>
                  </button>
                </div>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-[#141414] border border-white/[0.07] rounded-xl">
                <label className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C7870]" />
                  <input value={buildingSearch} onChange={event => setBuildingSearch(event.target.value)} placeholder="Search building or location" className="w-full pl-9 pr-3 py-2 bg-[#0B0B0B] border border-white/[0.08] focus:border-[#B58B3B]/70 focus:outline-none rounded-lg text-xs text-[#F5F0E5] transition-colors" />
                </label>
                <select aria-label="Filter by building type" value={buildingTypeFilter} onChange={event => setBuildingTypeFilter(event.target.value)} className="px-3 py-2 bg-[#0B0B0B] border border-white/[0.08] rounded-lg text-xs text-[#F5F0E5]">
                  {['All types', 'Residential', 'Commercial', 'Industrial', 'Institutional', 'Other'].map(type => <option key={type}>{type}</option>)}
                </select>
                <select aria-label="Filter by status" value={buildingStatusFilter} onChange={event => setBuildingStatusFilter(event.target.value)} className="px-3 py-2 bg-[#0B0B0B] border border-white/[0.08] rounded-lg text-xs text-[#F5F0E5]">
                  {['All statuses', 'Low Concern', 'Inspection Recommended', 'Monitoring Required', 'Urgent Assessment'].map(status => <option key={status}>{status}</option>)}
                </select>
                <select aria-label="Sort buildings" value={buildingSort} onChange={event => setBuildingSort(event.target.value)} className="px-3 py-2 bg-[#0B0B0B] border border-white/[0.08] rounded-lg text-xs text-[#F5F0E5]">
                  {['Name (A–Z)', 'Health (high–low)', 'Status'].map(sort => <option key={sort}>{sort}</option>)}
                </select>
              </div>
              <p className="text-xs font-mono text-[#A7A39A]">{filteredBuildings.length} of {activeBuildings.length} buildings</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBuildings.map((bld) => {
                  const statusTone =
                    bld.status === 'Low Concern'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      : bld.status === 'Urgent Assessment'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/35';
                  return (
                    <div key={bld.id} className="group liquid-glass-card rounded-xl overflow-hidden flex flex-col justify-between transition-all">
                      <div>
                        <div className="h-44 overflow-hidden relative">
                          <img src={bld.imageUrl} alt={bld.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141414] via-black/20 to-transparent" />
                          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold border backdrop-blur-md bg-[#090909]/75 border-white/[0.1] text-[#E5C77B]">
                            {bld.type}
                          </div>
                          {typeof bld.healthIndex === 'number' && (
                            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold backdrop-blur-md bg-[#090909]/80 border border-white/[0.1] text-[#F5F0E5]">
                              {bld.healthIndex.toFixed(1)}%
                            </div>
                          )}
                          <div className="absolute bottom-3 left-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border backdrop-blur-md ${statusTone}`}>
                              {bld.status}
                            </span>
                          </div>
                        </div>
                        <div className="p-5">
                          <h3 className="font-bold text-[#F5F0E5] text-base mb-1 group-hover:text-[#F5E6BE] transition-colors">{bld.name}</h3>
                          <p className="text-xs text-[#A7A39A] mb-3 flex items-center gap-1.5">
                            <Compass className="w-3.5 h-3.5 text-[#B58B3B] shrink-0" />
                            <span className="truncate">{bld.location}</span>
                          </p>
                          <p className="text-xs text-[#A7A39A] leading-relaxed line-clamp-2">{bld.description}</p>
                        </div>
                      </div>
                      <div className="px-5 pb-5 pt-3 border-t border-white/[0.06] flex items-center gap-2">
                        {canEdit && <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('scan'); }} className="flex-1 py-2 bg-gradient-to-r from-[#E5C77B] to-[#C9A24B] hover:from-[#F0D58D] hover:to-[#D5AE56] text-[#090909] font-semibold text-xs rounded-lg transition-all cursor-pointer">Record Inspection</button>}
                        <button onClick={() => { setSelectedBuildingId(bld.id); setCurrentScreen('map'); }} className="px-3 py-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-[#E5C77B] rounded-lg font-mono transition-all cursor-pointer">Map Pin</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredBuildings.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#141414] border border-white/[0.07] rounded-xl">No buildings match those filters.</p>}
            </div>
          )}

          {currentScreen === 'import-buildings' && canManageBuildings && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#F5F0E5]">Import Buildings from CSV</h1>
                  <p className="mt-1 text-sm text-[#A7A39A]">Validate a file before adding any rows. Invalid rows are reported and skipped.</p>
                </div>
                <button onClick={downloadBuildingCsvTemplate} className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded">Download CSV template</button>
              </div>
              <section className="p-5 bg-[#191919] border border-[#222222] rounded space-y-4">
                <p className="text-xs text-[#A7A39A]">Required columns: <code>name, location, lat, lng</code>. Optional columns: <code>type, year, floors, description</code>. Imported rows are saved in this browser only.</p>
                <label className="px-4 py-3 bg-[#222222] hover:bg-[#333333] text-[#F5F0E5] text-xs rounded cursor-pointer inline-flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#E5C77B]" />
                  <span>{buildingCsvName || 'Choose a .csv file'}</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={event => void handleBuildingCsvFile(event)} />
                </label>
                {(buildingCsvPreview.length > 0 || buildingCsvErrors.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-emerald-300">{buildingCsvPreview.length} valid row{buildingCsvPreview.length === 1 ? '' : 's'}</span>
                      <span className={buildingCsvErrors.length ? 'text-amber-300' : 'text-[#A7A39A]'}>{buildingCsvErrors.length} row/file error{buildingCsvErrors.length === 1 ? '' : 's'}</span>
                    </div>
                    {buildingCsvErrors.length > 0 && <ul className="max-h-48 overflow-y-auto space-y-1 p-3 bg-[#090909] border border-amber-500/20 rounded text-xs text-amber-200">{buildingCsvErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
                    {buildingCsvPreview.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[#A7A39A]"><tr><th className="p-2">CSV row</th><th className="p-2">Building</th><th className="p-2">Location</th><th className="p-2">Coordinates</th><th className="p-2">Category</th></tr></thead>
                          <tbody>{buildingCsvPreview.slice(0, 100).map(row => <tr key={row.building.id} className="border-t border-[#222222]"><td className="p-2 text-[#A7A39A]">{row.line}</td><td className="p-2">{row.building.name}</td><td className="p-2">{row.building.location}</td><td className="p-2">{row.building.lat}, {row.building.lng}</td><td className="p-2">{row.building.type}</td></tr>)}</tbody>
                        </table>
                        {buildingCsvPreview.length > 100 && <p className="mt-2 text-xs text-[#A7A39A]">Showing first 100 of {buildingCsvPreview.length} valid rows.</p>}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={importValidBuildings} disabled={buildingCsvPreview.length === 0} className="px-4 py-2 bg-[#E5C77B] disabled:opacity-40 text-[#090909] text-xs font-semibold rounded">Import {buildingCsvPreview.length} valid row{buildingCsvPreview.length === 1 ? '' : 's'}</button>
                      <button onClick={() => { setBuildingCsvName(''); setBuildingCsvPreview([]); setBuildingCsvErrors([]); }} className="px-4 py-2 bg-[#222222] text-[#A7A39A] text-xs rounded">Clear preview</button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {currentScreen === 'add-building' && canManageBuildings && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5] mb-1">Register New Building & Incident Pin</h1>
                <p className="text-sm text-[#A7A39A]">Input structural parameters and GPS coordinates to plot the site on the GIS Incident Map.</p>
              </div>
              <form onSubmit={handleRegisterBuilding} className="p-6 bg-[#191919] border border-[#222222] rounded space-y-5">
                {buildingRegistrationError && (
                  <p role="alert" className="p-3 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                    {buildingRegistrationError}
                  </p>
                )}
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

          {currentScreen === 'scan' && canEdit && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">{editingRecordId ? 'Edit Inspection Record' : 'Record an Inspection'}</h1>
                <p className="text-sm text-[#A7A39A]">{editingRecordId ? 'Update the requested inspection details, then submit the record for review again.' : 'Save inspector-entered findings, measurements, and photo evidence. This workspace does not perform automated image analysis.'}</p>
              </div>
              <form onSubmit={saveInspectionRecord} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-5">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Select Target Building</label>
                    <select disabled={Boolean(editingRecordId)} value={activeSelectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5] disabled:opacity-60">
                      {activeBuildings.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Structural Component</label>
                    <select value={activeScanComponent} onChange={(e) => setActiveScanComponent(e.target.value)} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                      {['Walls', 'Columns', 'Beams', 'Ceilings', 'Pillars', 'Floors', 'Foundations', 'Other'].map(comp => (<option key={comp} value={comp}>{comp}</option>))}
                    </select>
                  </div>
                  {selectedChecklist && (
                    <fieldset className="space-y-3">
                      <legend className="text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Inspection checklist</legend>
                      <select aria-label="Checklist template" value={selectedChecklist.id} onChange={event => {
                        setSelectedChecklistId(event.target.value);
                        setChecklistResponses({});
                      }} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                        {availableChecklistTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                      <div className="space-y-2">
                        {selectedChecklist.items.map(item => (
                          <label key={item} className="flex items-start gap-2 text-[11px] text-[#A7A39A]">
                            <input type="checkbox" checked={checklistResponses[item] === true} onChange={event => setChecklistResponses(current => ({ ...current, [item]: event.target.checked }))} className="mt-0.5 accent-[#E5C77B]" />
                            <span>{item}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#A7A39A] mb-2">Inspector-assessed concern</label>
                    <select value={scanConcern} onChange={event => setScanConcern(event.target.value as ScanRecord['concernLevel'])} className="w-full px-3 py-2.5 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                      {['Low Concern', 'Moderate Concern', 'High Concern', 'Urgent Professional Assessment'].map(level => <option key={level}>{level}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-[#A7A39A]">Crack length (mm)
                      <input type="number" min="0" step="any" value={scanCrackLength} onChange={event => setScanCrackLength(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Optional" />
                    </label>
                    <label className="text-xs text-[#A7A39A]">Crack width (mm)
                      <input type="number" min="0" step="any" value={scanCrackWidth} onChange={event => setScanCrackWidth(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Optional" />
                    </label>
                  </div>
                  <button type="submit" className="w-full py-3 bg-[#E5C77B] hover:bg-[#B58B3B] text-[#090909] font-semibold rounded text-xs flex items-center justify-center gap-2">
                    <ClipboardCheck className="w-4 h-4" /> {editingRecordId ? 'Save changes' : 'Save inspection record'}
                  </button>
                  {editingRecordId && <button type="button" onClick={() => {
                    setEditingRecordId(null);
                    setCurrentScreen('diagnosis');
                  }} className="w-full py-2 bg-[#222222] text-[#A7A39A] text-xs rounded">Cancel editing</button>}
                  {scanError && <p role="alert" className="text-xs text-red-300">{scanError}</p>}
                </div>
                <div className="lg:col-span-2 p-6 bg-[#191919] border border-[#222222] rounded">
                  <div className="space-y-4">
                    <div className="h-64 rounded overflow-hidden relative mb-4">
                      <img
                        src={uploadedImageUrl || activeBuildings.find(b => b.id === activeSelectedBuildingId)?.imageUrl || INITIAL_BUILDINGS[0].imageUrl}
                        alt="Selected inspection photo evidence"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <label className="px-4 py-2 bg-[#222222] hover:bg-[#333333] text-[#F5F0E5] text-xs font-medium rounded cursor-pointer inline-flex items-center gap-2">
                      <Upload className="w-4 h-4 text-[#E5C77B]" />
                      <span>Upload New Photograph</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {uploadedImageUrl && (
                      <div className="mt-4 p-3 bg-[#191919] border border-[#B58B3B]/40 rounded space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#E5C77B] font-medium truncate">{uploadedFileName || 'Uploaded image'}</span>
                          <button
                            type="button"
                            onClick={clearUploadedImage}
                            className="text-[#A7A39A] hover:text-[#F5F0E5]"
                          >
                            Remove
                          </button>
                        </div>
                        <img
                          src={uploadedImageUrl}
                          alt="Uploaded inspection evidence preview"
                          className="w-full max-h-96 object-contain rounded border border-[#222222] bg-[#090909]"
                        />
                      </div>
                    )}
                    <label className="block text-left text-xs text-[#A7A39A]">
                      Inspector observations (one per line) *
                      <textarea required value={scanNotes} onChange={event => setScanNotes(event.target.value)} rows={5} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Describe what was observed and where. Do not treat this demo as an engineering diagnosis." />
                    </label>
                  </div>
                </div>
              </form>
            </div>
          )}

          {currentScreen === 'diagnosis' && currentScanResult && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#F5F0E5]">Inspection Record</h1>
                  <p className="text-sm text-[#A7A39A]">{currentScanResult.buildingName} · {currentScanResult.component} · {formatRecordDate(currentScanResult.date)}</p>
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
                    <span className="text-xs font-mono uppercase text-[#A7A39A]">Photo evidence</span>
                    <span className="text-[10px] text-[#A7A39A]">{currentScanResult.source === 'manual' ? 'Inspector-entered' : 'Preloaded demo record'}</span>
                  </div>
                  <div className="h-80 rounded overflow-hidden relative border border-[#222222]">
                    <img
                      src={currentScanResult.imageUrl}
                      alt="Structural inspection scan"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-[#090909] rounded"><span className="block text-[#A7A39A]">Recorded length</span><strong>{currentScanResult.crackLength}</strong></div>
                    <div className="p-3 bg-[#090909] rounded"><span className="block text-[#A7A39A]">Recorded width</span><strong>{currentScanResult.crackWidth}</strong></div>
                  </div>
                  <ul className="list-disc pl-5 text-xs text-[#F5F0E5] space-y-1">
                    {currentScanResult.observations.map((observation, index) => <li key={`${currentScanResult.id}-${index}`}>{observation}</li>)}
                  </ul>
                  {currentScanResult.checklist && currentScanResult.checklist.length > 0 && (
                    <section className="pt-4 border-t border-[#222222] space-y-2">
                      <h3 className="text-xs font-bold text-[#F5F0E5]">Checklist results</h3>
                      {currentScanResult.checklist.map(item => (
                        <div key={item.label} className="flex items-start gap-2 text-xs">
                          {item.complete ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-emerald-400" /> : <CircleAlert className="w-3.5 h-3.5 mt-0.5 text-amber-300" />}
                          <span className={item.complete ? 'text-[#A7A39A]' : 'text-amber-100'}>{item.label}</span>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
                <div className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                  <h3 className="text-sm font-bold text-[#F5F0E5] font-mono uppercase">{currentScanResult.concernLevel}</h3>
                  <p className="text-xs text-[#A7A39A]">Review status: <strong className="text-[#E5C77B]">{currentScanResult.reviewStatus || 'Demo record'}</strong></p>
                  <p className="text-xs text-[#A7A39A] leading-relaxed">{currentScanResult.summary}</p>
                  <p className="text-[11px] text-amber-200">This is a recorded observation, not an engineering assessment. Engage a qualified professional for structural advice.</p>
                  {canEdit && <button onClick={() => scheduleFollowUp(currentScanResult)} className="w-full py-2.5 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded">Create follow-up task</button>}
                  {canEdit && <button onClick={() => setCurrentScreen('scan')} className="w-full py-2.5 bg-[#222222] text-[#E5C77B] font-semibold text-xs rounded">Record another inspection</button>}
                </div>
              </div>
              {currentScanResult.source === 'manual' && (
                <section className="p-5 bg-[#191919] border border-[#222222] rounded space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-sm text-[#F5F0E5]">Inspection review workflow</h2>
                      <p className="text-xs text-[#A7A39A] mt-1">Current status: {currentScanResult.reviewStatus || 'Draft'} · Created by {currentScanResult.createdBy || 'Unknown'}</p>
                    </div>
                    {canEdit && ['Draft', 'Changes Requested'].includes(currentScanResult.reviewStatus || 'Draft') && (
                      <button onClick={() => startEditingInspection(currentScanResult)} className="px-4 py-2 bg-[#222222] text-[#E5C77B] text-xs rounded">Edit record</button>
                    )}
                    {canEdit && ['Draft', 'Changes Requested'].includes(currentScanResult.reviewStatus || 'Draft') && (
                      <button onClick={() => updateInspectionReview(currentScanResult, 'Submitted')} className="px-4 py-2 bg-[#E5C77B] text-[#090909] text-xs font-semibold rounded">Submit for review</button>
                    )}
                    {canReview && currentScanResult.reviewStatus === 'Submitted' && (
                      <button onClick={() => updateInspectionReview(currentScanResult, 'Under Review')} className="px-4 py-2 bg-[#222222] border border-[#B58B3B]/40 text-[#E5C77B] text-xs rounded">Start review</button>
                    )}
                  </div>
                  {canReview && currentScanResult.reviewStatus === 'Under Review' && (
                    <div className="space-y-3">
                      <label className="block text-xs text-[#A7A39A]">Reviewer note (required when requesting changes)
                        <textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} rows={2} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => updateInspectionReview(currentScanResult, 'Approved', reviewNote)} className="px-4 py-2 bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 text-xs rounded">Approve</button>
                        <button onClick={() => updateInspectionReview(currentScanResult, 'Changes Requested', reviewNote)} className="px-4 py-2 bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs rounded">Request changes</button>
                      </div>
                    </div>
                  )}
                  {canReview && currentScanResult.reviewStatus === 'Approved' && <button onClick={() => updateInspectionReview(currentScanResult, 'Closed')} className="px-4 py-2 bg-[#222222] text-[#E5C77B] text-xs rounded">Close review</button>}
                  {reviewError && <p role="alert" className="text-xs text-red-300">{reviewError}</p>}
                  {(currentScanResult.reviewerNotes || []).length > 0 && (
                    <div className="border-t border-[#222222] pt-3 space-y-2">
                      <h3 className="text-xs font-bold text-[#A7A39A]">Reviewer notes</h3>
                      {currentScanResult.reviewerNotes?.map((note, index) => <p key={`${currentScanResult.id}-review-${index}`} className="text-xs text-[#A7A39A]">{note}</p>)}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {currentScreen === 'review-queue' && canReview && (
            <div className="max-w-5xl mx-auto space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Inspection Review Queue</h1>
                <p className="mt-1 text-sm text-[#A7A39A]">Submitted records require a qualified reviewer before approval.</p>
              </div>
              {reviewQueue.map(scan => (
                <button key={scan.id} onClick={() => { setCurrentScanResult(scan); setCurrentScreen('diagnosis'); }} className="w-full p-5 bg-[#191919] border border-[#222222] rounded text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#B58B3B]/40">
                  <span>
                    <span className="block text-sm font-bold text-[#F5F0E5]">{scan.buildingName} · {scan.component}</span>
                    <span className="block mt-1 text-xs text-[#A7A39A]">By {scan.createdBy || 'Unknown'} · {formatRecordDate(scan.date)}</span>
                  </span>
                  <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200">{scan.reviewStatus}</span>
                </button>
              ))}
              {reviewQueue.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No inspections are waiting for review.</p>}
            </div>
          )}

          {currentScreen === 'monitor' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-wider text-[#B58B3B]">Structural Health & Telemetry Array</span>
                  </div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">IoT Telemetry & Health Diagnostics</h1>
                  <p className="text-sm text-[#A7A39A]">Continuous multi-sensor telemetry feeds, threshold monitoring, and historical crack memory.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Select building for telemetry"
                    value={activeSelectedBuildingId}
                    onChange={event => setSelectedBuildingId(event.target.value)}
                    className="px-3 py-2 bg-[#191919] border border-[#222222] rounded text-sm text-[#F5F0E5]"
                  >
                    {activeBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
                  </select>
                  <button
                    onClick={() => setCurrentScreen('map')}
                    className="px-3 py-2 bg-[#222222] hover:bg-[#333333] text-xs font-mono text-[#E5C77B] rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Locate on Map</span>
                  </button>
                </div>
              </div>

              {/* Sub-tab Navigation */}
              <div className="flex border-b border-[#222222] gap-6">
                <button
                  type="button"
                  onClick={() => setMonitorActiveTab('telemetry')}
                  className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    monitorActiveTab === 'telemetry'
                      ? 'border-[#E5C77B] text-[#E5C77B]'
                      : 'border-transparent text-[#A7A39A] hover:text-[#F5F0E5]'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Live IoT Telemetry & Event Simulator</span>
                  {criticalTelemetryCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-red-500/20 text-red-400 font-mono">
                      {criticalTelemetryCount} alert{criticalTelemetryCount === 1 ? '' : 's'}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMonitorActiveTab('memory')}
                  className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    monitorActiveTab === 'memory'
                      ? 'border-[#E5C77B] text-[#E5C77B]'
                      : 'border-transparent text-[#A7A39A] hover:text-[#F5F0E5]'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Building Memory™ & Inspection History</span>
                </button>
              </div>

              {monitorActiveTab === 'telemetry' && (
                <div className="space-y-6">
                  {/* Selected building telemetry display */}
                  {telemetryMap[activeSelectedBuildingId] ? (
                    <TelemetryPanel
                      telemetry={telemetryMap[activeSelectedBuildingId]}
                      isStreaming={isTelemetryStreaming}
                      onToggleStreaming={() => setIsTelemetryStreaming(s => !s)}
                      onSimulate={handleSimulateTelemetry}
                      compact={false}
                    />
                  ) : (
                    <div className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">
                      No live telemetry feed available for this asset.
                    </div>
                  )}

                  {/* Portfolio-Wide Sensor Telemetry Health Table */}
                  <section className="p-5 bg-[#191919] border border-[#222222] rounded space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-bold text-[#F5F0E5]">Portfolio-Wide Sensor Telemetry Matrix</h2>
                        <p className="text-xs text-[#A7A39A]">Real-time telemetry streams across all monitored architectural assets</p>
                      </div>
                      <div className="text-xs font-mono text-[#A7A39A]">
                        {Object.keys(telemetryMap).length * 4} Total Sensors Active
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[#A7A39A] border-b border-[#222222]">
                          <tr>
                            <th className="p-3">Asset</th>
                            <th className="p-3">Location</th>
                            <th className="p-3">Vibration (g)</th>
                            <th className="p-3">Tilt (°)</th>
                            <th className="p-3">Strain (με)</th>
                            <th className="p-3">Moisture (%)</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#222222]">
                          {activeBuildings.map(bld => {
                            const tel = telemetryMap[bld.id];
                            const isCrit = tel?.overallStatus === 'critical';
                            const isWarn = tel?.overallStatus === 'warning';
                            const isSelected = bld.id === activeSelectedBuildingId;

                            return (
                              <tr
                                key={bld.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-[#B58B3B]/10' : isCrit ? 'bg-red-950/20' : 'hover:bg-[#222222]/40'
                                }`}
                              >
                                <td className="p-3 font-semibold text-[#F5F0E5] flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${isCrit ? 'bg-red-500 animate-ping' : isWarn ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                  <span>{bld.name}</span>
                                </td>
                                <td className="p-3 text-[#A7A39A]">{bld.location}</td>
                                <td className={`p-3 font-mono ${tel?.sensors.accelerometer.status === 'critical' ? 'text-red-400 font-bold' : tel?.sensors.accelerometer.status === 'warning' ? 'text-amber-400' : 'text-[#F5F0E5]'}`}>
                                  {tel ? `${tel.sensors.accelerometer.value} g` : '—'}
                                </td>
                                <td className={`p-3 font-mono ${tel?.sensors.tiltmeter.status === 'critical' ? 'text-red-400 font-bold' : tel?.sensors.tiltmeter.status === 'warning' ? 'text-amber-400' : 'text-[#F5F0E5]'}`}>
                                  {tel ? `${tel.sensors.tiltmeter.value} °` : '—'}
                                </td>
                                <td className={`p-3 font-mono ${tel?.sensors.strain_gauge.status === 'critical' ? 'text-red-400 font-bold' : tel?.sensors.strain_gauge.status === 'warning' ? 'text-amber-400' : 'text-[#F5F0E5]'}`}>
                                  {tel ? `${tel.sensors.strain_gauge.value} με` : '—'}
                                </td>
                                <td className={`p-3 font-mono ${tel?.sensors.moisture.status === 'critical' ? 'text-red-400 font-bold' : tel?.sensors.moisture.status === 'warning' ? 'text-amber-400' : 'text-[#F5F0E5]'}`}>
                                  {tel ? `${tel.sensors.moisture.value} %` : '—'}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                    isCrit ? 'bg-red-500/20 text-red-400 border border-red-500/30' : isWarn ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    {tel?.overallStatus || 'NOMINAL'}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedBuildingId(bld.id)}
                                      className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] text-xs font-mono text-[#E5C77B] rounded cursor-pointer"
                                    >
                                      Inspect
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBuildingId(bld.id);
                                        setCurrentScreen('map');
                                      }}
                                      className="p-1.5 bg-[#222222] hover:bg-[#333333] text-[#A7A39A] hover:text-[#F5F0E5] rounded cursor-pointer"
                                      title="Locate on Map"
                                    >
                                      <MapPin className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {monitorActiveTab === 'memory' && (
                <div className="space-y-6">
                  {memoryLatest && (
                    <div className="p-4 bg-[#191919] border border-[#222222] rounded flex flex-wrap gap-4 items-center text-xs">
                      <span className="text-[#A7A39A]">Latest recorded width change ({memoryLatest.component}):</span>
                      <strong className={widthChange && widthChange.startsWith('+') ? 'text-amber-300' : 'text-[#E5C77B]'}>{widthChange || 'No comparable measurement'}</strong>
                      <span className="text-[10px] text-[#A7A39A]">Measurements are manually entered; comparison is descriptive only.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {memoryComparisonScans.map((scan, index) => (
                      <button key={scan.id} onClick={() => { setCurrentScanResult(scan); setCurrentScreen('diagnosis'); }} className="p-4 bg-[#191919] border border-[#222222] rounded text-left space-y-3 hover:border-[#B58B3B]/40">
                        <div className="flex justify-between gap-3 text-xs">
                          <span className={index === 0 ? 'text-[#E5C77B]' : 'text-[#A7A39A]'}>{index === 0 ? 'Latest record' : 'Previous record'} · {scan.component}</span>
                          <span>{formatRecordDate(scan.date)}</span>
                        </div>
                        <img src={scan.imageUrl} alt={`${scan.component} inspection evidence`} className="w-full h-56 object-cover rounded" />
                        <div className="flex justify-between text-xs"><span>Width: {scan.crackWidth}</span><span>{scan.concernLevel}</span></div>
                        <p className="text-xs text-[#A7A39A] line-clamp-2">{scan.observations.join(' ')}</p>
                      </button>
                    ))}
                  </div>
                  {memoryScans.length > 0 && (
                    <section className="p-5 bg-[#191919] border border-[#222222] rounded space-y-3">
                      <h2 className="text-sm font-bold text-[#F5F0E5]">All records · {memoryScans.length}</h2>
                      {memoryScans.map(scan => (
                        <button key={scan.id} onClick={() => { setCurrentScanResult(scan); setCurrentScreen('diagnosis'); }} className="w-full flex items-center justify-between gap-4 border-t border-[#222222] pt-3 text-left">
                          <span className="text-xs text-[#F5F0E5]">{scan.component} · {scan.concernLevel}</span>
                          <span className="text-[11px] text-[#A7A39A]">{formatRecordDate(scan.date)}</span>
                        </button>
                      ))}
                    </section>
                  )}
                  {memoryScans.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No inspection history for this building yet.</p>}
                </div>
              )}
            </div>
          )}

          {currentScreen === 'alerts' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Alerts & Notification Centre</h1>
                <div className="flex items-center gap-3">
                  <select aria-label="Filter alerts by severity" value={alertSeverityFilter} onChange={event => setAlertSeverityFilter(event.target.value)} className="px-3 py-2 bg-[#191919] border border-[#222222] rounded text-xs text-[#F5F0E5]">
                    {['All severities', 'Low', 'Moderate', 'High', 'Urgent'].map(severity => <option key={severity}>{severity}</option>)}
                  </select>
                  <button onClick={() => {
                    const unread = alerts.filter(item => !item.read).length;
                    setAlerts(current => current.map(item => ({ ...item, read: true })));
                    if (unread) recordAudit('Marked all alerts read', 'Alerts', 'all', `${unread} alerts marked read.`);
                  }} className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded font-mono">Mark All as Read</button>
                </div>
              </div>
              <section className="p-5 bg-[#191919] border border-[#222222] rounded space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#F5F0E5]">Task reminders</h2>
                    <p className="text-xs text-[#A7A39A] mt-1">Due-date reminders are generated while this workspace is open.</p>
                  </div>
                  <button onClick={() => setCurrentScreen('settings')} className="text-xs text-[#E5C77B] hover:underline">Notification settings</button>
                </div>
                {dueWorkOrders.map(order => (
                  <button key={order.id} onClick={() => setCurrentScreen('work-orders')} className="w-full p-3 bg-[#090909] border border-amber-500/20 rounded flex items-center justify-between gap-3 text-left">
                    <span className="min-w-0">
                      <span className="block text-xs text-[#F5F0E5] truncate">{order.title}</span>
                      <span className="block text-[11px] text-[#A7A39A]">Due {order.dueDate} · {activeBuildings.find(building => building.id === order.buildingId)?.name || 'Building'}</span>
                    </span>
                    <span className={order.dueDate < todayDate ? 'text-xs text-red-300' : 'text-xs text-amber-200'}>{order.dueDate < todayDate ? 'Overdue' : 'Due today'}</span>
                  </button>
                ))}
                {dueWorkOrders.length === 0 && <p className="text-xs text-[#A7A39A]">No tasks are due today or overdue.</p>}
              </section>
              <div className="space-y-4">
                {filteredAlerts.map((alt) => (
                  <div key={alt.id} className={`p-5 bg-[#191919] border rounded flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${alt.read ? 'border-[#222222]' : 'border-[#B58B3B]/50'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[#F5F0E5] text-sm">{alt.title} — <span className="text-[#E5C77B]">{alt.buildingName}</span></h3>
                        {alt.source === 'demo' && <span className="text-[9px] text-[#A7A39A]">DEMO</span>}
                        {!alt.read && <span className="text-[9px] uppercase text-amber-300">Unread</span>}tos, tasks, alerts, checklists, and audit history. If those remain local for the presentation, label them clearly as browser-only and keep all claims of cross-user/live persistence out of the UI.
                        Wire map pin creation to the same validated app handler as manual registration; surface request failures and refresh the portfolio after a successful save.
                        Fix Enter behavior in the spatial search, and label the SQL panel as a non-executed example/translation.
                        Demo reliability and credibility
                        5. Make the demo/live distinction explicit for operator sign-in, telemetry, seeded health scores, inspection recommendations, and the landing page’s Neon/PostGIS claim.
                        6. Document required environment variables and deployment prerequisites, including Supabase migration, Neon schema/credentials (if retained), and MapTiler configuration. Test these in the actual presentation environment.
                        7. Add smoke/E2E coverage for demo entry, building creation/import, map pin save/failure, inspection/review, task reminders, report printing, and configured sign-in/onboarding.
                        8. Resolve the lint warnings and verify the external map/geocoding services and browser notification permissions on the target machine.
                        
                        Bottom line: this is a substantial interactive prototype with working-looking local workflows and compile/build validation, but the repository provides no evidence of a complete live end-to-end setup. The Neon access boundary, split persistence, and misleading live/demo indicators should be addressed before presenting it as a production-connected system.
                      </div>
                      <p className="text-xs text-[#A7A39A] mt-1">{alt.description}</p>
                      <p className="text-[11px] text-[#A7A39A] mt-2">{alt.recommendation} · {alt.timestamp}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => toggleAlertRead(alt)} className="px-3 py-1.5 bg-[#222222] text-xs text-[#A7A39A] rounded">{alt.read ? 'Mark unread' : 'Mark read'}</button>
                      <button onClick={() => openAlertTarget(alt)} className="px-3 py-1.5 bg-[#222222] text-xs text-[#E5C77B] rounded font-mono">{alt.scanId ? 'Open inspection' : 'Locate building'}</button>
                    </div>
                  </div>
                ))}
                {filteredAlerts.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No alerts match this severity.</p>}
              </div>
            </div>
          )}

          {currentScreen === 'recommendations' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Review Recommendations</h1>
                <p className="text-xs text-[#A7A39A] mt-1">Follow-ups are derived from recorded high-concern observations and are not automated engineering advice.</p>
              </div>
              {actionableScans.map(scan => (
                <div key={scan.id} className="p-6 bg-[#191919] border border-[#222222] rounded space-y-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-red-500/20 text-red-300">{scan.concernLevel}</span>
                  <h3 className="font-bold text-base text-[#F5F0E5]">{scan.buildingName} · {scan.component}</h3>
                  <p className="text-xs text-[#A7A39A]">{scan.observations.join(' ')}</p>
                  <p className="text-[11px] text-amber-200">Arrange review by a qualified structural professional.</p>
                  {canEdit && <button onClick={() => scheduleFollowUp(scan)} className="px-4 py-2 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded">Create follow-up task</button>}
                </div>
              ))}
              {actionableScans.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No high-concern records currently need follow-up.</p>}
            </div>
          )}

          {currentScreen === 'work-orders' && canEdit && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Inspection Tasks & Work Orders</h1>
                <p className="text-sm text-[#A7A39A]">Assign owners, set due dates, and track follow-up work. Tasks are saved in this browser; due and overdue tasks appear in Alerts.</p>
              </div>
              <form onSubmit={createWorkOrder} className="p-5 bg-[#191919] border border-[#222222] rounded grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-xs text-[#A7A39A]">Building *
                  <select required value={workOrderBuildingId} onChange={event => setWorkOrderBuildingId(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]">
                    <option value="">Select a building</option>
                    {activeBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-[#A7A39A]">Task title *
                  <input required value={workOrderTitle} onChange={event => setWorkOrderTitle(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Schedule structural review" />
                </label>
                <label className="text-xs text-[#A7A39A]">Assigned to
                  <input type="email" value={workOrderAssignee} onChange={event => setWorkOrderAssignee(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="engineer@example.com" />
                </label>
                <label className="text-xs text-[#A7A39A]">Due date *
                  <input required type="date" min={todayDate} value={workOrderDueDate} onChange={event => setWorkOrderDueDate(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" />
                </label>
                <label className="text-xs text-[#A7A39A] md:col-span-2">Description
                  <textarea rows={2} value={workOrderDescription} onChange={event => setWorkOrderDescription(event.target.value)} className="mt-2 w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" />
                </label>
                {workOrderError && <p role="alert" className="md:col-span-2 text-xs text-red-300">{workOrderError}</p>}
                <div className="md:col-span-2">
                  <button type="submit" className="px-5 py-2.5 bg-[#E5C77B] text-[#090909] font-semibold text-xs rounded">Create task</button>
                </div>
              </form>
              <div className="space-y-3">
                {workOrders.map(order => {
                  const building = activeBuildings.find(item => item.id === order.buildingId);
                  const isOverdue = order.status !== 'Completed' && order.dueDate < todayDate;
                  return (
                    <article key={order.id} className="p-5 bg-[#191919] border border-[#222222] rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="font-bold text-sm text-[#F5F0E5]">{order.title}</h2>
                        <p className="text-xs text-[#A7A39A] mt-1">{building?.name || 'Building no longer available'} · Assigned: {order.assignedTo}</p>
                        <p className="text-xs text-[#A7A39A] mt-1">{order.description || 'No additional notes.'}</p>
                        <p className={`flex items-center gap-1 mt-2 text-[11px] ${isOverdue ? 'text-red-300' : 'text-[#A7A39A]'}`}><Clock className="w-3 h-3" />Due {order.dueDate}{isOverdue ? ' · Overdue' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.relatedScanId && <button onClick={() => {
                          const related = scans.find(scan => scan.id === order.relatedScanId);
                          if (related) { setCurrentScanResult(related); setCurrentScreen('diagnosis'); }
                        }} className="px-3 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded">Open record</button>}
                        <select aria-label={`Update status for ${order.title}`} value={order.status} onChange={event => updateWorkOrderStatus(order, event.target.value as WorkOrder['status'])} className="px-3 py-2 bg-[#090909] border border-[#222222] rounded text-xs text-[#F5F0E5]">
                          {['Open', 'In Progress', 'Completed'].map(status => <option key={status}>{status}</option>)}
                        </select>
                      </div>
                    </article>
                  );
                })}
                {workOrders.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No work orders yet. Create one above or from a high-concern inspection record.</p>}
              </div>
            </div>
          )}

          {currentScreen === 'reports' && (
            <div className="space-y-6 animate-screen-in">
              <style>{`@media print { @page { margin: 16mm; } body * { visibility: hidden !important; } #printable-report, #printable-report * { visibility: visible !important; } #printable-report { position: absolute; inset: 0; width: 100%; max-width: none !important; padding: 0 !important; border: none !important; color: #111 !important; background: #fff !important; box-shadow: none !important; } #printable-report article { break-inside: avoid; border-color: #d4d4d8 !important; background: #fafafa !important; } #printable-report img { max-height: 240px; object-fit: contain; } }`}</style>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#B58B3B] mb-1">Executive Dossier</p>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#F5F0E5]">Reports & Inspection History</h1>
                </div>
                <div className="flex gap-3">
                  <select aria-label="Select report building" value={reportBuilding?.id || ''} onChange={event => setReportBuildingId(event.target.value)} className="px-3.5 py-2 bg-[#141414] border border-white/[0.08] rounded-lg text-xs text-[#F5F0E5]">
                    {activeBuildings.map(building => <option key={building.id} value={building.id}>{building.name}</option>)}
                  </select>
                  <button onClick={() => window.print()} disabled={!reportBuilding} className="px-4 py-2.5 bg-gradient-to-r from-[#E5C77B] to-[#C9A24B] hover:from-[#F0D58D] hover:to-[#D5AE56] text-[#090909] font-semibold text-xs rounded-lg flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-[#B58B3B]/15 cursor-pointer transition-all"><Download className="w-4 h-4" /> Print / Save PDF</button>
                </div>
              </div>
              <div id="printable-report" className="p-8 sm:p-10 liquid-glass-card rounded-2xl space-y-8 max-w-4xl mx-auto">
                {reportBuilding ? <>
                  <header className="space-y-4 border-b border-white/[0.08] pb-6">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#B58B3B]">ARCHONIX · Structural Inspection Dossier</p>
                      <span className="text-[10px] font-mono text-[#A7A39A]">Generated {reportGeneratedDate}</span>
                    </div>
                    <div>
                      <h2 className="font-bold text-2xl text-[#F5F0E5] tracking-tight">{reportBuilding.name}</h2>
                      <p className="text-xs text-[#A7A39A] mt-1">{reportBuilding.location}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] font-mono uppercase text-[#7C7870]">Status</div>
                        <div className="text-xs font-semibold text-[#F5F0E5] mt-1">{reportBuilding.status}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] font-mono uppercase text-[#7C7870]">Asset Type</div>
                        <div className="text-xs font-semibold text-[#F5F0E5] mt-1">{reportBuilding.type}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] font-mono uppercase text-[#7C7870]">Health Index</div>
                        <div className="text-xs font-semibold font-mono text-[#E5C77B] mt-1">{typeof reportBuilding.healthIndex === 'number' ? `${reportBuilding.healthIndex.toFixed(1)}%` : 'N/A'}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[10px] font-mono uppercase text-[#7C7870]">Records</div>
                        <div className="text-xs font-semibold font-mono text-[#F5F0E5] mt-1">{reportScans.length}</div>
                      </div>
                    </div>
                  </header>
                  <section className="space-y-4">
                    <h3 className="font-semibold text-sm uppercase tracking-wider font-mono text-[#E5C77B]">Inspection Records ({reportScans.length})</h3>
                    {reportScans.map(scan => (
                      <article key={scan.id} className="p-5 bg-white/[0.02] border border-white/[0.08] rounded-xl space-y-3">
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <strong className="text-[#F5F0E5]">{scan.component} · {scan.concernLevel} · {scan.reviewStatus || 'Demo record'}</strong>
                          <span className="font-mono text-[#A7A39A]">{formatRecordDate(scan.date)}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs font-mono text-[#A7A39A]">
                          <span>Crack length: <strong className="text-[#F5F0E5]">{scan.crackLength}</strong></span>
                          <span>Width: <strong className="text-[#F5F0E5]">{scan.crackWidth}</strong></span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#D8D3C8]">{scan.observations.join(' ')}</p>
                        {scan.checklist && scan.checklist.length > 0 && <p className="text-xs text-[#A7A39A]">Checklist: {scan.checklist.filter(item => item.complete).length}/{scan.checklist.length} items marked complete.</p>}
                        <img src={scan.imageUrl} alt={`${scan.component} evidence`} className="w-full max-h-64 object-contain rounded-lg border border-white/[0.06]" />
                        <p className="text-[10px] font-mono text-[#7C7870]">Source: {scan.source === 'manual' ? 'Inspector-entered' : 'Preloaded demo record'}. Not an engineering assessment.</p>
                      </article>
                    ))}
                    {reportScans.length === 0 && <p className="text-xs text-[#A7A39A]">No inspection records for this building.</p>}
                  </section>
                  <section className="space-y-2.5">
                    <h3 className="font-semibold text-sm uppercase tracking-wider font-mono text-[#E5C77B]">Open Follow-up Tasks</h3>
                    {workOrders.filter(order => order.buildingId === reportBuilding.id && order.status !== 'Completed').map(order => (
                      <div key={order.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-[#F5F0E5]">{order.title}</span>
                        <span className="font-mono text-[#A7A39A]">{order.status} · Due {order.dueDate} · {order.assignedTo}</span>
                      </div>
                    ))}
                    {!workOrders.some(order => order.buildingId === reportBuilding.id && order.status !== 'Completed') && <p className="text-xs text-[#A7A39A]">No open tasks.</p>}
                  </section>
                  <p className="border-t border-white/[0.08] pt-4 text-[10px] font-mono text-[#7C7870]">Measurements and findings in this prototype are manually recorded or demo data. This document is not a certified structural report.</p>
                </> : <p className="text-sm text-[#A7A39A]">No building is available for a report.</p>}
              </div>
            </div>
          )}

          {currentScreen === 'audit-log' && (
            <div className="max-w-5xl mx-auto space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Audit History</h1>
                <p className="mt-1 text-sm text-[#A7A39A]">Recent actions recorded in this browser, newest first. This prototype log is editable browser data and is not a tamper-proof compliance audit.</p>
              </div>
              <div className="space-y-2">
                {auditLog.map(item => (
                  <article key={item.id} className="p-4 bg-[#191919] border border-[#222222] rounded flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold text-[#F5F0E5]">{item.action} <span className="text-[#A7A39A]">· {item.entity}</span></h2>
                      <p className="mt-1 text-xs text-[#A7A39A] break-words">{item.details}</p>
                      <p className="mt-1 text-[10px] text-[#77736B]">Record: {item.entityId} · By {item.actor}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-[#A7A39A]">{formatRecordDate(item.timestamp)}</time>
                  </article>
                ))}
                {auditLog.length === 0 && <p className="p-8 text-center text-sm text-[#A7A39A] bg-[#191919] border border-[#222222] rounded">No actions have been recorded yet.</p>}
              </div>
            </div>
          )}

          {currentScreen === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F5F0E5]">Account Settings & Preferences</h1>
                <p className="mt-1 text-xs text-[#A7A39A]">{organizationName || 'Local demo workspace'}</p>
              </div>
              <section className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                <h2 className="font-bold text-sm text-[#F5F0E5]">Signed-in account & access</h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#090909] rounded"><span className="block text-[#A7A39A]">Account</span>{isDemoSession ? 'Local demo account' : currentUser?.email || 'Not signed in'}</div>
                  <div className="p-3 bg-[#090909] rounded"><span className="block text-[#A7A39A]">Organization role</span>{isDemoSession ? 'Demo administrator' : currentUser?.role.replaceAll('_', ' ') || 'Viewer'}</div>
                </div>
                <div className="space-y-2 text-xs text-[#A7A39A]">
                  <p>Administrator: manage portfolio and all records.</p>
                  <p>Structural engineer / inspector: create inspection records and follow-up tasks.</p>
                  <p>Viewer: read-only access.</p>
                </div>
                <p className="text-[11px] text-amber-200">Organization roles are stored in Supabase memberships. Client-side checks are only for user experience; Row Level Security and the organization migration enforce data access.</p>
              </section>
              {!isDemoSession && (
                <section className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                  <h2 className="font-bold text-sm text-[#F5F0E5]">Account security</h2>
                  <form onSubmit={event => void handleEmailUpdate(event)} className="flex flex-col sm:flex-row gap-2">
                    <input type="email" required value={newAccountEmail} onChange={event => setNewAccountEmail(event.target.value)} className="flex-1 px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="New account email" />
                    <button type="submit" className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded">Change email</button>
                  </form>
                  {emailUpdateNotice && <p role="status" className="text-xs text-[#A7A39A]">{emailUpdateNotice}</p>}
                  <p className="text-xs text-[#A7A39A]">To reset your password, sign out and use “Forgot password?” on the sign-in screen.</p>
                </section>
              )}
              {currentUser?.role === 'administrator' && !isDemoSession && (
                <section className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                  <h2 className="font-bold text-sm text-[#F5F0E5]">Invite an organization member</h2>
                  <p className="text-xs text-[#A7A39A]">A single-use token is created for the selected email. Copy it to the invited person through a trusted channel; this app does not send invitation email.</p>
                  <form onSubmit={event => void handleCreateInvite(event)} className="grid sm:grid-cols-3 gap-3">
                    <input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} className="sm:col-span-2 px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="person@example.com" />
                    <select value={inviteRole} onChange={event => setInviteRole(event.target.value as Exclude<UserRole, 'administrator'>)} className="px-3 py-2 bg-[#090909] border border-[#222222] rounded text-xs text-[#F5F0E5]">
                      <option value="viewer">Viewer</option><option value="inspector">Inspector</option><option value="structural_engineer">Structural engineer</option>
                    </select>
                    <button type="submit" disabled={inviteBusy} className="sm:col-span-3 px-4 py-2 bg-[#E5C77B] disabled:opacity-50 text-xs font-semibold text-[#090909] rounded">{inviteBusy ? 'Creating invitation…' : 'Create invitation token'}</button>
                  </form>
                  {inviteError && <p role="alert" className="text-xs text-red-300">{inviteError}</p>}
                  {generatedInvite && <label className="block text-xs text-[#A7A39A]">Share this token with {inviteEmail} (expires in 7 days)
                    <textarea readOnly rows={3} value={generatedInvite} className="mt-2 w-full p-3 bg-[#090909] border border-[#222222] rounded text-xs text-[#E5C77B] font-mono" />
                  </label>}
                </section>
              )}
              <section className="p-6 bg-[#191919] border border-[#222222] rounded space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-sm text-[#F5F0E5]">Task notifications</h2>
                    <p className="mt-1 text-xs text-[#A7A39A]">Browser notifications work only while the app is open. In-app due reminders are always available.</p>
                  </div>
                  <button onClick={() => void requestBrowserNotifications()} disabled={browserNotificationPermission === 'unsupported'} className="px-3 py-2 bg-[#222222] disabled:opacity-50 text-xs text-[#E5C77B] rounded">
                    {browserNotificationPermission === 'granted' ? 'Notifications enabled' : browserNotificationPermission === 'denied' ? 'Blocked in browser' : browserNotificationPermission === 'unsupported' ? 'Not supported' : 'Enable browser notifications'}
                  </button>
                </div>
              </section>
              <section className="p-6 bg-[#191919] border border-[#222222] rounded space-y-4">
                <div>
                  <h2 className="font-bold text-sm text-[#F5F0E5]">Reusable inspection checklists</h2>
                  <p className="mt-1 text-xs text-[#A7A39A]">Templates are stored in this browser and included in new local inspection records.</p>
                </div>
                <div className="space-y-2">
                  {checklistTemplates.map(template => (
                    <div key={template.id} className="flex items-center justify-between gap-3 p-3 bg-[#090909] rounded">
                      <div><p className="text-xs font-medium text-[#F5F0E5]">{template.name}</p><p className="text-[10px] text-[#A7A39A]">{template.component} · {template.items.length} items</p></div>
                      <button onClick={() => handleDeleteChecklist(template)} disabled={checklistTemplates.length <= 1} aria-label={`Delete ${template.name}`} className="p-2 text-red-300 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddChecklist} className="space-y-3 border-t border-[#222222] pt-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input required value={checklistNameInput} onChange={event => setChecklistNameInput(event.target.value)} className="px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder="Template name" />
                    <select value={checklistComponentInput} onChange={event => setChecklistComponentInput(event.target.value)} className="px-3 py-2 bg-[#090909] border border-[#222222] rounded text-xs text-[#F5F0E5]">
                      {['All', 'Walls', 'Columns', 'Beams', 'Ceilings', 'Pillars', 'Floors', 'Foundations', 'Other'].map(component => <option key={component}>{component}</option>)}
                    </select>
                  </div>
                  <textarea required rows={4} value={checklistItemsInput} onChange={event => setChecklistItemsInput(event.target.value)} className="w-full px-3 py-2 bg-[#090909] border border-[#222222] rounded text-sm text-[#F5F0E5]" placeholder={'One checklist item per line'} />
                   {checklistError && <p role="alert" className="text-xs text-red-300">{checklistError}</p>}
                  <button type="submit" className="px-4 py-2 bg-[#222222] text-xs text-[#E5C77B] rounded">Save checklist template</button>
                </form>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}