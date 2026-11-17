import { GoogleGenAI, Type } from '@google/genai';
import type { AiPredictionResult, MatchDetailPayload } from '../src/types/sports.ts';

let cachedAi: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY no está configurada en los secretos del entorno.');
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

export async function generateMatchPrediction(
  detail: MatchDetailPayload,
  oddsFormat: 'decimal' | 'american'
): Promise<AiPredictionResult> {
  const ai = getAiClient();
  const { match, teamStats, homeLastFive, awayLastFive, injuries, standings, predictor, homePlayers, awayPlayers } = detail;

  const contextPayload = {
    sport: match.sport,
    league: match.leagueName,
    matchTitle: `${match.away.name} vs ${match.home.name}`,
    status: match.statusDetail,
    kickoffDate: match.date,
    venue: match.venue || 'Por confirmar',
    homeTeam: {
      name: match.home.name,
      record: match.home.record || 'N/D',
      score: match.home.score || '0',
      lastFive: homeLastFive.map((g) => `${g.result} vs ${g.opponent} (${g.score})`),
      topPlayers: homePlayers.slice(0, 5).map((p) => `${p.name} (${p.position}): ${p.primaryMetricLabel} ${p.primaryMetricValue}`),
    },
    awayTeam: {
      name: match.away.name,
      record: match.away.record || 'N/D',
      score: match.away.score || '0',
      lastFive: awayLastFive.map((g) => `${g.result} vs ${g.opponent} (${g.score})`),
      topPlayers: awayPlayers.slice(0, 5).map((p) => `${p.name} (${p.position}): ${p.primaryMetricLabel} ${p.primaryMetricValue}`),
    },
    marketOdds: match.odds || null,
    statisticalPredictor: predictor || null,
    teamComparison: teamStats.slice(0, 10),
    injuries: injuries.slice(0, 8),
    standingsContext: standings
      .filter((s) => s.teamId === match.home.id || s.teamId === match.away.id)
      .slice(0, 4),
    preferredOddsFormat: oddsFormat,
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analiza este enfrentamiento deportivo real y genera una recomendación predictiva estructurada en español basada en tendencias históricas, forma reciente de los últimos 5 partidos, bajas por lesión, localía y contexto de cuotas:\n\n${JSON.stringify(contextPayload, null, 2)}`,
    config: {
      systemInstruction:
        'Eres un analista cuantitativo deportivo experto en fútbol, baloncesto (NBA), hockey (NHL) y fútbol americano (NFL). Responde exclusivamente en español claro, preciso y profesional. Todas las probabilidades deben sumar aproximadamente 100 (en deportes sin empate como NBA/NFL/NHL, draw debe ser 0). Nunca inventes resultados falsos si faltan datos; razona estrictamente con los datos reales proporcionados y las tendencias históricas del enfrentamiento. Incluye gestión responsable de unidades (ej. 1u - 3u).',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          winProbability: {
            type: Type.OBJECT,
            properties: {
              home: { type: Type.NUMBER, description: 'Probabilidad de victoria del equipo local (0-100)' },
              draw: { type: Type.NUMBER, description: 'Probabilidad de empate (0-100, 0 si no aplica empate)' },
              away: { type: Type.NUMBER, description: 'Probabilidad de victoria del equipo visitante (0-100)' },
            },
            required: ['home', 'draw', 'away'],
          },
          recommendedPick: {
            type: Type.OBJECT,
            properties: {
              market: { type: Type.STRING, description: 'Mercado principal recomendado (ej. Moneyline, Hándicap, Total Más/Menos, Doble Oportunidad)' },
              selection: { type: Type.STRING, description: 'Selección exacta recomendada con nombre del equipo o línea' },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza porcentual entre 45 y 92' },
              edgeRating: { type: Type.STRING, description: 'Debe ser exactamente Alto, Moderado o Especulativo' },
              suggestedUnits: { type: Type.STRING, description: 'Gestión de bankroll sugerida, ej. 1.5u' },
              oddsContext: { type: Type.STRING, description: 'Contexto de cuota objetivo o valor esperado según el mercado' },
            },
            required: ['market', 'selection', 'confidence', 'edgeRating', 'suggestedUnits', 'oddsContext'],
          },
          alternativePicks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                market: { type: Type.STRING },
                selection: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                rationale: { type: Type.STRING },
              },
              required: ['market', 'selection', 'confidence', 'rationale'],
            },
          },
          historicalTrends: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 a 4 tendencias históricas y estadísticas concretas observadas en los datos.',
          },
          keyFactors: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 factores tácticos o de rendimiento de jugadores clave.',
          },
          riskAssessment: {
            type: Type.STRING,
            description: 'Principal factor de riesgo o varianza del pick.',
          },
          summary: {
            type: Type.STRING,
            description: 'Resumen ejecutivo conciso de 2 a 3 oraciones.',
          },
        },
        required: [
          'winProbability',
          'recommendedPick',
          'alternativePicks',
          'historicalTrends',
          'keyFactors',
          'riskAssessment',
          'summary',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('El modelo de IA devolvió una respuesta vacía.');
  }

  const parsed = JSON.parse(rawText) as Omit<AiPredictionResult, 'eventId' | 'sport' | 'league' | 'matchTitle' | 'generatedAt'>;
  const normalizedEdge =
    parsed.recommendedPick.edgeRating === 'Alto' ||
    parsed.recommendedPick.edgeRating === 'Moderado' ||
    parsed.recommendedPick.edgeRating === 'Especulativo'
      ? parsed.recommendedPick.edgeRating
      : 'Moderado';

  return {
    eventId: match.id,
    sport: match.sport,
    league: match.league,
    matchTitle: `${match.away.shortName} vs ${match.home.shortName}`,
    generatedAt: new Date().toISOString(),
    winProbability: parsed.winProbability,
    recommendedPick: {
      ...parsed.recommendedPick,
      edgeRating: normalizedEdge,
    },
    alternativePicks: (parsed.alternativePicks || []).slice(0, 3),
    historicalTrends: (parsed.historicalTrends || []).slice(0, 4),
    keyFactors: (parsed.keyFactors || []).slice(0, 4),
    riskAssessment: parsed.riskAssessment,
    summary: parsed.summary,
  };
}
