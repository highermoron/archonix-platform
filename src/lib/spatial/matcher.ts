import type { BuildingTelemetry, SensorReading, TelemetryStatus } from '../../types/telemetry';
import { bcaClassOf, categoryOf, effectiveFloorsThreshold } from './criteria';
import type { SpatialBuilding, SpatialQueryCriteria } from './criteria';
import { indexFindingsByBuilding, matchesDefectGroups } from './defects';
import type { DefectCode, FindingSeverity, StructuralFinding } from './defects';
import { haversineDistanceKm } from './landmarks';

export interface MatchedDefect {
  code: DefectCode;
  label: string;
  severity: FindingSeverity;
  location: string;
  note: string;
  detectedAt: string | null;
  isResolved: boolean;
}

export interface SpatialMatch {
  buildingId: string;
  name: string;
  location: string;
  category: string;
  bcaClass: string;
  status: string;
  healthIndex?: number;
  floors?: number;
  distanceKm?: number;
  defects: MatchedDefect[];
  primaryDefect?: MatchedDefect;
  telemetryHeadline?: string;
  reasons: string[];
}

export interface SpatialNearMiss {
  buildingId: string;
  name: string;
  distanceKm: number;
  radiusKm: number;
  exceededByKm: number;
}

export interface MatchOutcome {
  matches: SpatialMatch[];
  nearMisses: SpatialNearMiss[];
  evaluated: number;
  /** How many buildings each criterion excluded, used to explain empty results. */
  blockedBy: Record<string, number>;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3
};

const TELEMETRY_RANK: Record<TelemetryStatus, number> = {
  normal: 0,
  warning: 1,
  critical: 2
};

interface SensorFocus {
  key: keyof BuildingTelemetry['sensors'];
  label: string;
}

const FOCUS_SENSOR: Record<'any' | 'vibration' | 'tilt' | 'strain' | 'moisture', SensorFocus | null> = {
  any: null,
  vibration: { key: 'accelerometer', label: 'Accelerometer' },
  tilt: { key: 'tiltmeter', label: 'Foundation tiltmeter' },
  strain: { key: 'strain_gauge', label: 'Column strain gauge' },
  moisture: { key: 'moisture', label: 'Basement piezometer' }
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function matchesRegion(building: SpatialBuilding, region: string): boolean {
  return new RegExp(`(^|[^a-z])${region.toLowerCase()}([^a-z]|$)`).test(building.location.toLowerCase());
}

function withinWindow(finding: StructuralFinding, days: number, now: number): boolean {
  if (!finding.detectedAt) return false;
  const detected = new Date(finding.detectedAt).getTime();
  if (Number.isNaN(detected)) return false;
  return now - detected <= days * DAY_IN_MS;
}

function toMatchedDefect(finding: StructuralFinding): MatchedDefect {
  return {
    code: finding.defectCode,
    label: finding.label,
    severity: finding.severity,
    location: finding.location,
    note: finding.note,
    detectedAt: finding.detectedAt,
    isResolved: finding.isResolved
  };
}

function pickPrimary(defects: MatchedDefect[]): MatchedDefect | undefined {
  return [...defects].sort((left, right) => {
    if (left.isResolved !== right.isResolved) return left.isResolved ? 1 : -1;
    return SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  })[0];
}

function describeSensor(reading: SensorReading, label: string): string {
  return `${label} ${reading.value}${reading.unit} · ${reading.status}`;
}

export function matchBuildings(
  buildings: SpatialBuilding[],
  criteria: SpatialQueryCriteria,
  findings: StructuralFinding[],
  telemetry: Record<string, BuildingTelemetry> | undefined,
  now: number = Date.now()
): MatchOutcome {
  const findingsByBuilding = indexFindingsByBuilding(findings);
  const matches: SpatialMatch[] = [];
  const nearMisses: SpatialNearMiss[] = [];
  const blockedBy: Record<string, number> = {};
  const floorsThreshold = effectiveFloorsThreshold(criteria);

  buildings.forEach(building => {
    const failures: string[] = [];
    const reasons: string[] = [];
    let distanceKm: number | undefined;

    if (criteria.region && !matchesRegion(building, criteria.region)) failures.push('state');

    if (criteria.landmark && criteria.radiusKm) {
      if (typeof building.lat !== 'number' || typeof building.lng !== 'number') {
        failures.push('distance');
      } else {
        distanceKm = haversineDistanceKm(
          criteria.landmark.lat,
          criteria.landmark.lng,
          building.lat,
          building.lng
        );
        if (distanceKm > criteria.radiusKm) failures.push('distance');
        else reasons.push(`${distanceKm.toFixed(1)} km from ${criteria.landmark.label}`);
      }
    }

    if (criteria.category && categoryOf(building) !== criteria.category) failures.push('category');
    if (criteria.bcaClass && bcaClassOf(building).toLowerCase() !== criteria.bcaClass.toLowerCase()) {
      failures.push('bca_class');
    }
    if (floorsThreshold && (building.floors ?? 0) < floorsThreshold) failures.push('floors');
    if (criteria.healthBelow !== undefined && (building.healthIndex ?? 100) >= criteria.healthBelow) {
      failures.push('health');
    }
    if (criteria.healthAbove !== undefined && (building.healthIndex ?? 0) <= criteria.healthAbove) {
      failures.push('health');
    }
    if (criteria.statuses.length > 0 && !criteria.statuses.includes(building.status)) failures.push('status');

    const buildingFindings = findingsByBuilding.get(building.id) ?? [];
    let relevant = criteria.defectGroups.length > 0
      ? buildingFindings.filter(finding => matchesDefectGroups(finding, criteria.defectGroups))
      : buildingFindings;

    if (criteria.unresolvedOnly) relevant = relevant.filter(finding => !finding.isResolved);

    if (criteria.findingsWithinDays) {
      const recent = relevant.filter(finding => withinWindow(finding, criteria.findingsWithinDays as number, now));
      if (recent.length === 0) failures.push('recency');
      else relevant = recent;
    }

    const needsFindings = criteria.defectGroups.length > 0 || criteria.unresolvedOnly;
    if (needsFindings && relevant.length === 0) failures.push('defects');

    let telemetryHeadline: string | undefined;
    if (criteria.telemetryFocus && telemetry) {
      const reading = telemetry[building.id];
      const focus = FOCUS_SENSOR[criteria.telemetryFocus];
      const threshold = TELEMETRY_RANK[criteria.telemetrySeverity];
      if (!reading) {
        failures.push('telemetry');
      } else if (focus) {
        const sensor = reading.sensors[focus.key];
        if (TELEMETRY_RANK[sensor.status] < threshold) failures.push('telemetry');
        else telemetryHeadline = describeSensor(sensor, focus.label);
      } else if (TELEMETRY_RANK[reading.overallStatus] < threshold) {
        failures.push('telemetry');
      } else {
        telemetryHeadline = reading.activeAlert
          ? `${reading.activeAlert.title} · ${reading.activeAlert.peakMetric}`
          : `All sensors ${reading.overallStatus}`;
      }
    }

    if (failures.length === 1 && failures[0] === 'distance'
      && distanceKm !== undefined && criteria.radiusKm) {
      nearMisses.push({
        buildingId: building.id,
        name: building.name,
        distanceKm,
        radiusKm: criteria.radiusKm,
        exceededByKm: distanceKm - criteria.radiusKm
      });
    }

    if (failures.length > 0) {
      failures.forEach(key => {
        blockedBy[key] = (blockedBy[key] ?? 0) + 1;
      });
      return;
    }

    if (criteria.category) reasons.push(categoryOf(building));
    if (criteria.bcaClass) reasons.push(`${bcaClassOf(building)} (derived)`);
    if (floorsThreshold) reasons.push(`${building.floors ?? 0} storeys`);
    if (building.healthIndex !== undefined) reasons.push(`health ${building.healthIndex}%`);
    reasons.push(building.status);

    const defects = relevant
      .slice()
      .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])
      .map(toMatchedDefect)
      .filter((defect, index, list) => list.findIndex(item => item.code === defect.code) === index);

    if (defects.length > 0) {
      reasons.push(`${defects.length} recorded finding${defects.length === 1 ? '' : 's'}`);
    }

    matches.push({
      buildingId: building.id,
      name: building.name,
      location: building.location,
      category: categoryOf(building),
      bcaClass: bcaClassOf(building),
      status: building.status,
      healthIndex: building.healthIndex,
      floors: building.floors,
      distanceKm,
      defects,
      primaryDefect: pickPrimary(defects),
      telemetryHeadline,
      reasons
    });
  });

  const sorted = matches.sort((left, right) => {
    if (criteria.rankBy === 'distance_asc') {
      if (left.distanceKm === undefined) return 1;
      if (right.distanceKm === undefined) return -1;
      return left.distanceKm - right.distanceKm;
    }
    if (criteria.rankBy === 'name') return left.name.localeCompare(right.name);
    const leftHealth = left.healthIndex ?? Number.MAX_SAFE_INTEGER;
    const rightHealth = right.healthIndex ?? Number.MAX_SAFE_INTEGER;
    return leftHealth - rightHealth;
  });

  return {
    matches: sorted,
    nearMisses: nearMisses.sort((left, right) => left.exceededByKm - right.exceededByKm),
    evaluated: buildings.length,
    blockedBy
  };
}
