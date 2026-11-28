import type { BuildingTelemetry } from '../types/telemetry';
import type { SpatialBuilding, SpatialQueryCriteria } from './spatial/criteria';
import { bcaClassOf, categoryOf, effectiveFloorsThreshold } from './spatial/criteria';
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

interface GeminiSpatialResponse {
  matchedBuildingIds?: string[];
  summary?: string;
  hints?: string[];
  appliedClauses?: string[];
  intent?: string;
}

async function queryGeminiSpatialAI(
  rawQuery: string,
  buildings: SpatialBuilding[],
  findings: StructuralFinding[],
  telemetryData?: Record<string, BuildingTelemetry>
): Promise<GeminiSpatialResponse | null> {
  try {
    const telemetrySummary: Record<string, { overallStatus?: string; activeAlert?: { title?: string; severity?: string } }> = {};
    if (telemetryData) {
      for (const [id, t] of Object.entries(telemetryData)) {
        telemetrySummary[id] = {
          overallStatus: t.overallStatus,
          activeAlert: t.activeAlert ? { title: t.activeAlert.title, severity: t.activeAlert.severity } : undefined,
        };
      }
    }

    const response = await fetch('/api/spatial-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: rawQuery,
        buildings: buildings.map((b) => ({
          id: b.id,
          name: b.name,
          location: b.location,
          type: b.type,
          status: b.status,
          healthIndex: b.healthIndex,
          floors: b.floors,
          year: b.year,
          lat: b.lat,
          lng: b.lng,
          incidentNote: b.incidentNote,
        })),
        findings: findings.map((f) => ({
          buildingId: f.buildingId,
          component: f.location || f.label,
          concernLevel: f.severity,
          summary: `${f.label}: ${f.note}`,
          observations: [f.note],
        })),
        telemetry: telemetrySummary,
      }),
    });

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;

    return (await response.json()) as GeminiSpatialResponse;
  } catch {
    return null;
  }
}

/**
 * Converts a natural-language question into a spatial query over the plotted
 * portfolio. Uses Gemini (/api/spatial-ai) when available and falls back
 * seamlessly to the local deterministic spatial engine.
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

  const gemini = await queryGeminiSpatialAI(rawQuery, buildings, findings, telemetryData);

  let finalMatches = outcome.matches;
  let finalSummary = buildSummary(criteria, outcome);
  let finalHints = buildHints(criteria, outcome);
  let finalClauses = criteria.clauses;
  let finalIntent = 'spatial_filter_and_focus';
  const finalNotes = [...notes];

  if (gemini && gemini.summary) {
    finalSummary = gemini.summary;
    if (gemini.hints && gemini.hints.length > 0) finalHints = gemini.hints;
    if (gemini.appliedClauses && gemini.appliedClauses.length > 0) {
      finalClauses = ['Gemini 2.5 Flash', ...gemini.appliedClauses];
    } else {
      finalClauses = ['Gemini 2.5 Flash', ...finalClauses];
    }
    if (gemini.intent) finalIntent = gemini.intent;

    if (gemini.matchedBuildingIds && gemini.matchedBuildingIds.length > 0) {
      const localById = new Map(outcome.matches.map((m) => [m.buildingId, m]));
      finalMatches = gemini.matchedBuildingIds
        .map((id): SpatialMatch | null => {
          const existing = localById.get(id);
          if (existing) return existing;
          const bld = buildingsById.get(id);
          if (!bld) return null;
          return {
            buildingId: bld.id,
            name: bld.name,
            location: bld.location,
            category: categoryOf(bld),
            bcaClass: bcaClassOf(bld),
            status: bld.status || 'Low Concern',
            healthIndex: bld.healthIndex,
            floors: bld.floors,
            defects: [],
            reasons: ['Selected by Gemini Spatial AI'],
          };
        })
        .filter((m): m is SpatialMatch => Boolean(m));
    }
  }

  const view = suggestedView(finalMatches, criteria, buildingsById);
  const executionTimeMs = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    query: rawQuery,
    matchedBuildingIds: finalMatches.map(match => match.buildingId),
    matches: finalMatches,
    nearMisses: outcome.nearMisses,
    postGisSql: generatePostGisSql(criteria, rawQuery),
    summary: finalSummary,
    hints: finalHints,
    appliedClauses: finalClauses,
    interpretationNotes: finalNotes,
    suggestedCenter: view.center,
    suggestedZoom: view.zoom,
    executionTimeMs,
    evaluated: outcome.evaluated,
    extractedParameters: {
      intent: finalIntent,
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
