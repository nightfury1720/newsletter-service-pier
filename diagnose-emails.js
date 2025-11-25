import 'dotenv/config';
import postgres from 'postgres';
import Queue from 'bull';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

if (!REDIS_URL) {
  console.error('REDIS_URL not set');
  process.exit(1);
}

async function diagnose() {
  console.log('=== DIAGNOSING EMAIL ISSUE ===\n');

  // Connect to Postgres
  const sql = postgres(DATABASE_URL);
  
  try {
    // Check content status
    console.log('1. CHECKING CONTENT STATUS:');
    console.log('─'.repeat(50));
    const contents = await sql`
      SELECT 
        id,
        topic_id,
        title,
        scheduled_time,
        is_sent,
        status,
        sent_at,
        created_at
      FROM content
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    if (contents.length === 0) {
      console.log('No content found in database\n');
    } else {
      console.log(`Found ${contents.length} content items:\n`);
      contents.forEach(c => {
        console.log(`  ID: ${c.id}`);
        console.log(`  Topic ID: ${c.topic_id}`);
        console.log(`  Title: ${c.title}`);
        console.log(`  Scheduled: ${c.scheduled_time}`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Is Sent: ${c.is_sent}`);
        console.log(`  Sent At: ${c.sent_at || 'N/A'}`);
        console.log(`  Created: ${c.created_at}`);
        console.log('');
      });
    }

    // Check email logs
    console.log('\n2. CHECKING EMAIL LOGS:');
    console.log('─'.repeat(50));
    const emailLogs = await sql`
      SELECT 
        id,
        content_id,
        subscriber_id,
        status,
        message_id,
        error_message,
        sent_at,
        created_at
      FROM email_logs
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    if (emailLogs.length === 0) {
      console.log('No email logs found\n');
    } else {
      console.log(`Found ${emailLogs.length} email logs:\n`);
      emailLogs.forEach(log => {
        console.log(`  ID: ${log.id}`);
        console.log(`  Content ID: ${log.content_id}`);
        console.log(`  Subscriber ID: ${log.subscriber_id}`);
        console.log(`  Status: ${log.status}`);
        console.log(`  Message ID: ${log.message_id || 'N/A'}`);
        console.log(`  Error: ${log.error_message || 'N/A'}`);
        console.log(`  Sent At: ${log.sent_at || 'N/A'}`);
        console.log('');
      });
    }

    // Check subscriptions
    console.log('\n3. CHECKING SUBSCRIPTIONS:');
    console.log('─'.repeat(50));
    const subscriptions = await sql`
      SELECT 
        s.subscriber_id,
        s.topic_id,
        s.created_at,
        sub.email as subscriber_email,
        t.name as topic_name
      FROM subscriptions s
      JOIN subscribers sub ON s.subscriber_id = sub.id
      JOIN topics t ON s.topic_id = t.id
      ORDER BY s.created_at DESC
    `;
    
    if (subscriptions.length === 0) {
      console.log('No subscriptions found\n');
    } else {
      console.log(`Found ${subscriptions.length} subscriptions:\n`);
      subscriptions.forEach(sub => {
        console.log(`  Subscriber: ${sub.subscriber_email} (ID: ${sub.subscriber_id})`);
        console.log(`  Topic: ${sub.topic_name} (ID: ${sub.topic_id})`);
        console.log('');
      });
    }

    // Check pending content that should have been sent
    console.log('\n4. CHECKING PENDING CONTENT (should have been sent):');
    console.log('─'.repeat(50));
    const now = new Date();
    const pending = await sql`
      SELECT 
        id,
        topic_id,
        title,
        scheduled_time,
        status,
        is_sent,
        EXTRACT(EPOCH FROM (${now} - scheduled_time)) as seconds_overdue
      FROM content
      WHERE scheduled_time <= ${now}
        AND is_sent = false
        AND status IN ('pending', 'processing')
      ORDER BY scheduled_time ASC
    `;
    
    if (pending.length === 0) {
      console.log('No pending content that should have been sent\n');
    } else {
      console.log(`Found ${pending.length} pending content items:\n`);
      pending.forEach(c => {
        console.log(`  ID: ${c.id}`);
        console.log(`  Topic ID: ${c.topic_id}`);
        console.log(`  Title: ${c.title}`);
        console.log(`  Scheduled: ${c.scheduled_time}`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Overdue by: ${Math.round(c.seconds_overdue)} seconds`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error querying Postgres:', error);
  }

  // Check Redis Queue
  console.log('\n5. CHECKING REDIS QUEUE:');
  console.log('─'.repeat(50));
  
  try {
    const getRedisConfig = () => {
      if (REDIS_URL.startsWith('rediss://')) {
        const urlObj = new URL(REDIS_URL);
        return {
          redis: {
            host: urlObj.hostname,
            port: parseInt(urlObj.port || '6379'),
            password: urlObj.password || undefined,
            username: urlObj.username || undefined,
            tls: {},
            connectTimeout: 10000,
            lazyConnect: true,
          },
        };
      }
      return { 
        redis: REDIS_URL,
        settings: {
          stalledInterval: 300000,
          maxStalledCount: 1,
        },
      };
    };

    const emailQueue = new Queue('email-queue', getRedisConfig());
    
    // Wait for connection with timeout
    try {
      await Promise.race([
        new Promise((resolve) => {
          emailQueue.on('ready', resolve);
          if (emailQueue.client && emailQueue.client.status === 'ready') {
            resolve();
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
    } catch (error) {
      console.log('Warning: Could not verify Redis connection:', error.message);
    }

    const queueKey = 'bull:email-queue';
    
    // Query Redis directly through Bull's client if available
    try {
      const client = emailQueue.client;
      if (client) {
        console.log('Querying Redis directly via Bull client...\n');
        const keys = await client.keys(`${queueKey}:*`);
        console.log(`Found ${keys.length} Redis keys for queue '${queueKey}'\n`);
      }
    } catch (error) {
      console.log('Could not query Redis keys:', error.message);
    }
    
    // Get queue counts using Bull's methods (these query Redis internally)
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      emailQueue.getWaiting(),
      emailQueue.getActive(),
      emailQueue.getCompleted(),
      emailQueue.getFailed(),
      emailQueue.getDelayed(),
    ]);

    console.log('Queue Status (via Bull API):');
    console.log(`  Waiting jobs: ${waiting.length}`);
    console.log(`  Active jobs: ${active.length}`);
    console.log(`  Completed jobs: ${completed.length}`);
    console.log(`  Failed jobs: ${failed.length}`);
    console.log(`  Delayed jobs: ${delayed.length}\n`);
    
    // Query Redis directly for more details
    try {
      const client = emailQueue.client;
      if (client) {
        const waitingCount = await client.llen(`${queueKey}:wait`);
        const activeCount = await client.llen(`${queueKey}:active`);
        const delayedCount = await client.zcard(`${queueKey}:delayed`);
        const failedCount = await client.zcard(`${queueKey}:failed`);
        const completedCount = await client.zcard(`${queueKey}:completed`);
        
        console.log('Queue Status (direct Redis query):');
        console.log(`  Waiting (list): ${waitingCount}`);
        console.log(`  Active (list): ${activeCount}`);
        console.log(`  Delayed (sorted set): ${delayedCount}`);
        console.log(`  Failed (sorted set): ${failedCount}`);
        console.log(`  Completed (sorted set): ${completedCount}\n`);
      }
    } catch (redisError) {
      console.log('Could not query Redis directly:', redisError.message);
    }

    if (waiting.length > 0) {
      console.log('Waiting jobs:');
      waiting.slice(0, 5).forEach(job => {
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Content ID: ${job.data.contentId}`);
        console.log(`  Subscriber: ${job.data.subscriberEmail}`);
        console.log(`  Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log('');
      });
    }

    if (active.length > 0) {
      console.log('Active jobs:');
      active.slice(0, 5).forEach(job => {
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Content ID: ${job.data.contentId}`);
        console.log(`  Subscriber: ${job.data.subscriberEmail}`);
        console.log(`  Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log('');
      });
    }

    if (failed.length > 0) {
      console.log('Failed jobs (last 5):');
      failed.slice(0, 5).forEach(job => {
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Content ID: ${job.data.contentId}`);
        console.log(`  Subscriber: ${job.data.subscriberEmail}`);
        console.log(`  Error: ${job.failedReason}`);
        console.log(`  Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log('');
      });
    }

    await emailQueue.close();
  } catch (error) {
    console.error('Error querying Redis:', error);
  }

  await sql.end();
  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

diagnose().catch(console.error);

