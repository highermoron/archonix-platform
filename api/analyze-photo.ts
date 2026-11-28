type ApiRequest = {
  method?: string;
  body?:
    | string
    | {
        imageDataUrl?: string;
        component?: string;
        buildingName?: string;
      };
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
};

interface PhotoAnalysisPayload {
  crackLengthMm?: string;
  crackWidthMm?: string;
  concernLevel?: 'Low Concern' | 'Moderate Concern' | 'High Concern' | 'Urgent Professional Assessment';
  observations?: string[];
  summary?: string;
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

  let body: { imageDataUrl?: string; component?: string; buildingName?: string } = {};
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body;
  }

  const imageDataUrl = String(body.imageDataUrl || '').trim();
  const component = String(body.component || 'Structural element').trim();
  const buildingName = String(body.buildingName || 'Building asset').trim();

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Upload a local photo first (JPEG, PNG, or WebP) to run Gemini Vision analysis.' });
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const prompt = [
    `You are ARCHONIX Vision AI, an expert structural inspection assistant analyzing a photo of "${component}" at "${buildingName}".`,
    'Inspect the image for visible structural or surface conditions (cracks, fissures, spalling, moisture/efflorescence, corrosion, deformation, or intact/normal condition).',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "crackLengthMm": "numeric estimate in mm as a string like \\"120\\" or empty string \\"\\" if no crack is visible",',
    '  "crackWidthMm": "numeric estimate in mm as a string like \\"0.8\\" or empty string \\"\\" if no crack is visible",',
    '  "concernLevel": "Low Concern" | "Moderate Concern" | "High Concern" | "Urgent Professional Assessment",',
    '  "observations": ["Concrete observation 1", "Concrete observation 2", "Concrete observation 3"],',
    '  "summary": "2-sentence professional structural summary and recommended next step."',
    '}',
    'Be honest and grounded in what is actually visible in the image. Keep observations concise and technical.',
  ].join('\n');

  try {
    const models = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-2.5-flash'].filter(
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
                  { text: prompt },
                  { inlineData: { mimeType, data: base64Data } },
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
      if (candidateRes.status !== 404 && candidateRes.status !== 400) break;
    }

    if (!response) {
      return res.status(502).json({ error: `Gemini Vision error — ${errors.join(' | ')}` });
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
      return res.status(502).json({ error: `Gemini Vision returned no text (finishReason: ${candidate?.finishReason || 'unknown'})` });
    }

    const parsed = JSON.parse(rawText) as PhotoAnalysisPayload;
    const allowedLevels = ['Low Concern', 'Moderate Concern', 'High Concern', 'Urgent Professional Assessment'] as const;
    const concernLevel = allowedLevels.includes(parsed.concernLevel as (typeof allowedLevels)[number])
      ? parsed.concernLevel
      : 'Moderate Concern';

    return res.status(200).json({
      crackLengthMm: typeof parsed.crackLengthMm === 'string' ? parsed.crackLengthMm.replace(/[^\d.]/g, '') : '',
      crackWidthMm: typeof parsed.crackWidthMm === 'string' ? parsed.crackWidthMm.replace(/[^\d.]/g, '') : '',
      concernLevel,
      observations: Array.isArray(parsed.observations)
        ? parsed.observations.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 5)
        : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gemini Vision request failed';
    return res.status(500).json({ error: message });
  }
}
