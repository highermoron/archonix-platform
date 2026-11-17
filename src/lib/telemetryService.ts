import type { BuildingTelemetry, SensorReading, TelemetryStatus, SimulationPreset } from '../types/telemetry';
import { supabase } from './supabase';

// Helper to determine sensor status from thresholds
export function evaluateStatus(value: number, warning: number, critical: number): TelemetryStatus {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'normal';
}

function randomJitter(base: number, maxOffset: number): number {
  const delta = (Math.random() * 2 - 1) * maxOffset;
  return Number(Math.max(0, base + delta).toFixed(3));
}

export function createDefaultBuildingTelemetry(buildingId: string, buildingName: string): BuildingTelemetry {
  const now = new Date().toLocaleTimeString();

  // Custom configurations for canonical demo buildings
  if (buildingId === 'bld-001') {
    // Barangaroo Commercial Tower 4 (39 floors)
    return {
      buildingId,
      buildingName,
      overallStatus: 'normal',
      lastUpdated: now,
      sensors: {
        accelerometer: {
          sensorId: `accel-${buildingId}`,
          sensorType: 'accelerometer',
          label: 'Triaxial Core Accelerometer',
          location: 'Level 39 Plant Room & Crown',
          value: 0.018,
          unit: 'g',
          warningThreshold: 0.08,
          criticalThreshold: 0.18,
          status: 'normal',
          timestamp: now,
          history: [0.016, 0.017, 0.019, 0.018, 0.017, 0.02, 0.018, 0.017, 0.018, 0.018]
        },
        tiltmeter: {
          sensorId: `tilt-${buildingId}`,
          sensorType: 'tiltmeter',
          label: 'Foundation Biaxial Tiltmeter',
          location: 'Basement B4 Bedrock Anchor',
          value: 0.032,
          unit: '°',
          warningThreshold: 0.10,
          criticalThreshold: 0.20,
          status: 'normal',
          timestamp: now,
          history: [0.031, 0.032, 0.033, 0.032, 0.032, 0.031, 0.032, 0.033, 0.032, 0.032]
        },
        strain_gauge: {
          sensorId: `strain-${buildingId}`,
          sensorType: 'strain_gauge',
          label: 'Transfer Truss Strain Gauge',
          location: 'Level 12 Perimeter Column Transfer',
          value: 142,
          unit: 'με',
          warningThreshold: 350,
          criticalThreshold: 520,
          status: 'normal',
          timestamp: now,
          history: [140, 142, 141, 143, 145, 142, 141, 144, 143, 142]
        },
        moisture: {
          sensorId: `moist-${buildingId}`,
          sensorType: 'moisture',
          label: 'Hydrostatic Basement Piezometer',
          location: 'Level B4 North Perimeter Wall',
          value: 19.5,
          unit: '%',
          warningThreshold: 45.0,
          criticalThreshold: 68.0,
          status: 'normal',
          timestamp: now,
          history: [18.2, 18.5, 19.0, 19.1, 19.5, 19.4, 19.2, 19.3, 19.6, 19.5]
        }
      }
    };
  }

  if (buildingId === 'bld-002') {
    // Parramatta Riverfront Residences (24 floors - known shear crack)
    return {
      buildingId,
      buildingName,
      overallStatus: 'normal',
      lastUpdated: now,
      sensors: {
        accelerometer: {
          sensorId: `accel-${buildingId}`,
          sensorType: 'accelerometer',
          label: 'Roof Sway Accelerometer',
          location: 'Level 24 Mechanical Parapet',
          value: 0.024,
          unit: 'g',
          warningThreshold: 0.08,
          criticalThreshold: 0.18,
          status: 'normal',
          timestamp: now,
          history: [0.022, 0.024, 0.023, 0.025, 0.026, 0.023, 0.024, 0.025, 0.023, 0.024]
        },
        tiltmeter: {
          sensorId: `tilt-${buildingId}`,
          sensorType: 'tiltmeter',
          label: 'Riverbank Pile Cap Tiltmeter',
          location: 'East Foundation Piling P-04',
          value: 0.051,
          unit: '°',
          warningThreshold: 0.10,
          criticalThreshold: 0.20,
          status: 'normal',
          timestamp: now,
          history: [0.049, 0.05, 0.051, 0.052, 0.051, 0.05, 0.051, 0.052, 0.051, 0.051]
        },
        strain_gauge: {
          sensorId: `strain-${buildingId}`,
          sensorType: 'strain_gauge',
          label: 'Column C14 Shear Strain Gauge',
          location: 'Level 14 Load Column Fissure Zone',
          value: 235,
          unit: 'με',
          warningThreshold: 350,
          criticalThreshold: 520,
          status: 'normal',
          timestamp: now,
          history: [230, 232, 235, 234, 238, 236, 235, 237, 236, 235]
        },
        moisture: {
          sensorId: `moist-${buildingId}`,
          sensorType: 'moisture',
          label: 'River Ingress Moisture Sensor',
          location: 'Basement Carpark Level B2 East Face',
          value: 34.0,
          unit: '%',
          warningThreshold: 45.0,
          criticalThreshold: 68.0,
          status: 'normal',
          timestamp: now,
          history: [32, 33, 33.5, 34, 34.2, 33.8, 34, 34.1, 34.3, 34.0]
        }
      }
    };
  }

  // Generic baseline for any other building
  return {
    buildingId,
    buildingName,
    overallStatus: 'normal',
    lastUpdated: now,
    sensors: {
      accelerometer: {
        sensorId: `accel-${buildingId}`,
        sensorType: 'accelerometer',
        label: 'Structural Accelerometer',
        location: 'Roof Core & Slab',
        value: 0.015,
        unit: 'g',
        warningThreshold: 0.08,
        criticalThreshold: 0.18,
        status: 'normal',
        timestamp: now,
        history: [0.014, 0.015, 0.015, 0.016, 0.014, 0.015, 0.015, 0.014, 0.016, 0.015]
      },
      tiltmeter: {
        sensorId: `tilt-${buildingId}`,
        sensorType: 'tiltmeter',
        label: 'Foundation Tiltmeter',
        location: 'Ground Slab Anchor',
        value: 0.028,
        unit: '°',
        warningThreshold: 0.10,
        criticalThreshold: 0.20,
        status: 'normal',
        timestamp: now,
        history: [0.027, 0.028, 0.028, 0.029, 0.028, 0.027, 0.028, 0.028, 0.029, 0.028]
      },
      strain_gauge: {
        sensorId: `strain-${buildingId}`,
        sensorType: 'strain_gauge',
        label: 'Portal Frame Strain Sensor',
        location: 'Primary Load Girder',
        value: 125,
        unit: 'με',
        warningThreshold: 350,
        criticalThreshold: 520,
        status: 'normal',
        timestamp: now,
        history: [120, 122, 125, 124, 126, 125, 124, 125, 126, 125]
      },
      moisture: {
        sensorId: `moist-${buildingId}`,
        sensorType: 'moisture',
        label: 'Waterproofing Monitor',
        location: 'Sub-level Drainage Sump',
        value: 21.0,
        unit: '%',
        warningThreshold: 45.0,
        criticalThreshold: 68.0,
        status: 'normal',
        timestamp: now,
        history: [20, 20.5, 21, 21.2, 21, 20.8, 21, 21.1, 21, 21]
      }
    }
  };
}

export function generateInitialTelemetry(buildingIds: { id: string; name: string }[]): Record<string, BuildingTelemetry> {
  const records: Record<string, BuildingTelemetry> = {};
  for (const bld of buildingIds) {
    records[bld.id] = createDefaultBuildingTelemetry(bld.id, bld.name);
  }
  return records;
}

// Tick function to simulate live data stream
export function tickTelemetry(currentMap: Record<string, BuildingTelemetry>): Record<string, BuildingTelemetry> {
  const nextMap: Record<string, BuildingTelemetry> = {};
  const now = new Date().toLocaleTimeString();

  for (const [id, telemetry] of Object.entries(currentMap)) {
    // If building is currently in active alert preset, preserve the spike with small jitter
    const isCritical = telemetry.overallStatus === 'critical';

    const accelVal = isCritical && telemetry.activeAlert?.type === 'seismic'
      ? randomJitter(telemetry.sensors.accelerometer.value, 0.015)
      : randomJitter(telemetry.sensors.accelerometer.value, 0.002);

    const tiltVal = isCritical && telemetry.activeAlert?.type === 'seismic'
      ? randomJitter(telemetry.sensors.tiltmeter.value, 0.005)
      : randomJitter(telemetry.sensors.tiltmeter.value, 0.001);

    const strainVal = isCritical && telemetry.activeAlert?.type === 'wind'
      ? Math.round(randomJitter(telemetry.sensors.strain_gauge.value, 15))
      : Math.round(randomJitter(telemetry.sensors.strain_gauge.value, 3));

    const moistVal = isCritical && telemetry.activeAlert?.type === 'moisture'
      ? Number(randomJitter(telemetry.sensors.moisture.value, 1.2).toFixed(1))
      : Number(randomJitter(telemetry.sensors.moisture.value, 0.3).toFixed(1));

    const accelStatus = evaluateStatus(accelVal, telemetry.sensors.accelerometer.warningThreshold, telemetry.sensors.accelerometer.criticalThreshold);
    const tiltStatus = evaluateStatus(tiltVal, telemetry.sensors.tiltmeter.warningThreshold, telemetry.sensors.tiltmeter.criticalThreshold);
    const strainStatus = evaluateStatus(strainVal, telemetry.sensors.strain_gauge.warningThreshold, telemetry.sensors.strain_gauge.criticalThreshold);
    const moistStatus = evaluateStatus(moistVal, telemetry.sensors.moisture.warningThreshold, telemetry.sensors.moisture.criticalThreshold);

    const overallStatus: TelemetryStatus =
      accelStatus === 'critical' || tiltStatus === 'critical' || strainStatus === 'critical' || moistStatus === 'critical'
        ? 'critical'
        : accelStatus === 'warning' || tiltStatus === 'warning' || strainStatus === 'warning' || moistStatus === 'warning'
          ? 'warning'
          : 'normal';

    const updateSensor = (prev: SensorReading, newVal: number, newStatus: TelemetryStatus): SensorReading => {
      const nextHistory = [...prev.history.slice(1), newVal];
      return {
        ...prev,
        value: newVal,
        status: newStatus,
        timestamp: now,
        history: nextHistory
      };
    };

    nextMap[id] = {
      ...telemetry,
      overallStatus,
      lastUpdated: now,
      sensors: {
        accelerometer: updateSensor(telemetry.sensors.accelerometer, accelVal, accelStatus),
        tiltmeter: updateSensor(telemetry.sensors.tiltmeter, tiltVal, tiltStatus),
        strain_gauge: updateSensor(telemetry.sensors.strain_gauge, strainVal, strainStatus),
        moisture: updateSensor(telemetry.sensors.moisture, moistVal, moistStatus)
      }
    };
  }

  return nextMap;
}

export interface SimulationResult {
  updatedTelemetry: Record<string, BuildingTelemetry>;
  generatedAlert?: {
    title: string;
    buildingName: string;
    buildingId: string;
    severity: 'Urgent' | 'High';
    description: string;
    recommendation: string;
  };
}

export function executeSimulation(
  preset: SimulationPreset,
  current: Record<string, BuildingTelemetry>,
  targetBuildingId?: string
): SimulationResult {
  const updated: Record<string, BuildingTelemetry> = JSON.parse(JSON.stringify(current));
  const now = new Date().toLocaleTimeString();

  if (preset === 'baseline') {
    // Reset all buildings back to healthy baseline
    for (const id of Object.keys(updated)) {
      const bldName = updated[id].buildingName;
      updated[id] = createDefaultBuildingTelemetry(id, bldName);
    }
    return { updatedTelemetry: updated };
  }

  // Pick target building (defaults to Barangaroo or Parramatta for high drama)
  const primaryId = targetBuildingId || (preset === 'wind' ? 'bld-002' : 'bld-001');
  const target = updated[primaryId];

  if (!target) {
    return { updatedTelemetry: updated };
  }

  if (preset === 'seismic') {
    // Simulate M5.2 Seismic Ground Motion
    // Accelerometer surges to 0.285g (exceeds 0.18g critical)
    target.sensors.accelerometer.value = 0.285;
    target.sensors.accelerometer.status = 'critical';
    target.sensors.accelerometer.history = [...target.sensors.accelerometer.history.slice(1), 0.285];

    // Tiltmeter shifts to 0.225° (exceeds 0.20° critical)
    target.sensors.tiltmeter.value = 0.225;
    target.sensors.tiltmeter.status = 'critical';
    target.sensors.tiltmeter.history = [...target.sensors.tiltmeter.history.slice(1), 0.225];

    target.overallStatus = 'critical';
    target.lastUpdated = now;
    target.activeAlert = {
      type: 'seismic',
      title: 'Seismic Shockwave Telemetry Triggered',
      description: `Triaxial accelerometer recorded severe dynamic ground acceleration of 0.285g with simultaneous 0.225° foundation tilt shift during seismic tremor.`,
      severity: 'Urgent',
      timestamp: now,
      peakMetric: '0.285g VIB / 0.225° TILT'
    };

    // If Parramatta exists, trigger sympathetic warning vibration
    if (updated['bld-002'] && primaryId !== 'bld-002') {
      updated['bld-002'].sensors.accelerometer.value = 0.115;
      updated['bld-002'].sensors.accelerometer.status = 'warning';
      updated['bld-002'].overallStatus = 'warning';
    }

    return {
      updatedTelemetry: updated,
      generatedAlert: {
        title: `CRITICAL TELEMETRY: Triaxial Vibration Spike (0.285g) — ${target.buildingName}`,
        buildingName: target.buildingName,
        buildingId: target.buildingId,
        severity: 'Urgent',
        description: `Sensors recorded sudden dynamic peak of 0.285g (AS 1170.4 seismic threshold exceeded) and 0.225° foundation tilt. Structural integrity verification required.`,
        recommendation: `Deploy rapid post-event structural inspection team. Inspect core walls, lift shafts, and transfer beam connections immediately.`
      }
    };
  }

  if (preset === 'wind') {
    // Simulate 115 km/h Severe Gale Wind Storm
    // Strain gauge spikes to 640 με (exceeds 520 με critical)
    target.sensors.strain_gauge.value = 642;
    target.sensors.strain_gauge.status = 'critical';
    target.sensors.strain_gauge.history = [...target.sensors.strain_gauge.history.slice(1), 642];

    // Roof sway accelerometer rises to 0.145g (warning)
    target.sensors.accelerometer.value = 0.145;
    target.sensors.accelerometer.status = 'warning';
    target.sensors.accelerometer.history = [...target.sensors.accelerometer.history.slice(1), 0.145];

    target.overallStatus = 'critical';
    target.lastUpdated = now;
    target.activeAlert = {
      type: 'wind',
      title: 'High-Wind Dynamic Sway & Structural Strain Spike',
      description: `Gale force wind shear generated dynamic roof sway of 0.145g and peak microstrain of 642 με on primary structural columns.`,
      severity: 'Urgent',
      timestamp: now,
      peakMetric: '642 με STRAIN'
    };

    return {
      updatedTelemetry: updated,
      generatedAlert: {
        title: `CRITICAL STRAIN BREACH: Column Strain at 642 με — ${target.buildingName}`,
        buildingName: target.buildingName,
        buildingId: target.buildingId,
        severity: 'Urgent',
        description: `Microstrain sensor on primary load column exceeded critical design tolerance (642 με vs 520 με max allowable limit during wind gusts).`,
        recommendation: `Inspect primary load columns, facade anchor points, and examine existing crack zones for widening under cyclical stress.`
      }
    };
  }

  if (preset === 'moisture') {
    // Simulate Flash Basement Ingress / Hydrostatic Failure
    target.sensors.moisture.value = 88.5;
    target.sensors.moisture.status = 'critical';
    target.sensors.moisture.history = [...target.sensors.moisture.history.slice(1), 88.5];

    target.overallStatus = 'critical';
    target.lastUpdated = now;
    target.activeAlert = {
      type: 'moisture',
      title: 'Sub-level Hydrostatic Moisture Saturation',
      description: `Basement piezometric sensor spiked to 88.5% saturation indicating catastrophic membrane failure or sump pump outage.`,
      severity: 'High',
      timestamp: now,
      peakMetric: '88.5% MOISTURE'
    };

    return {
      updatedTelemetry: updated,
      generatedAlert: {
        title: `HYDROSTATIC ALERT: Sub-level Water Ingress (88.5%) — ${target.buildingName}`,
        buildingName: target.buildingName,
        buildingId: target.buildingId,
        severity: 'High',
        description: `Piezometer in basement perimeter retention wall detected severe moisture saturation (88.5%), indicating active water ingress.`,
        recommendation: `Engage waterproofing specialist and examine drainage sump pumps. Inspect concrete for progressive rebar corrosion and efflorescence.`
      }
    };
  }

  return { updatedTelemetry: updated };
}

// Supabase Realtime Subscription setup (optional when connected to live backend)
export function subscribeToSupabaseTelemetry(
  onReadingReceived: (reading: { building_id: string; sensor_type: string; value: number }) => void
) {
  const client = supabase;
  if (!client) return () => {};

  const channel = client
    .channel('archonix_telemetry_live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sensor_telemetry' },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          onReadingReceived(payload.new as { building_id: string; sensor_type: string; value: number });
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
