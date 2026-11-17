import type {
  BuildingCategory,
  BuildingStatus,
  RankMode,
  SpatialQueryCriteria,
  TelemetryFocus
} from './criteria';
import type { DefectGroup } from './defects';
import { findLandmark } from './landmarks';

export interface ParseOutcome {
  criteria: SpatialQueryCriteria;
  /** Interpretation notes surfaced in the UI so the parse is never a black box. */
  notes: string[];
}

const REGION_TOKENS = ['nsw', 'vic', 'qld', 'wa', 'sa', 'act', 'tas', 'nt'];
const MONTH_IN_DAYS = 30.44;

const CATEGORY_RULES: Array<{ category: BuildingCategory; patterns: RegExp[] }> = [
  {
    category: 'Industrial',
    patterns: [/industrial/, /warehouse/, /logistics/, /distribution/, /\bdepots?\b/, /\bhubs?\b/]
  },
  {
    category: 'Institutional',
    patterns: [/institutional/, /school/, /campus/, /universit/, /hospital/, /education/, /aged\s*care/]
  },
  {
    category: 'Commercial',
    patterns: [/commercial/, /office/, /\btowers?\b/, /retail/, /workplace/]
  },
  {
    category: 'Residential',
    patterns: [/residential/, /apartments?/, /residences/, /strata/, /class\s*2\b/]
  }
];

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function parseRegion(query: string): { region?: string; notes: string[] } {
  const match = REGION_TOKENS.find(token => new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(query));
  if (!match) return { notes: [] };
  return { region: match.toUpperCase(), notes: [] };
}

function parseCategory(query: string): BuildingCategory | undefined {
  return CATEGORY_RULES.find(rule => rule.patterns.some(pattern => pattern.test(query)))?.category;
}

function parseBcaClass(query: string): string | undefined {
  const match = query.match(/class\s*([0-9]{1,2}[a-z]?)/);
  return match ? `Class ${match[1].toUpperCase()}` : undefined;
}

function parseFloors(query: string): number | undefined {
  const exclusive = query.match(/(?:more than|over|greater than|above)\s*(\d+)\s*(?:floors?|storeys?|stories|levels)/);
  if (exclusive) return Number.parseInt(exclusive[1], 10) + 1;

  const inclusive = query.match(/(?:at least|minimum(?: of)?|from)\s*(\d+)\s*(?:floors?|storeys?|stories|levels)/);
  if (inclusive) return Number.parseInt(inclusive[1], 10);

  const shorthand = query.match(/(\d+)\s*\+\s*(?:floors?|storeys?|stories|levels)/);
  return shorthand ? Number.parseInt(shorthand[1], 10) : undefined;
}

function parseStatuses(query: string): BuildingStatus[] {
  const statuses: BuildingStatus[] = [];
  if (/inspection recommended/.test(query)) pushUnique(statuses, 'Inspection Recommended');
  if (/\burgent\b/.test(query)) pushUnique(statuses, 'Urgent Assessment');
  if (/high concern/.test(query)) pushUnique(statuses, 'Inspection Recommended');
  if (/monitoring required/.test(query)) pushUnique(statuses, 'Monitoring Required');
  if (/low concern/.test(query)) pushUnique(statuses, 'Low Concern');
  if (/attention required|needs review|flagged/.test(query)) {
    pushUnique(statuses, 'Inspection Recommended');
    pushUnique(statuses, 'Urgent Assessment');
  }
  return statuses;
}

function parseDefectGroups(query: string): DefectGroup[] {
  const groups: DefectGroup[] = [];
  const tiltOnly = /tilt|displacement/.test(query) && !/crack|fissure/.test(query);

  if (/(?:shear|diagonal)[^.]{0,24}(?:crack|fissur)/.test(query)
    || /(?:crack|fissur)[^.]{0,24}shear/.test(query)) {
    pushUnique(groups, 'shear_crack');
  }
  if (/micro-?fissur|hairline/.test(query)) pushUnique(groups, 'micro_fissure');
  if (/\bcracks?\b|\bcracking\b|fissur/.test(query)) pushUnique(groups, 'crack');
  if (/\bmoisture\b|seepage|water\s+ingress|\bingress\b/.test(query)) pushUnique(groups, 'moisture');
  if (/efflorescence/.test(query)) pushUnique(groups, 'efflorescence');
  if (/corrosion|rebar|rust|oxidation/.test(query)) pushUnique(groups, 'corrosion');
  if (!tiltOnly && /settlement|expansion\s+joint/.test(query)) pushUnique(groups, 'settlement');
  if (/spalling|delamination/.test(query)) pushUnique(groups, 'spalling');

  // A specific crack clause ("diagonal shear cracks") should not be widened by
  // the generic "crack" group detected from the same sentence.
  if (groups.includes('shear_crack') || groups.includes('micro_fissure')) {
    return groups.filter(group => group !== 'crack');
  }
  return groups;
}

function parseTelemetry(query: string): { focus?: TelemetryFocus; severity: 'warning' | 'critical' } {
  const mentionsTelemetry = /\biot\b|telemetry|sensor|sensors|vibration|seismic|tremor|microstrain|\bstrain\b|\btilt\b|displacement|accelerat/.test(query);
  if (!mentionsTelemetry) return { severity: 'warning' };

  let focus: TelemetryFocus = 'any';
  if (/microstrain|\bstrain\b/.test(query)) focus = 'strain';
  else if (/\btilt\b|displacement|foundation/.test(query)) focus = 'tilt';
  else if (/vibration|seismic|tremor|accelerat/.test(query)) focus = 'vibration';
  else if (/\bmoisture\b|ingress/.test(query)) focus = 'moisture';

  const severity = /critical|breach|exceed|spike|threshold|alarm/.test(query) ? 'critical' : 'warning';
  return { focus, severity };
}

function parseFindingsWindow(query: string): number | undefined {
  const months = query.match(/(?:last|past|within the last)\s*(\d+)\s*(?:months?|mo)\b/);
  if (months) return Math.round(Number.parseInt(months[1], 10) * MONTH_IN_DAYS);

  const days = query.match(/(?:last|past|within the last)\s*(\d+)\s*(?:days?|weeks?)\b/);
  if (!days) return undefined;
  const value = Number.parseInt(days[1], 10);
  return /week/.test(days[0]) ? value * 7 : value;
}

function parseHealth(query: string): { below?: number; above?: number } {
  const below = query.match(/health(?:\s*index)?\s*(?:<|under|below|less than|lower than)\s*(\d+(?:\.\d+)?)/);
  const above = query.match(/health(?:\s*index)?\s*(?:>|over|above|greater than)\s*(\d+(?:\.\d+)?)/);
  return {
    below: below ? Number.parseFloat(below[1]) : undefined,
    above: above ? Number.parseFloat(above[1]) : undefined
  };
}

function parseRank(query: string): RankMode {
  if (/rank|sort|order/.test(query) && /health/.test(query)) return 'health_asc';
  if (/health\s*index|healthiest|worst health/.test(query)) return 'health_asc';
  if (/nearest|closest|distance/.test(query)) return 'distance_asc';
  return 'health_asc';
}

function describeProximity(radiusKm: number, landmarkLabel: string, isDefault: boolean): string {
  const suffix = isDefault ? ' (default anchor radius)' : '';
  return `within ${radiusKm} km of ${landmarkLabel}${suffix}`;
}

export function parseSpatialQuery(rawQuery: string): ParseOutcome {
  const query = rawQuery.toLowerCase().replace(/\s+/g, ' ').trim();
  const notes: string[] = [];
  const clauses: string[] = [];

  const landmark = findLandmark(query);
  const regionResult = parseRegion(query);
  const explicitRadius = query.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometres?|kilometers?)/);
  const statedRadius = explicitRadius ? Number.parseFloat(explicitRadius[1]) : undefined;

  const region = regionResult.region ?? (landmark?.kind === 'region' ? landmark.region : undefined);
  const isRegionLandmark = landmark?.kind === 'region';
  const radiusKm = isRegionLandmark ? undefined : statedRadius ?? landmark?.defaultRadiusKm;
  const radiusIsDefault = Boolean(radiusKm && statedRadius === undefined);

  if (landmark && !isRegionLandmark) {
    notes.push(`Anchor resolved to ${landmark.label} (${landmark.lat}, ${landmark.lng}).`);
    if (radiusIsDefault) notes.push(`No distance given, so ${radiusKm} km anchor radius was applied.`);
    if (radiusKm) clauses.push(describeProximity(radiusKm, landmark.label, radiusIsDefault));
  } else if (region) {
    notes.push(`Region filter applied for ${region}.`);
    clauses.push(`state = ${region}`);
  } else if (statedRadius !== undefined) {
    notes.push('A distance was given without a recognised landmark, so proximity was not applied.');
  }

  const category = parseCategory(query);
  if (category) {
    clauses.push(`category = ${category}`);
    if (/high-?rise/.test(query)) notes.push('High-rise interpreted as at least 8 storeys.');
  }

  const bcaClass = parseBcaClass(query);
  if (bcaClass) {
    clauses.push(`BCA ${bcaClass} (derived from category in demo data)`);
  }

  const highRiseOnly = /high-?rise/.test(query);
  const minFloors = parseFloors(query);
  if (highRiseOnly && !minFloors) clauses.push('at least 8 storeys');
  if (minFloors) clauses.push(`at least ${minFloors} storeys`);

  const health = parseHealth(query);
  if (health.below !== undefined) clauses.push(`health index < ${health.below}%`);
  if (health.above !== undefined) clauses.push(`health index > ${health.above}%`);

  const statuses = parseStatuses(query);
  if (statuses.length > 0) clauses.push(`status in ${statuses.join(' / ')}`);

  const defectGroups = parseDefectGroups(query);
  const unresolvedOnly = /unresolved|unrepaired|outstanding/.test(query);
  if (defectGroups.length > 0) clauses.push(`defects: ${defectGroups.join(', ')}`);
  if (unresolvedOnly) clauses.push('unresolved findings only');

  const findingsWithinDays = parseFindingsWindow(query);
  if (findingsWithinDays) clauses.push(`findings recorded in the last ${Math.round(findingsWithinDays / MONTH_IN_DAYS)} months`);

  const telemetry = parseTelemetry(query);
  if (telemetry.focus) {
    clauses.push(`telemetry ${telemetry.focus} at ${telemetry.severity} threshold`);
  }

  const rankBy = parseRank(query);
  if (rankBy === 'health_asc') clauses.push('ordered by health index ascending');

  return {
    criteria: {
      landmark,
      radiusKm,
      radiusIsDefault,
      region,
      category,
      bcaClass,
      minFloors,
      highRiseOnly,
      healthBelow: health.below,
      healthAbove: health.above,
      statuses,
      defectGroups,
      unresolvedOnly,
      findingsWithinDays,
      telemetryFocus: telemetry.focus,
      telemetrySeverity: telemetry.severity,
      rankBy,
      clauses
    },
    notes
  };
}
