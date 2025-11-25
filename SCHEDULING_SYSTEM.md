# Newsletter Scheduling System Documentation

## Overview

This document explains how the newsletter scheduling system works, including where scheduled times are stored, when jobs are added to the queue, and when they are processed.

## Architecture Flow

```
Content Creation (API) → Database Storage → Scheduler Service (Cron) → Queue (Bull/Redis) → Queue Processor → Email Service
```

## 1. Scheduled Time Storage

### Database Schema
- **Table**: `content`
- **Column**: `scheduled_time` (timestamp, NOT NULL)
- **Location**: `src/models/schema.ts` (line 34)

```typescript
scheduled_time: timestamp('scheduled_time').notNull()
```

### How It's Stored
When content is created via the API (`POST /api/content`):
1. The `scheduledTime` is sent in the request body (ISO 8601 format)
2. It's validated and converted to a Date object
3. Stored in the `content` table's `scheduled_time` column
4. Content status is set to `'pending'` by default

**File**: `src/controllers/contentController.ts` (lines 32-69)

## 2. When Jobs Are Added to Queue

### Automatic Scheduler Service
- **File**: `src/services/schedulerService.ts`
- **Frequency**: Runs **every minute** via cron job (`* * * * *`)
- **Trigger**: Automatic (not manual)

### Process Flow

1. **Cron Job Execution** (line 14):
   ```typescript
   cron.schedule('* * * * *', async () => {
     await this.processPendingContent();
   });
   ```

2. **Query Pending Content** (lines 40-53):
   - Finds content where:
     - `scheduled_time <= now` (time has arrived or passed)
     - `is_sent = false` (not yet sent)
     - `status = 'pending'` (not yet processed)
   - Limits to 10 items per run

3. **Update Status** (lines 76-84):
   - Changes content status from `'pending'` to `'processing'`
   - Prevents duplicate processing

4. **Get Active Subscribers** (lines 88-102):
   - Queries all active subscribers subscribed to the content's topic
   - Only includes subscribers with `is_active = true`

5. **Add Jobs to Queue** (lines 131-149):
   - For each active subscriber, adds a job to the Bull queue
   - Job type: `'send-newsletter'`
   - Job data includes: `contentId`, `subscriberId`, `subscriberEmail`, `title`, `body`
   - Retry configuration: 3 attempts with exponential backoff

### Key Points
- ✅ **Automatic**: No manual intervention needed
- ✅ **Runs every minute**: Checks for due content continuously
- ✅ **Batch processing**: Processes up to 10 content items per minute
- ✅ **Idempotent**: Status update prevents duplicate processing

## 3. When Jobs Are Processed

### Queue Processor
- **File**: `src/services/queueProcessor.ts`
- **Concurrency**: 10 jobs processed simultaneously
- **Rate Limiting**: Configurable via `EMAILS_PER_SECOND` env variable (default: 10)

### Process Flow

1. **Job Processing** (line 30):
   ```typescript
   emailQueue.process('send-newsletter', 10, async (job) => {
     // Process email job
   });
   ```

2. **Rate Limiting** (lines 18-28):
   - Ensures emails are sent at a controlled rate
   - Prevents SMTP throttling
   - Calculates delay between emails based on `EMAILS_PER_SECOND`

3. **Email Sending** (lines 46-50):
   - Calls `emailService.sendEmail()`
   - Sends actual email via SMTP

4. **Logging** (lines 54-67):
   - Creates entry in `email_logs` table
   - Status: `'sent'` or `'failed'`
   - Stores `message_id` and `sent_at` timestamp

5. **Completion Tracking** (lines 113-127):
   - After each email is sent, checks if all subscribers have been notified
   - When all emails are sent, updates content:
     - `is_sent = true`
     - `status = 'sent'`
     - `sent_at = current timestamp`

### Key Points
- ✅ **Immediate processing**: Jobs are processed as soon as they're added to the queue
- ✅ **Concurrent**: Up to 10 emails processed simultaneously
- ✅ **Rate limited**: Prevents overwhelming SMTP server
- ✅ **Retry logic**: Failed jobs retry up to 3 times with exponential backoff
- ✅ **Automatic completion**: Content marked as sent when all subscribers are notified

## 4. Is It Manual?

**No, the entire process is automatic:**

1. **Content Creation**: Manual (via API)
2. **Scheduling Check**: **Automatic** (cron runs every minute)
3. **Queue Addition**: **Automatic** (when scheduled time arrives)
4. **Email Processing**: **Automatic** (queue processor runs continuously)
5. **Status Updates**: **Automatic** (after emails are sent)

## Timeline Example

Let's say you create content scheduled for **1:00 PM IST**:

1. **1:00 PM**: Content created, stored with `scheduled_time = 1:00 PM`, `status = 'pending'`
2. **1:00 PM - 1:01 PM**: Scheduler runs at 1:01 PM, finds content (scheduled_time <= now)
3. **1:01 PM**: Scheduler updates status to `'processing'` and adds jobs to queue
4. **1:01 PM**: Queue processor immediately starts processing jobs (up to 10 concurrent)
5. **1:01 PM - 1:02 PM**: Emails are sent with rate limiting
6. **1:02 PM**: When all emails sent, content status updated to `'sent'`, `is_sent = true`

## Configuration

### Environment Variables
- `EMAILS_PER_SECOND`: Rate limiting (default: 10)
- `REDIS_URL`: Redis connection for queue
- `DATABASE_URL`: PostgreSQL connection

### Scheduler Settings
- **Cron**: `* * * * *` (every minute)
- **Batch Size**: 10 content items per run
- **Concurrency**: 10 simultaneous email jobs

## Files Involved

1. **Schema**: `src/models/schema.ts` - Database schema definition
2. **Content Controller**: `src/controllers/contentController.ts` - API endpoint for creating content
3. **Scheduler Service**: `src/services/schedulerService.ts` - Cron job that checks and queues content
4. **Queue Processor**: `src/services/queueProcessor.ts` - Processes email jobs from queue
5. **Queue Config**: `src/config/queue.ts` - Bull queue configuration
6. **Email Service**: `src/services/emailService.ts` - SMTP email sending

## Summary

- **Scheduled time stored in**: `content.scheduled_time` column (PostgreSQL)
- **Jobs added to queue**: Automatically by scheduler service (runs every minute)
- **Jobs processed**: Automatically by queue processor (immediately after being added)
- **Is it manual?**: No, fully automatic after content creation

