# API Documentation

All endpoints are prefixed with `/api`.

## GET Endpoints

### Health & Status

#### `GET /api/health`
Check the health status of the service and database connection.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-01-19T10:30:00.000Z"
}
```

**Error Response (503):**
```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "Connection error message"
}
```

---

### Subscribers

#### `GET /api/subscribers`
Retrieve all subscribers with optional filtering for active subscribers only.

**Query Parameters:**
- `active_only` (optional, default: `"true"`): Filter only active subscribers

**Response:**
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "is_active": true,
    "created_at": "2025-01-19T10:30:00.000Z",
    "updated_at": "2025-01-19T10:30:00.000Z"
  }
]
```

#### `GET /api/subscribers/:id`
Retrieve a specific subscriber with their subscribed topics.

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_active": true,
  "created_at": "2025-01-19T10:30:00.000Z",
  "updated_at": "2025-01-19T10:30:00.000Z",
  "topics": [
    {
      "id": 1,
      "name": "Technology"
    }
  ]
}
```

**Error Responses:**
- `404`: Subscriber not found

---

### Topics

#### `GET /api/topics`
Retrieve all topics with their subscriber counts.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Technology",
    "description": "Technology related news",
    "subscriber_count": "10",
    "created_at": "2025-01-19T10:30:00.000Z",
    "updated_at": "2025-01-19T10:30:00.000Z"
  }
]
```

#### `GET /api/topics/:id`
Retrieve a specific topic with its subscriber count.

**Response:**
```json
{
  "id": 1,
  "name": "Technology",
  "description": "Technology related news",
  "subscriber_count": "10",
  "created_at": "2025-01-19T10:30:00.000Z",
  "updated_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `404`: Topic not found

---

### Content

#### `GET /api/content`
Retrieve all newsletter content with statistics and optional filtering.

**Query Parameters:**
- `topicId` (optional): Filter by topic ID
- `status` (optional): Filter by status (pending, processing, sent)
- `limit` (optional, default: `"50"`): Number of results
- `offset` (optional, default: `"0"`): Pagination offset

**Response:**
```json
[
  {
    "id": 1,
    "topic_id": 1,
    "title": "Weekly Tech Update",
    "body": "Content body...",
    "scheduled_time": "2025-01-20T09:00:00.000Z",
    "status": "sent",
    "is_sent": true,
    "topic_name": "Technology",
    "emails_sent": "10",
    "total_subscribers": "10",
    "created_at": "2025-01-19T10:30:00.000Z"
  }
]
```

#### `GET /api/content/:id`
Retrieve specific newsletter content with statistics.

**Response:**
```json
{
  "id": 1,
  "topic_id": 1,
  "title": "Weekly Tech Update",
  "body": "Content body...",
  "scheduled_time": "2025-01-20T09:00:00.000Z",
  "status": "sent",
  "is_sent": true,
  "topic_name": "Technology",
  "emails_sent": "10",
  "total_subscribers": "10",
  "created_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `404`: Content not found

---

### Email Logs

#### `GET /api/email-logs`
Retrieve email logs with optional filtering by content ID and status.

**Query Parameters:**
- `contentId` (optional): Filter by content ID
- `status` (optional): Filter by status (pending, sent, failed)
- `limit` (optional, default: `"100"`): Number of results
- `offset` (optional, default: `"0"`): Pagination offset

**Response:**
```json
[
  {
    "id": 1,
    "content_id": 1,
    "subscriber_id": 1,
    "status": "sent",
    "message_id": "msg-123",
    "email": "user@example.com",
    "content_title": "Weekly Tech Update",
    "sent_at": "2025-01-20T09:00:05.000Z",
    "error_message": null
  }
]
```

#### `GET /api/email-logs/stats/:contentId`
Retrieve email statistics for a specific content item.

**Response:**
```json
{
  "sent_count": "8",
  "failed_count": "1",
  "pending_count": "1",
  "total_count": "10"
}
```

---

## POST Endpoints

### Subscribers

#### `POST /api/subscribers`
Create a new subscriber or update an existing one (upsert by email).

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_active": true,
  "created_at": "2025-01-19T10:30:00.000Z",
  "updated_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `400`: Invalid email format
- `500`: Failed to create subscriber

#### `POST /api/subscribers/:id/subscribe`
Subscribe a subscriber to a topic.

**Request Body:**
```json
{
  "topicId": 1
}
```

**Response (201):**
```json
{
  "id": 1,
  "subscriber_id": 1,
  "topic_id": 1,
  "created_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `400`: Missing topicId
- `404`: Subscriber or topic not found
- `409`: Already subscribed to this topic

---

### Topics

#### `POST /api/topics`
Create a new topic.

**Request Body:**
```json
{
  "name": "Technology",
  "description": "Technology related news and updates"
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Technology",
  "description": "Technology related news and updates",
  "created_at": "2025-01-19T10:30:00.000Z",
  "updated_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `400`: Topic name is required
- `409`: Topic with this name already exists

---

### Content

#### `POST /api/content`
Create new newsletter content with scheduled send time.

**Request Body:**
```json
{
  "topicId": 1,
  "title": "Weekly Tech Update",
  "body": "This is the newsletter content...",
  "scheduledTime": "2025-01-20T09:00:00.000Z"
}
```

**Response (201):**
```json
{
  "id": 1,
  "topic_id": 1,
  "title": "Weekly Tech Update",
  "body": "This is the newsletter content...",
  "scheduled_time": "2025-01-20T09:00:00.000Z",
  "status": "pending",
  "is_sent": false,
  "created_at": "2025-01-19T10:30:00.000Z",
  "updated_at": "2025-01-19T10:30:00.000Z"
}
```

**Error Responses:**
- `400`: Missing required fields or invalid scheduledTime format
- `404`: Topic not found

---

## PATCH Endpoints

### Content

#### `PATCH /api/content/:id`
Update newsletter content (only if not already sent).

**Request Body:**
```json
{
  "title": "Updated Title",
  "body": "Updated content...",
  "scheduledTime": "2025-01-21T09:00:00.000Z"
}
```

**Response:**
```json
{
  "id": 1,
  "topic_id": 1,
  "title": "Updated Title",
  "body": "Updated content...",
  "scheduled_time": "2025-01-21T09:00:00.000Z",
  "status": "pending",
  "is_sent": false
}
```

**Error Responses:**
- `400`: Invalid scheduledTime format or no fields to update
- `404`: Content not found or already sent

---

## DELETE Endpoints

### Subscribers

#### `DELETE /api/subscribers/:id`
Deactivate a subscriber (soft delete).

**Response:**
```json
{
  "message": "Subscriber deactivated successfully",
  "subscriber": {
    "id": 1,
    "email": "user@example.com",
    "is_active": false
  }
}
```

**Error Responses:**
- `404`: Subscriber not found

#### `DELETE /api/subscribers/:id/subscribe/:topicId`
Unsubscribe a subscriber from a topic.

**Response:**
```json
{
  "message": "Unsubscribed successfully"
}
```

**Error Responses:**
- `404`: Subscription not found

---

### Topics

#### `DELETE /api/topics/:id`
Delete a topic.

**Response:**
```json
{
  "message": "Topic deleted successfully"
}
```

**Error Responses:**
- `404`: Topic not found

---

### Content

#### `DELETE /api/content/:id`
Delete newsletter content (only if not already sent).

**Response:**
```json
{
  "message": "Content deleted successfully"
}
```

**Error Responses:**
- `404`: Content not found or already sent
