import type { BuildingTelemetry } from '../types/telemetry';
import type { SpatialBuilding, SpatialQueryCriteria } from './spatial/criteria';
import { effectiveFloorsThreshold } from './spatial/criteria';
import type { StructuralFinding } from './spatial/defects';
import { describeDefectGroups } from './spatial/defects';
import { matchBuildings } from './spatial/matcher';
import type { SpatialMatch, SpatialNearMiss } from './spatial/matcher';
import { parseSpatialQuery } from './spatial/queryParser';
import { generatePostGisSql } from './spatial/sqlGenerator';
import { buildHints, buildSummary } from './spatial/summary';

export type { SpatialMatch, SpatialNearMiss } from './spatial/matcher';
export type { SpatialBuilding } from './spatial/criteria';
export type { StructuralFinding, DefectCode, FindingSeverity } from './spatial/defects';

export interface SpatialAIResult {
  query: string;
  matchedBuildingIds: string[];
  matches: SpatialMatch[];
  nearMisses: SpatialNearMiss[];
  postGisSql: string;
  summary: string;
  hints: string[];
  /** Human-readable clauses that were actually applied. */
  appliedClauses: string[];
  /** Notes about how ambiguous wording was interpreted. */
  interpretationNotes: string[];
  suggestedCenter?: [number, number];
  suggestedZoom?: number;
  executionTimeMs: number;
  evaluated: number;
  extractedParameters: {
    intent: string;
    targetLocation?: string;
    radiusKm?: number;
    buildingType?: string;
    defectFilter?: string;
    telemetryAlertOnly?: boolean;
    minFloors?: number;
    healthFilter?: string;
    region?: string;
    bcaClass?: string;
    findingsWithinDays?: number;
    telemetryFocus?: string;
    rankBy?: string;
  };
}

const RADIUS_CLOSE_ZOOM = 11;
const RADIUS_WIDE_ZOOM = 5;
const SINGLE_MATCH_ZOOM = 14;

function suggestedView(
  matches: SpatialMatch[],
  criteria: SpatialQueryCriteria,
  buildingsById: Map<string, SpatialBuilding>
): { center?: [number, number]; zoom?: number } {
  const coords = matches
    .map(match => buildingsById.get(match.buildingId))
    .filter((building): building is SpatialBuilding =>
      Boolean(building) && typeof building?.lat === 'number' && typeof building?.lng === 'number')
    .map(building => [building.lat as number, building.lng as number] as [number, number]);

  if (coords.length === 1) {
    return { center: coords[0], zoom: SINGLE_MATCH_ZOOM };
  }

  if (coords.length > 1) {
    const avgLat = coords.reduce((sum, point) => sum + point[0], 0) / coords.length;
    const avgLng = coords.reduce((sum, point) => sum + point[1], 0) / coords.length;
    return { center: [avgLat, avgLng], zoom: undefined };
  }

  if (criteria.landmark && criteria.landmark.kind !== 'region') {
    const zoom = (criteria.radiusKm ?? criteria.landmark.defaultRadiusKm) <= 35
      ? RADIUS_CLOSE_ZOOM
      : RADIUS_WIDE_ZOOM;
    return { center: [criteria.landmark.lat, criteria.landmark.lng], zoom };
  }

  return {};
}

function healthFilterLabel(criteria: SpatialQueryCriteria): string | undefined {
  if (criteria.healthBelow !== undefined) return `< ${criteria.healthBelow}%`;
  if (criteria.healthAbove !== undefined) return `> ${criteria.healthAbove}%`;
  return undefined;
}

/**
 * Converts a natural-language question into a deterministic spatial query over
 * the plotted portfolio, with the equivalent read-only PostGIS statement
 * attached for auditability.
 */
export async function processSpatialAIQuery(
  rawQuery: string,
  buildings: SpatialBuilding[],
  findings: StructuralFinding[],
  telemetryData?: Record<string, BuildingTelemetry>
): Promise<SpatialAIResult> {
  const startedAt = performance.now();
  const { criteria, notes } = parseSpatialQuery(rawQuery);
  const outcome = matchBuildings(buildings, criteria, findings, telemetryData);
  const buildingsById = new Map(buildings.map(building => [building.id, building]));
  const view = suggestedView(outcome.matches, criteria, buildingsById);

  const executionTimeMs = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    query: rawQuery,
    matchedBuildingIds: outcome.matches.map(match => match.buildingId),
    matches: outcome.matches,
    nearMisses: outcome.nearMisses,
    postGisSql: generatePostGisSql(criteria, rawQuery),
    summary: buildSummary(criteria, outcome),
    hints: buildHints(criteria, outcome),
    appliedClauses: criteria.clauses,
    interpretationNotes: notes,
    suggestedCenter: view.center,
    suggestedZoom: view.zoom,
    executionTimeMs,
    evaluated: outcome.evaluated,
    extractedParameters: {
      intent: 'spatial_filter_and_focus',
      targetLocation: criteria.landmark?.label ?? criteria.region,
      radiusKm: criteria.radiusKm,
      buildingType: criteria.category,
      defectFilter: criteria.defectGroups.length > 0 ? describeDefectGroups(criteria.defectGroups) : undefined,
      telemetryAlertOnly: Boolean(criteria.telemetryFocus),
      minFloors: effectiveFloorsThreshold(criteria),
      healthFilter: healthFilterLabel(criteria),
      region: criteria.region,
      bcaClass: criteria.bcaClass,
      findingsWithinDays: criteria.findingsWithinDays,
      telemetryFocus: criteria.telemetryFocus,
      rankBy: criteria.rankBy
    }
  };
}
