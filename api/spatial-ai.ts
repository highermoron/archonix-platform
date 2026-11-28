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

export const config = { maxDuration: 30 };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured in Vercel environment variables' });
  }

  let body: NonNullable<ApiRequest['body']> = {};
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as NonNullable<ApiRequest['body']>;
    } catch {
      body = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body;
  }
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
    const models = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(
      (m, i, all): m is string => Boolean(m) && all.indexOf(m) === i
    );
    let response: Response | null = null;
    const errors: string[] = [];

    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const makeRequest = (disableThinking: boolean) =>
        fetch(endpoint, {
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
              ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        });

      let candidateRes = await makeRequest(true);
      if (candidateRes.status === 400) {
        candidateRes = await makeRequest(false);
      }

      if (candidateRes.ok) {
        response = candidateRes;
        break;
      }
      const errText = await candidateRes.text().catch(() => '');
      errors.push(`${model} (${candidateRes.status}): ${errText.slice(0, 120)}`);
      if (![400, 404, 429, 500, 503].includes(candidateRes.status)) break;
    }

    if (!response) {
      return res.status(502).json({ error: `Gemini API error — ${errors.join(' | ')}` });
    }

    const data = (await response.json()) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    };
    const candidate = data.candidates?.[0];
    const rawText = (candidate?.content?.parts || [])
      .filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    if (!rawText) {
      return res.status(502).json({ error: `Gemini returned no text (finishReason: ${candidate?.finishReason || 'unknown'})` });
    }

    let parsed: GeminiSpatialPayload;
    try {
      parsed = JSON.parse(rawText) as GeminiSpatialPayload;
    } catch {
      return res.status(502).json({
        error: `Gemini returned incomplete JSON (finishReason: ${candidate?.finishReason || 'unknown'}): ${rawText.slice(0, 80)}`,
      });
    }

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
