import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

export const getAllLogs = async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!fs.existsSync(logDir)) {
      res.status(404).json({ error: 'Log directory not found' });
      return;
    }

    const files = fs.readdirSync(logDir);
    const logFiles = files.filter(file => file.endsWith('.log'));

    const allLogs: any[] = [];

    for (const file of logFiles) {
      const filePath = path.join(logDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          allLogs.push({
            ...logEntry,
            source: file,
          });
        } catch (error) {
          allLogs.push({
            message: line,
            source: file,
            level: 'unknown',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    allLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    res.json({
      total: allLogs.length,
      logs: allLogs,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read logs', message: (error as Error).message });
  }
};

