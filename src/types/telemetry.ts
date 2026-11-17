export type SensorType = 'accelerometer' | 'tiltmeter' | 'strain_gauge' | 'moisture';

export type TelemetryStatus = 'normal' | 'warning' | 'critical';

export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  label: string;
  location: string;
  value: number;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  status: TelemetryStatus;
  timestamp: string;
  history: number[]; // rolling history (last 10-15 data points)
}

export interface BuildingTelemetry {
  buildingId: string;
  buildingName: string;
  overallStatus: TelemetryStatus;
  lastUpdated: string;
  activeAlert?: {
    type: 'seismic' | 'wind' | 'moisture' | 'nominal';
    title: string;
    description: string;
    severity: 'Urgent' | 'High';
    timestamp: string;
    peakMetric: string;
  };
  sensors: {
    accelerometer: SensorReading;
    tiltmeter: SensorReading;
    strain_gauge: SensorReading;
    moisture: SensorReading;
  };
}

export type SimulationPreset = 'seismic' | 'wind' | 'moisture' | 'baseline';
