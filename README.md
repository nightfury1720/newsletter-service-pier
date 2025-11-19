# Newsletter Service

A robust, scalable newsletter service built with Node.js, TypeScript, and PostgreSQL. This service handles newsletter content management, subscriber management, scheduled email delivery, and comprehensive email logging.

## Features

- **Subscriber Management**: Create, manage, and track newsletter subscribers
- **Topic-Based Subscriptions**: Organize newsletters by topics with flexible subscription management
- **Scheduled Email Delivery**: Schedule newsletter content for future delivery
- **Queue-Based Processing**: Asynchronous email processing using Bull queue with Redis
- **Rate Limiting**: Configurable email sending rate to prevent SMTP throttling
- **Email Logging**: Comprehensive tracking of email delivery status and errors
- **Automatic Scheduler**: Cron-based scheduler that processes pending newsletters every minute
- **Database Connection Pooling**: Efficient PostgreSQL connection management
- **Structured Logging**: Winston-based logging with daily rotation
- **Error Handling**: Comprehensive error handling and graceful shutdown
- **Health Checks**: API endpoint for service health monitoring

## Architecture & Design

### System Architecture

```
┌─────────────────┐
│   Express API   │
│   (REST API)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────────┐
│PostgreSQL│ │  Redis   │
│Database  │ │  Queue   │
└─────────┘ └────┬──────┘
                 │
            ┌────▼─────┐
            │  Bull    │
            │ Processor│
            └────┬─────┘
                 │
            ┌────▼─────┐
            │  SMTP    │
            │  Service │
            └──────────┘
```

### Core Components

1. **API Layer** (`src/routes/`, `src/controllers/`)
   - RESTful API endpoints for managing subscribers, topics, content, and email logs
   - Request validation and error handling middleware

2. **Service Layer** (`src/services/`)
   - **EmailService**: Handles SMTP email sending via Nodemailer
   - **QueueProcessor**: Processes email jobs from Bull queue with rate limiting
   - **SchedulerService**: Cron-based service that checks for pending newsletters every minute

3. **Data Layer** (`src/models/`, `src/config/`)
   - Drizzle ORM for type-safe database operations
   - PostgreSQL connection pooling
   - Database schema with relations

4. **Queue System** (`src/config/queue.ts`)
   - Bull queue powered by Redis
   - Job retry logic with exponential backoff
   - Rate limiting to control email sending speed

5. **Logging** (`src/config/logger.ts`)
   - Winston logger with daily log rotation
   - Separate error and combined logs
   - Configurable log levels

### Database Schema

- **topics**: Newsletter topics/categories
- **subscribers**: Email subscribers with active status
- **subscriptions**: Many-to-many relationship between subscribers and topics
- **content**: Newsletter content with scheduling and status tracking
- **email_logs**: Detailed email delivery logs with status and error tracking

### Workflow

1. **Content Creation**: Admin creates newsletter content with a scheduled time
2. **Scheduler**: Cron job (runs every minute) checks for pending content
3. **Queue Processing**: When scheduled time arrives, emails are queued for all active subscribers
4. **Email Delivery**: Queue processor sends emails with rate limiting and retry logic
5. **Status Tracking**: Email logs track delivery status, and content is marked as sent when complete

## Prerequisites

- **Node.js**: v18.x or higher
- **PostgreSQL**: v12.x or higher
- **Redis**: v6.x or higher (required for Bull queue)
- **npm** or **yarn** package manager

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd newsletter-service-pier
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file and configure it:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=8000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://postgres:your-password@localhost:5432/postgres

# Redis Configuration
REDIS_URL=redis://localhost:6379
# OR use individual settings:
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=
# REDIS_TLS=false

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Newsletter Service

# Rate Limiting
EMAILS_PER_SECOND=10

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

### 4. Database Setup

#### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE newsletter_db;

# Exit psql
\q
```

Update your `DATABASE_URL` in `.env` to point to the new database.

#### Run Migrations

```bash
# Generate migration files (if schema changes)
npm run db:generate

# Run migrations
npm run db:migrate
```

#### (Optional) Seed Mock Data

```bash
npm run db:seed
```

### 5. Redis Setup

#### Local Redis Installation

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 redis:latest
```

#### Verify Redis Connection

```bash
npm run test:redis
```

### 6. SMTP Configuration

The service requires SMTP credentials to send emails. Here are some free options:

#### Gmail (500 emails/day)
1. Enable 2-Factor Authentication
2. Generate an App Password: [Google Account Settings](https://myaccount.google.com/apppasswords)
3. Use `smtp.gmail.com:587` with your email and app password

#### Outlook (300 emails/day)
1. Enable 2-Factor Authentication
2. Generate an App Password
3. Use `smtp-mail.outlook.com:587`

#### SendGrid (100 emails/day free)
1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key
3. Use `smtp.sendgrid.net:587` with username `apikey` and your API key as password

#### Mailtrap (Testing - 500 emails/month)
1. Sign up at [Mailtrap](https://mailtrap.io)
2. Use provided SMTP credentials for testing

## Running the Project

### Development Mode

```bash
npm run dev
```

This starts the server with hot-reload using `tsx watch`.

### Production Mode

```bash
# Build TypeScript
npm run build

# Start server
npm start
```

The server will start on `http://localhost:8000` (or your configured PORT).

### Available Scripts

- `npm run dev` - Start development server with hot-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm run type-check` - Type check without building
- `npm run db:generate` - Generate database migration files
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes directly to database
- `npm run db:studio` - Open Drizzle Studio (database GUI)
- `npm run db:seed` - Seed database with mock data
- `npm run test:redis` - Test Redis connection

## API Documentation

The API is documented in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

All endpoints are prefixed with `/api`:

- **Health**: `GET /api/health`
- **Subscribers**: `GET|POST|DELETE /api/subscribers`
- **Topics**: `GET|POST|DELETE /api/topics`
- **Content**: `GET|POST|PATCH|DELETE /api/content`
- **Email Logs**: `GET /api/email-logs`

### Quick Start Example

```bash
# Create a topic
curl -X POST http://localhost:8000/api/topics \
  -H "Content-Type: application/json" \
  -d '{"name": "Technology", "description": "Tech news"}'

# Create a subscriber
curl -X POST http://localhost:8000/api/subscribers \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Subscribe to topic
curl -X POST http://localhost:8000/api/subscribers/1/subscribe \
  -H "Content-Type: application/json" \
  -d '{"topicId": 1}'

# Create newsletter content
curl -X POST http://localhost:8000/api/content \
  -H "Content-Type: application/json" \
  -d '{
    "topicId": 1,
    "title": "Weekly Update",
    "body": "This is the newsletter content...",
    "scheduledTime": "2025-01-20T09:00:00Z"
  }'
```

## Project Structure

```
newsletter-service-pier/
├── src/
│   ├── app.ts                 # Express app entry point
│   ├── config/
│   │   ├── database.ts        # Database connection (re-export)
│   │   ├── drizzle.ts         # Drizzle ORM setup
│   │   ├── logger.ts          # Winston logger configuration
│   │   └── queue.ts           # Bull queue configuration
│   ├── controllers/           # Request handlers
│   │   ├── contentController.ts
│   │   ├── emailLogController.ts
│   │   ├── healthController.ts
│   │   ├── subscriberController.ts
│   │   └── topicController.ts
│   ├── middleware/
│   │   └── errorHandler.ts    # Error handling middleware
│   ├── models/
│   │   └── schema.ts          # Drizzle schema definitions
│   ├── routes/                # API route definitions
│   │   ├── index.ts
│   │   ├── contentRoutes.ts
│   │   ├── emailLogRoutes.ts
│   │   ├── subscriberRoutes.ts
│   │   └── topicRoutes.ts
│   ├── services/              # Business logic
│   │   ├── emailService.ts    # SMTP email service
│   │   ├── queueProcessor.ts  # Bull queue job processor
│   │   └── schedulerService.ts # Cron scheduler
│   └── utils/
│       ├── migrate.ts         # Database migration utility
│       └── seedMockData.ts    # Database seeding utility
├── drizzle/                   # Migration files
├── logs/                      # Application logs
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── env.example
└── README.md
```

## Technologies Used

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: Bull (Redis-based)
- **Email**: Nodemailer
- **Scheduling**: node-cron
- **Logging**: Winston with daily-rotate-file
- **Validation**: Zod
- **Development**: tsx (TypeScript execution)

## Configuration Details

### Rate Limiting

The `EMAILS_PER_SECOND` environment variable controls how many emails are sent per second. This helps prevent:
- SMTP provider rate limiting
- Overwhelming the email service
- Network congestion

Default: 10 emails/second

### Queue Configuration

- **Concurrency**: 10 jobs processed simultaneously
- **Retry Logic**: 3 attempts with exponential backoff
- **Job Timeout**: Configurable per job

### Logging

Logs are stored in the `./logs` directory:
- `combined-YYYY-MM-DD.log`: All logs
- `error-YYYY-MM-DD.log`: Error logs only

Log level can be configured via `LOG_LEVEL` (debug, info, warn, error).

## Troubleshooting

### Database Connection Issues

```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check DATABASE_URL format
# Should be: postgresql://user:password@host:port/database
```

### Redis Connection Issues

```bash
# Test Redis connection
npm run test:redis

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### SMTP Connection Issues

- Verify SMTP credentials are correct
- For Gmail, ensure App Password is used (not regular password)
- Check firewall/network restrictions
- Verify SMTP port (587 for TLS, 465 for SSL)

### Queue Not Processing

- Ensure Redis is running and accessible
- Check queue processor logs for errors
- Verify `EMAILS_PER_SECOND` is set correctly
- Check if jobs are being added to the queue

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and questions, please open an issue on the repository.

