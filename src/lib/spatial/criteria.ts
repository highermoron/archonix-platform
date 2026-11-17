import type { DefectGroup } from './defects';
import type { Landmark } from './landmarks';

export type BuildingCategory = 'Residential' | 'Commercial' | 'Industrial' | 'Institutional' | 'Other';

export type BuildingStatus =
  | 'Low Concern'
  | 'Inspection Recommended'
  | 'Monitoring Required'
  | 'Urgent Assessment';

export type TelemetryFocus = 'any' | 'vibration' | 'tilt' | 'strain' | 'moisture';

export type RankMode = 'health_asc' | 'distance_asc' | 'name';

/** Minimum storeys treated as a high-rise when a query says "high-rise". */
export const HIGH_RISE_MIN_FLOORS = 8;

export const DEFAULT_FINDINGS_WINDOW_DAYS = 182;

export interface SpatialBuilding {
  id: string;
  name: string;
  location: string;
  type: string;
  status: BuildingStatus;
  healthIndex?: number;
  lastScanDate: string;
  lat?: number;
  lng?: number;
  floors?: number;
  year?: number;
  description?: string;
  incidentNote?: string;
  bcaClass?: string;
}

export interface SpatialQueryCriteria {
  landmark: Landmark | null;
  radiusKm?: number;
  /** True when the proximity radius came from the landmark, not the prompt. */
  radiusIsDefault: boolean;
  region?: string;
  category?: BuildingCategory;
  bcaClass?: string;
  minFloors?: number;
  highRiseOnly: boolean;
  healthBelow?: number;
  healthAbove?: number;
  statuses: BuildingStatus[];
  defectGroups: DefectGroup[];
  unresolvedOnly: boolean;
  findingsWithinDays?: number;
  telemetryFocus?: TelemetryFocus;
  telemetrySeverity: 'warning' | 'critical';
  rankBy: RankMode;
  /** Human-readable description of every clause that survived parsing. */
  clauses: string[];
}

const DERIVED_BCA_CLASS: Record<BuildingCategory, string> = {
  Residential: 'Class 2',
  Commercial: 'Class 5',
  Industrial: 'Class 7b',
  Institutional: 'Class 9b',
  Other: 'Class 10a'
};

export function categoryOf(building: SpatialBuilding): BuildingCategory {
  const value = building.type.toLowerCase();
  if (value.includes('residential')) return 'Residential';
  if (value.includes('commercial')) return 'Commercial';
  if (value.includes('industrial')) return 'Industrial';
  if (value.includes('institutional')) return 'Institutional';
  return 'Other';
}

/**
 * The demo portfolio does not store a BCA classification, so it is derived from
 * the asset category. Queries and SQL label it as derived, never as recorded data.
 */
export function bcaClassOf(building: SpatialBuilding): string {
  if (building.bcaClass) return building.bcaClass;
  return DERIVED_BCA_CLASS[categoryOf(building)];
}

export function effectiveFloorsThreshold(criteria: SpatialQueryCriteria): number | undefined {
  if (criteria.minFloors) return criteria.minFloors;
  return criteria.highRiseOnly ? HIGH_RISE_MIN_FLOORS : undefined;
}

export function hasAnyCriterion(criteria: SpatialQueryCriteria): boolean {
  return Boolean(
    criteria.radiusKm
    || criteria.region
    || criteria.category
    || criteria.bcaClass
    || effectiveFloorsThreshold(criteria)
    || criteria.healthBelow !== undefined
    || criteria.healthAbove !== undefined
    || criteria.statuses.length > 0
    || criteria.defectGroups.length > 0
    || criteria.findingsWithinDays
    || criteria.telemetryFocus
  );
}
