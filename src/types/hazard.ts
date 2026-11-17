export type HazardType = 'earthquake' | 'flood' | 'bushfire' | 'storm';

export interface NaturalHazard {
  id: string;
  type: HazardType;
  title: string;
  magnitude?: number; // e.g. 5.1 for earthquakes
  depthKm?: number;
  latitude: number;
  longitude: number;
  impactRadiusKm: number; // buffer radius for ST_DWithin
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  timestamp: string;
  source: string;
  description: string;
  alertLevel?: 'green' | 'yellow' | 'orange' | 'red';
  polygonGeoJson?: [number, number][]; // optional polygon boundary for flood/bushfire
}

export interface RapidInspectionTarget {
  buildingId: string;
  buildingName: string;
  buildingLocation: string;
  buildingType: string;
  buildingYear: number;
  healthIndex: number;
  hazardId: string;
  hazardTitle: string;
  hazardType: HazardType;
  distanceKm: number;
  riskScore: number; // 0 - 100 calculated priority
  severityRank: 'Critical' | 'High Priority' | 'Moderate' | 'Advisory';
  recommendedAction: string;
  dispatched: boolean;
}
