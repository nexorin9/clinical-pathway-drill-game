import * as fs from 'fs';
import * as path from 'path';

// Load .env file if present
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

export interface Config {
  dbPath: string;
  port: number;
  useLlm: boolean;
  llmApiKey: string;
  defaultPlayer: string;
}

export function getConfig(): Config {
  return {
    dbPath: process.env.DB_PATH || 'data/clinic_paths.db',
    port: parseInt(process.env.PORT || '3000', 10),
    useLlm: process.env.USE_LLM === 'true',
    llmApiKey: process.env.LLM_API_KEY || '',
    defaultPlayer: process.env.DEFAULT_PLAYER || 'player1',
  };
}