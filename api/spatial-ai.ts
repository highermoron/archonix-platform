type ApiRequest = {
  method?: string;
  body?: {
    query?: string;
    buildings?: Array<{
      id: string;
      name: string;
      location: string;
      type?: string;
      status?: string;
      healthIndex?: number;
      floors?: number;
      year?: number;
      lat?: number;
      lng?: number;
      incidentNote?: string;
    }>;
    findings?: Array<{
      buildingId: string;
      component: string;
      concernLevel: string;
      summary?: string;
      observations?: string[];
    }>;
    telemetry?: Record<string, { overallStatus?: string; activeAlert?: { title?: string; severity?: string } }>;
  };
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

interface GeminiSpatialPayload {
  matchedBuildingIds?: string[];
  summary?: string;
  hints?: string[];
  appliedClauses?: string[];
  intent?: string;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  const body = req.body || {};
  const query = String(body.query || '').trim();
  const buildings = Array.isArray(body.buildings) ? body.buildings : [];
  const findings = Array.isArray(body.findings) ? body.findings : [];
  const telemetry = body.telemetry || {};

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  const portfolioContext = buildings.map((b) => ({
    id: b.id,
    name: b.name,
    location: b.location,
    type: b.type,
    status: b.status,
    healthIndex: b.healthIndex,
    floors: b.floors,
    year: b.year,
    incidentNote: b.incidentNote,
    telemetryStatus: telemetry[b.id]?.overallStatus || 'normal',
    activeAlert: telemetry[b.id]?.activeAlert?.title || null,
    findings: findings
      .filter((f) => f.buildingId === b.id)
      .slice(0, 3)
      .map((f) => `${f.component} (${f.concernLevel}): ${f.summary || (f.observations || []).join('; ')}`),
  }));

  const systemPrompt = [
    'You are ARCHONIX Spatial AI, an expert structural engineering and global building-portfolio intelligence assistant.',
    'Given the user query and the portfolio JSON below, identify all matching building IDs and provide a concise, insightful executive summary.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "matchedBuildingIds": ["id1", "id2"],',
    '  "summary": "2-3 sentence direct, insightful answer referencing specific building names, locations, health scores, or alerts.",',
    '  "hints": ["Short actionable follow-up question 1", "Short actionable follow-up question 2"],',
    '  "appliedClauses": ["Short filter/reasoning badge 1", "Short filter/reasoning badge 2"],',
    '  "intent": "short_snake_case_intent"',
    '}',
    'Rules:',
    '- Only include IDs that exist in the provided portfolio.',
    '- If the user asks a general comparison, risk ranking, or summary question, include the relevant top buildings in matchedBuildingIds so the map focuses on them.',
    '- Keep summary crisp, professional, and grounded strictly in the provided data.',
  ].join('\n');

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt}\n\nUSER QUERY:\n${query}\n\nPORTFOLIO DATA:\n${JSON.stringify(portfolioContext)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: `Gemini API error (${response.status}): ${errText.slice(0, 200)}` });
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText) as GeminiSpatialPayload;

    const validIds = new Set(buildings.map((b) => b.id));
    const matchedBuildingIds = Array.isArray(parsed.matchedBuildingIds)
      ? parsed.matchedBuildingIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
      : [];

    return res.status(200).json({
      matchedBuildingIds,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : undefined,
      hints: Array.isArray(parsed.hints) ? parsed.hints.filter((h): h is string => typeof h === 'string').slice(0, 3) : [],
      appliedClauses: Array.isArray(parsed.appliedClauses)
        ? parsed.appliedClauses.filter((c): c is string => typeof c === 'string').slice(0, 5)
        : [],
      intent: typeof parsed.intent === 'string' ? parsed.intent : 'gemini_spatial_analysis',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gemini request failed';
    return res.status(500).json({ error: message });
  }
}
