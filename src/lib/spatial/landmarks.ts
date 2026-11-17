export type LandmarkKind = 'waterway' | 'city' | 'region';

export interface Landmark {
  id: string;
  /** Full label shown to the user. */
  label: string;
  /** Short label used inside generated PostGIS SQL comments. */
  sqlLabel: string;
  lat: number;
  lng: number;
  /** Radius applied when the query names this place without a distance. */
  defaultRadiusKm: number;
  kind: LandmarkKind;
  /** State filter applied for region landmarks (e.g. NSW). */
  region?: string;
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'sydney-harbour',
    label: 'Sydney Harbour',
    sqlLabel: 'Sydney Harbour anchor',
    lat: -33.8568,
    lng: 151.2153,
    defaultRadiusKm: 20,
    kind: 'waterway'
  },
  {
    id: 'sydney-cbd',
    label: 'Sydney CBD',
    sqlLabel: 'Sydney CBD',
    lat: -33.8688,
    lng: 151.2093,
    defaultRadiusKm: 20,
    kind: 'city'
  },
  {
    id: 'sydney',
    label: 'Sydney',
    sqlLabel: 'Sydney',
    lat: -33.8688,
    lng: 151.2093,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'parramatta',
    label: 'Parramatta',
    sqlLabel: 'Parramatta',
    lat: -33.8136,
    lng: 151.0034,
    defaultRadiusKm: 10,
    kind: 'city'
  },
  {
    id: 'silverwater',
    label: 'Silverwater',
    sqlLabel: 'Silverwater',
    lat: -33.834,
    lng: 151.0462,
    defaultRadiusKm: 10,
    kind: 'city'
  },
  {
    id: 'barangaroo',
    label: 'Barangaroo',
    sqlLabel: 'Barangaroo',
    lat: -33.8615,
    lng: 151.2019,
    defaultRadiusKm: 10,
    kind: 'city'
  },
  {
    id: 'nsw',
    label: 'New South Wales',
    sqlLabel: 'NSW',
    lat: -33.8688,
    lng: 151.2093,
    defaultRadiusKm: 0,
    kind: 'region',
    region: 'NSW'
  },
  {
    id: 'melbourne',
    label: 'Melbourne',
    sqlLabel: 'Melbourne',
    lat: -37.8136,
    lng: 144.9631,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'london',
    label: 'London',
    sqlLabel: 'London',
    lat: 51.5045,
    lng: -0.0865,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'new-york',
    label: 'New York',
    sqlLabel: 'New York',
    lat: 40.7484,
    lng: -73.9857,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'paris',
    label: 'Paris',
    sqlLabel: 'Paris',
    lat: 48.8584,
    lng: 2.2945,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'tokyo',
    label: 'Tokyo',
    sqlLabel: 'Tokyo',
    lat: 35.6586,
    lng: 139.7454,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'dubai',
    label: 'Dubai',
    sqlLabel: 'Dubai',
    lat: 25.1972,
    lng: 55.2744,
    defaultRadiusKm: 25,
    kind: 'city'
  },
  {
    id: 'singapore',
    label: 'Singapore',
    sqlLabel: 'Singapore',
    lat: 1.2834,
    lng: 103.8607,
    defaultRadiusKm: 25,
    kind: 'city'
  }
];

/** Landmark aliases mapped to canonical landmark ids, longest alias wins. */
const LANDMARK_ALIASES: Array<{ alias: string; id: string }> = [
  { alias: 'new south wales', id: 'nsw' },
  { alias: 'sydney harbour', id: 'sydney-harbour' },
  { alias: 'sydney harbor', id: 'sydney-harbour' },
  { alias: 'sydney cbd', id: 'sydney-cbd' },
  { alias: 'silverwater', id: 'silverwater' },
  { alias: 'barangaroo', id: 'barangaroo' },
  { alias: 'parramatta', id: 'parramatta' },
  { alias: 'melbourne', id: 'melbourne' },
  { alias: 'new york', id: 'new-york' },
  { alias: 'singapore', id: 'singapore' },
  { alias: 'sydney', id: 'sydney' },
  { alias: 'london', id: 'london' },
  { alias: 'tokyo', id: 'tokyo' },
  { alias: 'dubai', id: 'dubai' },
  { alias: 'paris', id: 'paris' },
  { alias: 'nsw', id: 'nsw' }
].sort((left, right) => right.alias.length - left.alias.length);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds the first (longest) landmark alias mentioned in the query. */
export function findLandmark(query: string): Landmark | null {
  const normalised = ` ${query.toLowerCase()} `;
  for (const entry of LANDMARK_ALIASES) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeForRegExp(entry.alias)}([^a-z0-9]|$)`);
    if (pattern.test(normalised)) {
      return LANDMARKS.find(landmark => landmark.id === entry.id) ?? null;
    }
  }
  return null;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in kilometres between two WGS84 coordinates. */
export function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(distanceKm: number): string {
  return distanceKm < 10 ? `${distanceKm.toFixed(1)} km` : `${Math.round(distanceKm)} km`;
}
