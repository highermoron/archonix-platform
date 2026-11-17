import { effectiveFloorsThreshold } from './criteria';
import type { SpatialQueryCriteria } from './criteria';
import { describeDefectGroups } from './defects';
import type { MatchOutcome, SpatialMatch } from './matcher';
import { formatDistance } from './landmarks';

function rankLabel(criteria: SpatialQueryCriteria): string {
  if (criteria.rankBy === 'distance_asc') return 'distance from the anchor';
  if (criteria.rankBy === 'name') return 'asset name';
  return 'health index';
}

function defectSentence(match: SpatialMatch): string {
  const defect = match.primaryDefect;
  if (!defect) return 'No recorded structural finding is attached to this asset.';
  const state = defect.isResolved ? 'resolved' : 'unresolved';
  return `Highest-severity recorded finding: ${defect.label} (${defect.severity}, ${state}) at ${defect.location} - "${defect.note}".`;
}

function profileOf(match: SpatialMatch, criteria: SpatialQueryCriteria): string {
  const parts: string[] = [];
  if (criteria.bcaClass) parts.push(`${match.bcaClass} (derived)`);
  if (match.floors) parts.push(`${match.floors} storeys`);
  if (match.healthIndex !== undefined) parts.push(`health ${match.healthIndex}%`);
  parts.push(match.status);
  return parts.join(', ');
}

export function buildSummary(criteria: SpatialQueryCriteria, outcome: MatchOutcome): string {
  if (outcome.evaluated === 0) {
    return 'No plotted building has usable coordinates, so there was nothing to search.';
  }

  if (outcome.matches.length === 0) {
    const base = `No asset satisfies every clause across the ${outcome.evaluated} plotted buildings.`;
    const near = outcome.nearMisses[0];
    if (!near) return base;
    return `${base} The closest near miss is ${near.name} at ${formatDistance(near.distanceKm)}, `
      + `${formatDistance(near.exceededByKm)} beyond the ${near.radiusKm} km buffer.`;
  }

  if (outcome.matches.length === 1) {
    const match = outcome.matches[0];
    const telemetry = match.telemetryHeadline ? ` Live telemetry: ${match.telemetryHeadline}.` : '';
    return `${match.name} (${match.location}) is the only match: ${profileOf(match, criteria)}. `
      + `${defectSentence(match)}${telemetry}`;
  }

  const ordered = outcome.matches
    .slice(0, 3)
    .map(match => `${match.name} (${match.healthIndex !== undefined ? `${match.healthIndex}%` : 'no index'})`)
    .join(', ');
  const remainder = outcome.matches.length > 3 ? `, plus ${outcome.matches.length - 3} more` : '';
  const first = outcome.matches[0];
  return `${outcome.matches.length} of ${outcome.evaluated} assets match, ordered by ${rankLabel(criteria)}: `
    + `${ordered}${remainder}. Lowest health in the set: ${first.name} with ${defectSentence(first).toLowerCase()}`;
}

/**
 * Explains an empty result instead of leaving the user with a dead end.
 * Every hint is derived from the criteria that actually excluded buildings.
 */
export function buildHints(criteria: SpatialQueryCriteria, outcome: MatchOutcome): string[] {
  if (outcome.matches.length > 0) return [];
  const hints: string[] = [];
  const blocked = outcome.blockedBy;

  if (criteria.telemetryFocus && blocked.telemetry) {
    hints.push('No sensor is above the requested threshold right now. Trigger the M5.2 Tremor or 115 km/h Wind preset in the map HUD, then run the query again.');
  }

  if (criteria.radiusKm && blocked.distance) {
    const near = outcome.nearMisses[0];
    const anchor = criteria.landmark ? criteria.landmark.label : 'the anchor';
    hints.push(near
      ? `Widen the radius: ${near.name} is ${formatDistance(near.distanceKm)} from ${anchor}, ${formatDistance(near.exceededByKm)} beyond the buffer.`
      : `Increase the radius around ${anchor}, or drop another clause so nearby assets can qualify.`);
  }

  if (criteria.findingsWithinDays && blocked.recency) {
    const months = Math.max(1, Math.round(criteria.findingsWithinDays / 30.44));
    hints.push(`Findings exist, but none is dated inside the last ${months} months. The window is applied to the recorded inspection date.`);
  }

  if (criteria.defectGroups.length > 0 && blocked.defects) {
    hints.push(`No plotted asset has a recorded finding for ${describeDefectGroups(criteria.defectGroups)}${criteria.unresolvedOnly ? ' that is still unresolved' : ''}.`);
  }

  if (criteria.statuses.length > 0 && blocked.status) {
    hints.push(`No asset currently holds the status ${criteria.statuses.join(' or ')}.`);
  }

  if (blocked.health) {
    const bound = criteria.healthBelow !== undefined
      ? `below ${criteria.healthBelow}%`
      : `above ${criteria.healthAbove}%`;
    hints.push(`No asset has a health index ${bound}. Assets without a recorded index are never treated as passing.`);
  }

  const floors = effectiveFloorsThreshold(criteria);
  if (floors && blocked.floors) {
    hints.push(`No asset meets the ${floors} storey threshold used for this query.`);
  }

  if (criteria.bcaClass && blocked.bca_class) {
    hints.push(`${criteria.bcaClass} is derived from the asset category in this demo portfolio, and no plotted asset maps to it.`);
  }

  if (criteria.category && blocked.category) {
    hints.push(`No ${criteria.category.toLowerCase()} asset is currently plotted.`);
  }

  if (criteria.region && blocked.state) {
    hints.push(`No plotted asset has an address in ${criteria.region}.`);
  }

  if (hints.length === 0) {
    hints.push('No asset satisfies the full combination of clauses. Remove one condition and run the query again.');
  }

  return hints;
}
