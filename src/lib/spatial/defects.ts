export type DefectGroup =
  | 'crack'
  | 'shear_crack'
  | 'micro_fissure'
  | 'moisture'
  | 'efflorescence'
  | 'corrosion'
  | 'settlement'
  | 'spalling';

export type FindingSeverity = 'low' | 'moderate' | 'high' | 'critical';

export type DefectCode =
  | 'CRACK_SHEAR'
  | 'CRACK_MICRO_FISSURE'
  | 'CRACK_SHRINKAGE'
  | 'CRACK_SURFACE'
  | 'MOISTURE_INGRESS'
  | 'EFFLORESCENCE'
  | 'REBAR_CORROSION'
  | 'JOINT_SETTLEMENT'
  | 'SPALLING';

export interface StructuralFinding {
  id: string;
  buildingId: string;
  defectCode: DefectCode;
  label: string;
  group: DefectGroup;
  severity: FindingSeverity;
  isResolved: boolean;
  /** ISO date, or null when the source never recorded one. */
  detectedAt: string | null;
  location: string;
  note: string;
  source: 'record' | 'narrative';
}

interface DefectDefinition {
  code: DefectCode;
  label: string;
  group: DefectGroup;
  patterns: RegExp[];
}

const DEFECT_DEFINITIONS: DefectDefinition[] = [
  {
    code: 'CRACK_SHEAR',
    label: 'Diagonal shear crack',
    group: 'shear_crack',
    patterns: [/shear\s+(?:crack|fissure)/, /diagonal\s+(?:shear\s+)?(?:crack|fissure)/, /shear\s+fissur/]
  },
  {
    code: 'CRACK_MICRO_FISSURE',
    label: 'Micro-fissuring',
    group: 'micro_fissure',
    patterns: [/micro-?fissur/, /hairline/, /micro-?crack/]
  },
  {
    code: 'CRACK_SHRINKAGE',
    label: 'Shrinkage cracking',
    group: 'crack',
    patterns: [/shrinkage\s+crack/, /shrinkage\s+fissur/]
  },
  {
    code: 'MOISTURE_INGRESS',
    label: 'Basement moisture ingress',
    group: 'moisture',
    patterns: [/moisture/, /seepage/, /water\s+ingress/, /ingress/, /hydrostatic/]
  },
  {
    code: 'EFFLORESCENCE',
    label: 'Efflorescence',
    group: 'efflorescence',
    patterns: [/efflorescence/]
  },
  {
    code: 'REBAR_CORROSION',
    label: 'Rebar corrosion',
    group: 'corrosion',
    patterns: [/rebar/, /corrosion/, /oxidation/, /rust/]
  },
  {
    code: 'JOINT_SETTLEMENT',
    label: 'Joint settlement',
    group: 'settlement',
    patterns: [/settlement/, /expansion\s+joint/]
  },
  {
    code: 'SPALLING',
    label: 'Concrete spalling',
    group: 'spalling',
    patterns: [/spalling/, /spall/, /delamination/]
  },
  {
    code: 'CRACK_SURFACE',
    label: 'Surface cracking',
    group: 'crack',
    patterns: [/crack/, /fissure/]
  }
];

export interface FindingSourceBuilding {
  id: string;
  name: string;
  description?: string;
  incidentNote?: string;
  lastScanDate?: string;
  status: string;
}

export interface FindingSourceRecord {
  id: string;
  buildingId: string;
  buildingName: string;
  component: string;
  date: string;
  concernLevel: string;
  crackWidth: string;
  observations: string[];
  reviewStatus?: string;
}

const GROUP_LABELS: Record<DefectGroup, string> = {
  crack: 'cracking',
  shear_crack: 'diagonal shear cracking',
  micro_fissure: 'micro-fissuring',
  moisture: 'moisture ingress',
  efflorescence: 'efflorescence',
  corrosion: 'rebar corrosion',
  settlement: 'joint settlement',
  spalling: 'spalling'
};

export function describeDefectGroups(groups: DefectGroup[]): string {
  if (groups.length === 0) return 'no defect filter';
  return groups.map(group => GROUP_LABELS[group]).join(' or ');
}

/** All defect codes implied by the requested groups, used for SQL generation. */
export function defectCodesForGroups(groups: DefectGroup[]): DefectCode[] {
  if (groups.includes('crack')) {
    const expanded = new Set<DefectCode>();
    DEFECT_DEFINITIONS
      .filter(definition => definition.group === 'crack'
        || definition.code === 'CRACK_SHEAR'
        || definition.code === 'CRACK_MICRO_FISSURE')
      .forEach(definition => expanded.add(definition.code));
    groups.filter(group => group !== 'crack').forEach(group => {
      DEFECT_DEFINITIONS
        .filter(definition => definition.group === group)
        .forEach(definition => expanded.add(definition.code));
    });
    return [...expanded];
  }

  const codes = new Set<DefectCode>();
  groups.forEach(group => {
    DEFECT_DEFINITIONS
      .filter(definition => definition.group === group)
      .forEach(definition => codes.add(definition.code));
    if (group === 'moisture') codes.add('EFFLORESCENCE');
  });
  return [...codes];
}

export function matchesDefectGroups(finding: StructuralFinding, groups: DefectGroup[]): boolean {
  if (groups.length === 0) return true;
  return groups.some(group => {
    if (group === 'crack') return finding.defectCode.startsWith('CRACK_');
    if (group === 'moisture') return finding.group === 'moisture' || finding.group === 'efflorescence';
    return finding.group === group;
  });
}

/** Extracts every defect code described by a block of free text. */
export function detectDefects(text: string): DefectDefinition[] {
  const haystack = text.toLowerCase();
  const found = DEFECT_DEFINITIONS.filter(definition =>
    definition.patterns.some(pattern => pattern.test(haystack))
  );
  const hasSpecificCrack = found.some(definition => definition.code !== 'CRACK_SURFACE');
  return hasSpecificCrack ? found.filter(definition => definition.code !== 'CRACK_SURFACE') : found;
}

export function parseRecordDate(value: string | undefined): string | null {
  if (!value) return null;
  const normalised = value.trim();
  if (!normalised || /^not scanned$/i.test(normalised) || /^unknown$/i.test(normalised)) return null;
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function severityForConcern(concernLevel: string): FindingSeverity {
  if (concernLevel === 'Urgent Professional Assessment') return 'critical';
  if (concernLevel === 'High Concern') return 'high';
  if (concernLevel === 'Moderate Concern') return 'moderate';
  return 'low';
}

function severityForStatus(status: string): FindingSeverity {
  if (status === 'Urgent Assessment') return 'critical';
  if (status === 'Inspection Recommended') return 'high';
  if (status === 'Monitoring Required') return 'moderate';
  return 'low';
}

/**
 * Builds the demo structural-findings index from building narrative fields and
 * saved inspection records. Nothing here is inferred beyond the words already
 * recorded by an inspector or seeded in the demo data.
 */
export function buildStructuralFindings(
  buildings: FindingSourceBuilding[],
  records: FindingSourceRecord[]
): StructuralFinding[] {
  const findings: StructuralFinding[] = [];

  records.forEach(record => {
    const text = [record.observations.join(' '), `crack width ${record.crackWidth}`].join(' ');
    const detectedAt = parseRecordDate(record.date);
    const severity = severityForConcern(record.concernLevel);
    const hasMeasurements = /[1-9]/.test(record.crackWidth);
    const detected = detectDefects(text);

    if (detected.length === 0 && !hasMeasurements) return;

    detected.forEach(definition => {
      findings.push({
        id: `finding-${record.id}-${definition.code}`,
        buildingId: record.buildingId,
        defectCode: definition.code,
        label: definition.label,
        group: definition.group,
        severity,
        isResolved: record.reviewStatus === 'Closed'
          || (severity === 'low' && record.concernLevel === 'Low Concern'),
        detectedAt,
        location: record.component,
        note: record.observations[0] || definition.label,
        source: 'record'
      });
    });
  });

  buildings.forEach(building => {
    const narrative = [building.description, building.incidentNote].filter(Boolean).join(' ');
    const detected = detectDefects(narrative);
    if (detected.length === 0) return;

    const severity = severityForStatus(building.status);
    const detectedAt = parseRecordDate(building.lastScanDate);

    detected.forEach(definition => {
      findings.push({
        id: `finding-${building.id}-${definition.code}`,
        buildingId: building.id,
        defectCode: definition.code,
        label: definition.label,
        group: definition.group,
        severity,
        isResolved: building.status === 'Low Concern' && severity === 'low',
        detectedAt,
        location: 'Recorded incident note',
        note: building.incidentNote || building.description || definition.label,
        source: 'narrative'
      });
    });
  });

  return findings;
}

export function indexFindingsByBuilding(findings: StructuralFinding[]): Map<string, StructuralFinding[]> {
  const index = new Map<string, StructuralFinding[]>();
  findings.forEach(finding => {
    const existing = index.get(finding.buildingId);
    if (existing) existing.push(finding);
    else index.set(finding.buildingId, [finding]);
  });
  return index;
}
