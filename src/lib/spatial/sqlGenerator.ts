import { effectiveFloorsThreshold } from './criteria';
import type { BuildingStatus, SpatialQueryCriteria } from './criteria';
import { defectCodesForGroups } from './defects';

const MONTHS_PER_WINDOW = 30.44;

const STATUS_TO_MONITORING: Record<BuildingStatus, string> = {
  'Low Concern': 'active',
  'Inspection Recommended': 'attention_required',
  'Monitoring Required': 'archived',
  'Urgent Assessment': 'overdue'
};

const SENSOR_COLUMN: Record<'vibration' | 'tilt' | 'strain' | 'moisture', string> = {
  vibration: 'accelerometer',
  tilt: 'tiltmeter',
  strain: 'strain_gauge',
  moisture: 'moisture'
};

function conditionForProximity(criteria: SpatialQueryCriteria): string | null {
  if (!criteria.landmark || !criteria.radiusKm) return null;
  const bufferMetres = Math.round(criteria.radiusKm * 1000);
  return `ST_DWithin(
    ST_MakePoint(b.longitude, b.latitude)::geography,
    ST_MakePoint(${criteria.landmark.lng}, ${criteria.landmark.lat})::geography,
    ${bufferMetres} -- ${criteria.radiusKm} km buffer around ${criteria.landmark.sqlLabel}
  )`;
}

function conditionForClassification(criteria: SpatialQueryCriteria): string | null {
  if (criteria.bcaClass) {
    return `b.building_classification ILIKE '%${criteria.bcaClass}%' -- ${criteria.bcaClass}, derived from asset category in demo data`;
  }
  if (criteria.category) {
    return `b.building_classification ILIKE '%${criteria.category}%'`;
  }
  return null;
}

function conditionForTelemetry(criteria: SpatialQueryCriteria): string | null {
  if (!criteria.telemetryFocus) return null;
  const statusClause = criteria.telemetrySeverity === 'critical'
    ? `st.status = 'critical'`
    : `st.status IN ('warning', 'critical')`;

  if (criteria.telemetryFocus === 'any') {
    return `EXISTS (
    SELECT 1 FROM sensor_telemetry st
    WHERE st.building_id = b.id AND ${statusClause}
  )`;
  }

  const sensor = SENSOR_COLUMN[criteria.telemetryFocus];
  return `EXISTS (
    SELECT 1 FROM sensor_telemetry st
    WHERE st.building_id = b.id
      AND st.sensor_type = '${sensor}'
      AND ${statusClause}
  )`;
}

function orderClause(criteria: SpatialQueryCriteria): string {
  if (criteria.rankBy === 'distance_asc' && criteria.landmark) {
    return `ORDER BY ST_Distance(
    ST_MakePoint(b.longitude, b.latitude)::geography,
    ST_MakePoint(${criteria.landmark.lng}, ${criteria.landmark.lat})::geography
  ) ASC`;
  }
  if (criteria.rankBy === 'name') return 'ORDER BY b.name ASC';
  return 'ORDER BY b.health_index ASC NULLS LAST';
}

/**
 * Renders the read-only PostGIS statement equivalent to the parsed criteria so
 * the natural-language result can be audited line by line.
 */
export function generatePostGisSql(criteria: SpatialQueryCriteria, rawQuery: string): string {
  const conditions: string[] = [];
  const floorsThreshold = effectiveFloorsThreshold(criteria);

  if (criteria.region) conditions.push(`b.state = '${criteria.region}'`);

  const proximity = conditionForProximity(criteria);
  if (proximity) conditions.push(proximity);

  const classification = conditionForClassification(criteria);
  if (classification) conditions.push(classification);

  if (floorsThreshold) conditions.push(`b.floors_above_ground >= ${floorsThreshold}`);

  if (criteria.healthBelow !== undefined) conditions.push(`b.health_index < ${criteria.healthBelow}`);
  if (criteria.healthAbove !== undefined) conditions.push(`b.health_index > ${criteria.healthAbove}`);

  if (criteria.statuses.length > 0) {
    const monitoring = criteria.statuses.map(status => `'${STATUS_TO_MONITORING[status]}'`).join(', ');
    conditions.push(`b.monitoring_status IN (${monitoring}) -- ${criteria.statuses.join(' / ')}`);
  }

  if (criteria.defectGroups.length > 0) {
    const codes = defectCodesForGroups(criteria.defectGroups).map(code => `'${code}'`).join(', ');
    conditions.push(`sf.defect_code IN (${codes})`);
  }

  if (criteria.unresolvedOnly) conditions.push('sf.is_resolved = false');

  if (criteria.findingsWithinDays) {
    const months = Math.max(1, Math.round(criteria.findingsWithinDays / MONTHS_PER_WINDOW));
    conditions.push(`sf.latest_observation_date >= NOW() - INTERVAL '${months} months'`);
  }

  const telemetry = conditionForTelemetry(criteria);
  if (telemetry) conditions.push(telemetry);

  const whereClause = conditions.length > 0 ? conditions.join('\n  AND ') : '1 = 1';

  return `-- Natural language: ${rawQuery.replace(/\s+/g, ' ').trim()}
-- Read-only translation. No statement is executed against the live database.
SELECT b.id, b.name, b.building_classification, b.latitude, b.longitude,
       b.health_index, sf.defect_code, sf.severity
FROM buildings b
LEFT JOIN structural_findings sf ON sf.building_id = b.id
WHERE ${whereClause}
${orderClause(criteria)};`;
}
