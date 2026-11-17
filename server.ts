import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  LEAGUES,
  fetchRapidMediaImage,
  getFeaturedPlayers,
  getMatchDetail,
  getMultiSportOverview,
  getPlayerDetail,
  getScoreboard,
  getStandings,
  isRapidApiConfigured,
  subscribeToLiveUpdates,
} from './server/sportsService.ts';
import { generateMatchPrediction } from './server/geminiService.ts';
import type { AiPredictionRequest, SportKey } from './src/types/sports.ts';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_SPORTS = new Set<SportKey>(['soccer', 'basketball', 'hockey', 'football']);

function parseSport(raw: unknown): SportKey {
  const s = String(raw || 'soccer') as SportKey;
  return VALID_SPORTS.has(s) ? s : 'soccer';
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      rapidApiConfigured: isRapidApiConfigured(),
      rapidApiHost: process.env.RAPIDAPI_HOST || 'sofascore.p.rapidapi.com',
    });
  });

  app.get('/api/sports/media/:kind/:id', async (req, res) => {
    const kind = req.params.kind === 'player' ? 'player' : 'team';
    const media = await fetchRapidMediaImage(kind, String(req.params.id));
    if (!media) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(media.buffer);
  });

  app.get('/api/sports/leagues', (_req, res) => {
    res.json({ leagues: LEAGUES });
  });

  app.get('/api/sports/scoreboard', async (req, res) => {
    try {
      const sport = parseSport(req.query.sport);
      const league = String(req.query.league || '');
      const leaguesParam = String(req.query.leagues || '');
      if (leaguesParam) {
        const list = leaguesParam.split(',').map((s) => s.trim()).filter(Boolean);
        const matches = await getMultiSportOverview(list);
        res.json({ matches });
        return;
      }
      const matches = await getScoreboard(sport, league);
      res.json({ matches });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener marcadores';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/sports/match/:sport/:league/:eventId', async (req, res) => {
    try {
      const sport = parseSport(req.params.sport);
      const league = String(req.params.league);
      const eventId = String(req.params.eventId);
      const detail = await getMatchDetail(sport, league, eventId);
      res.json(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar el detalle del partido';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/sports/standings/:sport/:league', async (req, res) => {
    try {
      const sport = parseSport(req.params.sport);
      const league = String(req.params.league);
      const standings = await getStandings(sport, league);
      res.json({ standings });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener la clasificación';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/sports/players/featured', async (req, res) => {
    try {
      const sport = parseSport(req.query.sport);
      const league = String(req.query.league || '');
      const players = await getFeaturedPlayers(sport, league);
      res.json({ players });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener jugadores destacados';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/sports/player/:sport/:league/:playerId', async (req, res) => {
    try {
      const sport = parseSport(req.params.sport);
      const league = String(req.params.league);
      const playerId = String(req.params.playerId);
      const player = await getPlayerDetail(sport, league, playerId);
      res.json(player);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar estadísticas del jugador';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/sports/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        title: 'Canal en tiempo real activo',
        message: 'Monitorizando marcadores en vivo de fútbol, NBA, NHL y NFL.',
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const unsubscribe = subscribeToLiveUpdates((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.post('/api/ai/predict', async (req, res) => {
    try {
      const body = req.body as Partial<AiPredictionRequest>;
      const sport = parseSport(body.sport);
      const league = String(body.league || '');
      const eventId = String(body.eventId || '');
      const oddsFormat = body.oddsFormat === 'american' ? 'american' : 'decimal';

      if (!eventId || !league) {
        res.status(400).json({ error: 'Se requieren sport, league y eventId.' });
        return;
      }

      const detail = await getMatchDetail(sport, league, eventId);
      const prediction = await generateMatchPrediction(detail, oddsFormat);
      res.json({ prediction });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al generar análisis predictivo con IA';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */'
          );
          res.setHeader('Content-Type', 'application/javascript');
          res.send(patched);
          return;
        }
      } catch {
        // fallback to vite.middlewares
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`VektorSport server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
