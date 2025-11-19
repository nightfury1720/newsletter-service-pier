import 'dotenv/config';
import db from '../config/database.js';
import { subscribers, subscriptions, topics, content } from '../models/schema.js';
import { eq } from 'drizzle-orm';
import logger from '../config/logger.js';

async function seedMockData() {
  try {
    logger.info('Starting mock data seeding...');

    // 1. Create or get topics
    logger.info('Creating topics...');
    
    // Shared topic that both subscribers will subscribe to
    let sharedTopicId: number;
    try {
      const [sharedTopic] = await db.insert(topics).values({
        name: 'Technology News',
        description: 'Latest technology updates and innovations',
      }).returning();
      sharedTopicId = sharedTopic.id;
      logger.info('Created shared topic', { id: sharedTopicId, name: sharedTopic.name });
    } catch (error: any) {
      if (error.code === '23505') {
        const existing = await db.select().from(topics).where(eq(topics.name, 'Technology News')).limit(1);
        sharedTopicId = existing[0].id;
        logger.info('Found existing shared topic', { id: sharedTopicId, name: existing[0].name });
      } else {
        throw error;
      }
    }

    // Topic for first subscriber (akd18@iitbbs.ac.in)
    let topic1Id: number;
    try {
      const [topic1] = await db.insert(topics).values({
        name: 'Academic Research',
        description: 'Academic research papers and educational content',
      }).returning();
      topic1Id = topic1.id;
      logger.info('Created topic for subscriber 1', { id: topic1Id, name: topic1.name });
    } catch (error: any) {
      if (error.code === '23505') {
        const existing = await db.select().from(topics).where(eq(topics.name, 'Academic Research')).limit(1);
        topic1Id = existing[0].id;
        logger.info('Found existing topic for subscriber 1', { id: topic1Id, name: existing[0].name });
      } else {
        throw error;
      }
    }

    // Topic for second subscriber (surajguava@gmail.com)
    let topic2Id: number;
    try {
      const [topic2] = await db.insert(topics).values({
        name: 'Startup & Entrepreneurship',
        description: 'Startup news, funding, and entrepreneurship insights',
      }).returning();
      topic2Id = topic2.id;
      logger.info('Created topic for subscriber 2', { id: topic2Id, name: topic2.name });
    } catch (error: any) {
      if (error.code === '23505') {
        const existing = await db.select().from(topics).where(eq(topics.name, 'Startup & Entrepreneurship')).limit(1);
        topic2Id = existing[0].id;
        logger.info('Found existing topic for subscriber 2', { id: topic2Id, name: existing[0].name });
      } else {
        throw error;
      }
    }

    // Additional topics for more content
    let topic3Id: number;
    try {
      const [topic3] = await db.insert(topics).values({
        name: 'Web Development',
        description: 'Frontend, backend, and full-stack development news',
      }).returning();
      topic3Id = topic3.id;
      logger.info('Created additional topic', { id: topic3Id, name: topic3.name });
    } catch (error: any) {
      if (error.code === '23505') {
        const existing = await db.select().from(topics).where(eq(topics.name, 'Web Development')).limit(1);
        topic3Id = existing[0].id;
        logger.info('Found existing additional topic', { id: topic3Id, name: existing[0].name });
      } else {
        throw error;
      }
    }

    let topic4Id: number;
    try {
      const [topic4] = await db.insert(topics).values({
        name: 'Data Science',
        description: 'Machine learning, AI, and data analytics',
      }).returning();
      topic4Id = topic4.id;
      logger.info('Created additional topic', { id: topic4Id, name: topic4.name });
    } catch (error: any) {
      if (error.code === '23505') {
        const existing = await db.select().from(topics).where(eq(topics.name, 'Data Science')).limit(1);
        topic4Id = existing[0].id;
        logger.info('Found existing additional topic', { id: topic4Id, name: existing[0].name });
      } else {
        throw error;
      }
    }

    // 2. Create subscribers
    logger.info('Creating subscribers...');
    const [subscriber1] = await db.insert(subscribers).values({
      email: 'akd18@iitbbs.ac.in',
      is_active: true,
    }).onConflictDoUpdate({
      target: subscribers.email,
      set: { is_active: true },
    }).returning();

    logger.info('Created/found subscriber 1', { id: subscriber1.id, email: subscriber1.email });

    const [subscriber2] = await db.insert(subscribers).values({
      email: 'surajguava@gmail.com',
      is_active: true,
    }).onConflictDoUpdate({
      target: subscribers.email,
      set: { is_active: true },
    }).returning();

    logger.info('Created/found subscriber 2', { id: subscriber2.id, email: subscriber2.email });

    // 3. Create subscriptions
    logger.info('Creating subscriptions...');
    
    // Both subscribe to shared topic (Technology News)
    try {
      await db.insert(subscriptions).values({
        subscriber_id: subscriber1.id,
        topic_id: sharedTopicId,
      });
      logger.info('Subscriber 1 subscribed to shared topic (Technology News)');
    } catch (error: any) {
      if (error.code !== '23505') {
        throw error;
      }
    }

    try {
      await db.insert(subscriptions).values({
        subscriber_id: subscriber2.id,
        topic_id: sharedTopicId,
      });
      logger.info('Subscriber 2 subscribed to shared topic (Technology News)');
    } catch (error: any) {
      if (error.code !== '23505') {
        throw error;
      }
    }

    // Subscriber 1 subscribes to Academic Research
    try {
      await db.insert(subscriptions).values({
        subscriber_id: subscriber1.id,
        topic_id: topic1Id,
      });
      logger.info('Subscriber 1 subscribed to Academic Research');
    } catch (error: any) {
      if (error.code !== '23505') {
        throw error;
      }
    }

    // Subscriber 2 subscribes to Startup & Entrepreneurship
    try {
      await db.insert(subscriptions).values({
        subscriber_id: subscriber2.id,
        topic_id: topic2Id,
      });
      logger.info('Subscriber 2 subscribed to Startup & Entrepreneurship');
    } catch (error: any) {
      if (error.code !== '23505') {
        throw error;
      }
    }

    // 4. Create content (all unsent - is_sent = false)
    logger.info('Creating unsent content...');
    
    const futureDate1 = new Date();
    futureDate1.setHours(futureDate1.getHours() + 2);

    const futureDate2 = new Date();
    futureDate2.setHours(futureDate2.getHours() + 5);

    const futureDate3 = new Date();
    futureDate3.setDate(futureDate3.getDate() + 1);

    const futureDate4 = new Date();
    futureDate4.setDate(futureDate4.getDate() + 2);

    // Content for shared topic (Technology News)
    const [content1] = await db.insert(content).values({
      topic_id: sharedTopicId,
      title: 'Latest AI Breakthroughs in 2025',
      body: 'This newsletter covers the most recent developments in artificial intelligence, including new model architectures, breakthrough applications, and industry updates.',
      scheduled_time: futureDate1,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 1 for shared topic', { id: content1.id, title: content1.title });

    const [content2] = await db.insert(content).values({
      topic_id: sharedTopicId,
      title: 'Tech Industry Trends Report',
      body: 'A comprehensive report on emerging trends in the technology sector, covering cloud computing, cybersecurity, and digital transformation.',
      scheduled_time: futureDate3,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 2 for shared topic', { id: content2.id, title: content2.title });

    // Content for Academic Research topic
    const [content3] = await db.insert(content).values({
      topic_id: topic1Id,
      title: 'Research Papers of the Month',
      body: 'Curated selection of groundbreaking research papers published this month across various academic disciplines.',
      scheduled_time: futureDate2,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 3 for Academic Research', { id: content3.id, title: content3.title });

    // Content for Startup & Entrepreneurship topic
    const [content4] = await db.insert(content).values({
      topic_id: topic2Id,
      title: 'Startup Funding Roundup',
      body: 'Weekly digest of startup funding news, including seed rounds, Series A-B-C funding, and notable acquisitions in the startup ecosystem.',
      scheduled_time: futureDate2,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 4 for Startup & Entrepreneurship', { id: content4.id, title: content4.title });

    // Content for Web Development topic
    const [content5] = await db.insert(content).values({
      topic_id: topic3Id,
      title: 'Modern Web Development Tools',
      body: 'Explore the latest tools, frameworks, and best practices in modern web development, including React, Next.js, and performance optimization techniques.',
      scheduled_time: futureDate4,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 5 for Web Development', { id: content5.id, title: content5.title });

    // Content for Data Science topic
    const [content6] = await db.insert(content).values({
      topic_id: topic4Id,
      title: 'Data Science Insights',
      body: 'Latest insights into machine learning algorithms, data visualization techniques, and real-world applications of data science.',
      scheduled_time: futureDate4,
      is_sent: false,
      status: 'pending',
    }).returning();

    logger.info('Created content 6 for Data Science', { id: content6.id, title: content6.title });

    logger.info('Mock data seeding completed successfully!');
    logger.info('Summary:');
    logger.info(`- Subscribers: ${subscriber1.email}, ${subscriber2.email}`);
    logger.info(`- Topics: ${sharedTopicId} (shared), ${topic1Id}, ${topic2Id}, ${topic3Id}, ${topic4Id}`);
    logger.info(`- Content items: 6 (all unsent)`);
  } catch (error) {
    logger.error('Error seeding mock data', { error: (error as Error).message });
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedMockData()
    .then(() => {
      logger.info('Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding process failed', { error: (error as Error).message });
      process.exit(1);
    });
}

export { seedMockData };

