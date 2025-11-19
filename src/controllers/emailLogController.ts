import { Request, Response } from 'express';
import { eq, desc, and, count } from 'drizzle-orm';
import db from '../config/database.js';
import { emailLogs, subscribers, content } from '../models/schema.js';
import logger from '../config/logger.js';

export const getEmailLogs = async (req: Request, res: Response): Promise<void> => {
  const { contentId, status, limit = '100', offset = '0' } = req.query;

  try {
    const conditions = [];
    if (contentId) {
      conditions.push(eq(emailLogs.content_id, parseInt(contentId as string)));
    }
    if (status) {
      conditions.push(eq(emailLogs.status, status as 'pending' | 'sent' | 'failed'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select({
        emailLog: emailLogs,
        subscriber: {
          email: subscribers.email,
        },
        contentItem: {
          title: content.title,
        },
      })
      .from(emailLogs)
      .leftJoin(subscribers, eq(emailLogs.subscriber_id, subscribers.id))
      .leftJoin(content, eq(emailLogs.content_id, content.id))
      .where(whereClause)
      .orderBy(desc(emailLogs.sent_at))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const logsWithDetails = logs.map((log: any) => ({
      ...log.emailLog,
      email: log.subscriber?.email || null,
      content_title: log.contentItem?.title || null,
    }));

    res.json(logsWithDetails);
  } catch (error) {
    logger.error('Error fetching email logs', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
};

export const getEmailStats = async (req: Request, res: Response): Promise<void> => {
  const { contentId } = req.params;

  try {
    const [sentResult, failedResult, pendingResult, totalResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(and(
          eq(emailLogs.content_id, parseInt(contentId)),
          eq(emailLogs.status, 'sent')
        )),
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(and(
          eq(emailLogs.content_id, parseInt(contentId)),
          eq(emailLogs.status, 'failed')
        )),
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(and(
          eq(emailLogs.content_id, parseInt(contentId)),
          eq(emailLogs.status, 'pending')
        )),
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(eq(emailLogs.content_id, parseInt(contentId))),
    ]);

    res.json({
      sent_count: (sentResult[0]?.count || 0).toString(),
      failed_count: (failedResult[0]?.count || 0).toString(),
      pending_count: (pendingResult[0]?.count || 0).toString(),
      total_count: (totalResult[0]?.count || 0).toString(),
    });
  } catch (error) {
    logger.error('Error fetching email stats', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch email stats' });
  }
};
