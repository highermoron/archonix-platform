import { neon } from '@neondatabase/serverless';

type ApiRequest = {
  method?: string;
  body?: Record<string, unknown>;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Database URL not configured' });
  }

  const sql = neon(dbUrl);

  try {
    if (req.method === 'GET') {
      const buildings = await sql`
        SELECT *
        FROM buildings
        ORDER BY created_at DESC
      `;
      return res.status(200).json(buildings);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const buildingCode = String(body.building_code || '').trim();
      const name = String(body.name || '').trim();
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);

      if (!buildingCode || !name) {
        return res.status(400).json({ error: 'building_code and name are required' });
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'A valid latitude and longitude are required' });
      }

      const inserted = await sql`
        INSERT INTO buildings (
          building_code,
          name,
          street_address,
          suburb,
          state,
          postcode,
          latitude,
          longitude,
          location,
          construction_year,
          building_classification,
          floors_above_ground,
          floors_below_ground,
          description,
          monitoring_status,
          is_demo_data
        )
        VALUES (
          ${buildingCode},
          ${name},
          ${body.street_address ? String(body.street_address) : null},
          ${body.suburb ? String(body.suburb) : null},
          ${body.state ? String(body.state) : null},
          ${body.postcode ? String(body.postcode) : null},
          ${latitude},
          ${longitude},
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
          ${body.construction_year ? Number(body.construction_year) : null},
          ${body.building_classification ? String(body.building_classification) : null},
          ${body.floors_above_ground ? Number(body.floors_above_ground) : null},
          ${body.floors_below_ground ? Number(body.floors_below_ground) : null},
          ${body.description ? String(body.description) : null},
          ${body.monitoring_status ? String(body.monitoring_status) : 'active'},
          ${body.is_demo_data === true}
        )
        RETURNING *
      `;
      return res.status(201).json(inserted[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database request failed';
    return res.status(500).json({ error: message });
  }
}
