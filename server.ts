import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

interface ServerLeaderboardEntry {
  id: string;
  playerName: string;
  titleBadge: string;
  score: number;
  maxCombo: number;
  fruitsSliced: number;
  difficulty: 'apprentice' | 'shinobi' | 'shogun' | 'ronin';
  mode: 'classic' | 'daily';
  timestamp: number;
  syncedOnline: boolean;
}

function readRealLeaderboard(): ServerLeaderboardEntry[] {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out any legacy synthetic/mock IDs (gl_*) and keep only real game runs
    return parsed
      .filter(
        (item: ServerLeaderboardEntry) =>
          item &&
          typeof item.id === 'string' &&
          !item.id.startsWith('gl_') &&
          typeof item.score === 'number' &&
          item.score > 0
      )
      .sort((a: ServerLeaderboardEntry, b: ServerLeaderboardEntry) => b.score - a.score)
      .slice(0, 100);
  } catch {
    return [];
  }
}

function writeRealLeaderboard(entries: ServerLeaderboardEntry[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const cleaned = entries
      .filter((item) => item && typeof item.id === 'string' && !item.id.startsWith('gl_'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist leaderboard:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // GET /api/leaderboard — returns 100% real player runs
  app.get('/api/leaderboard', (_req, res) => {
    const entries = readRealLeaderboard();
    res.json({ entries });
  });

  // POST /api/leaderboard — records one or more real player runs (supports offline batch sync)
  app.post('/api/leaderboard', (req, res) => {
    const body = req.body;
    const incomingList: ServerLeaderboardEntry[] = Array.isArray(body?.entries)
      ? body.entries
      : body?.entry
      ? [body.entry]
      : [];

    const existing = readRealLeaderboard();
    const byId = new Map<string, ServerLeaderboardEntry>();
    for (const item of existing) {
      byId.set(item.id, item);
    }

    for (const raw of incomingList) {
      if (
        raw &&
        typeof raw.id === 'string' &&
        !raw.id.startsWith('gl_') &&
        typeof raw.score === 'number' &&
        raw.score > 0
      ) {
        byId.set(raw.id, {
          id: String(raw.id).slice(0, 64),
          playerName: String(raw.playerName || 'Ninja_Challenger').trim().slice(0, 24),
          titleBadge: String(raw.titleBadge || 'Dojo Challenger').slice(0, 32),
          score: Math.floor(raw.score),
          maxCombo: Math.max(0, Math.floor(Number(raw.maxCombo) || 0)),
          fruitsSliced: Math.max(0, Math.floor(Number(raw.fruitsSliced) || 0)),
          difficulty: ['apprentice', 'shinobi', 'shogun', 'ronin'].includes(raw.difficulty)
            ? raw.difficulty
            : 'shinobi',
          mode: raw.mode === 'daily' ? 'daily' : 'classic',
          timestamp: Number(raw.timestamp) || Date.now(),
          syncedOnline: true,
        });
      }
    }

    const merged = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
    writeRealLeaderboard(merged);
    res.json({ entries: merged });
  });

  // DELETE /api/leaderboard/:id — allows deleting a specific run if requested
  app.delete('/api/leaderboard/:id', (req, res) => {
    const targetId = req.params.id;
    const existing = readRealLeaderboard().filter((item) => item.id !== targetId);
    writeRealLeaderboard(existing);
    res.json({ entries: existing });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Katana Nectar 3D Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
