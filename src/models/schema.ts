import { pgTable, serial, text, timestamp, boolean, integer, varchar, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const statusEnum = pgEnum('content_status', ['pending', 'processing', 'sent']);
export const emailStatusEnum = pgEnum('email_status', ['pending', 'sent', 'failed']);

export const topics = pgTable('topics', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const subscribers = pgTable('subscribers', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  subscriber_id: integer('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'cascade' }),
  topic_id: integer('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueSubscriberTopic: uniqueIndex('unique_subscriber_topic').on(table.subscriber_id, table.topic_id),
}));

export const content = pgTable('content', {
  id: serial('id').primaryKey(),
  topic_id: integer('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  title: text('title'),
  body: text('body').notNull(),
  scheduled_time: timestamp('scheduled_time').notNull(),
  is_sent: boolean('is_sent').default(false).notNull(),
  status: statusEnum('status').default('pending').notNull(),
  sent_at: timestamp('sent_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  content_id: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  subscriber_id: integer('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'cascade' }),
  status: emailStatusEnum('status').notNull(),
  message_id: varchar('message_id', { length: 255 }),
  error_message: text('error_message'),
  sent_at: timestamp('sent_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueContentSubscriber: uniqueIndex('unique_content_subscriber').on(table.content_id, table.subscriber_id),
}));

export const topicsRelations = relations(topics, ({ many }) => ({
  subscriptions: many(subscriptions),
  content: many(content),
}));

export const subscribersRelations = relations(subscribers, ({ many }) => ({
  subscriptions: many(subscriptions),
  emailLogs: many(emailLogs),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  subscriber: one(subscribers, {
    fields: [subscriptions.subscriber_id],
    references: [subscribers.id],
  }),
  topic: one(topics, {
    fields: [subscriptions.topic_id],
    references: [topics.id],
  }),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  topic: one(topics, {
    fields: [content.topic_id],
    references: [topics.id],
  }),
  emailLogs: many(emailLogs),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  content: one(content, {
    fields: [emailLogs.content_id],
    references: [content.id],
  }),
  subscriber: one(subscribers, {
    fields: [emailLogs.subscriber_id],
    references: [subscribers.id],
  }),
}));
