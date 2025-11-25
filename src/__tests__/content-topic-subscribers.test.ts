// This test file uses ONLY API calls for all data operations (topics, subscribers, content, subscriptions)
// No direct database connections are used - all operations go through HTTP endpoints
const BASE_URL = 'https://newsletter-service-pier.onrender.com';

function getScheduledTimeForIST(hour: number, minute: number): string {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const istDateStr = istFormatter.format(now);
  const [year, month, day] = istDateStr.split('-').map(Number);
  
  const istDateTime = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`);
  
  let utcTime = new Date(istDateTime);
  
  if (utcTime <= now) {
    utcTime = new Date(utcTime.getTime() + 24 * 60 * 60 * 1000);
  }
  
  return utcTime.toISOString();
}

function getScheduledTimeForSpecificDateIST(year: number, month: number, day: number, hour: number, minute: number): string {
  const istDateTime = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`);
  return istDateTime.toISOString();
}

async function makeRequest(method: string, endpoint: string, body?: any, timeout: number = 30000) {
  const url = `${BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    const data = await response.json() as any;
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${JSON.stringify(data)}`);
    }
    
    return { status: response.status, body: data as any };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${method} ${endpoint}`);
    }
    throw error;
  }
}

describe('Content, Topic, and Subscribers Integration Test', () => {
  let topic1Id: number;
  let topic2Id: number;
  let topic3Id: number;
  let skdSubscriberId: number;
  let surajSubscriberId: number;
  const timestamp = Date.now();
  const skdEmail = 'skd18@iitbbs.ac.in';
  const surajEmail = 'surajguava@gmail.com';

  test('should clear all existing data from database and queue', async () => {
    try {
      const contentResponse = await makeRequest('GET', '/api/content');
      if (contentResponse.body && Array.isArray(contentResponse.body)) {
        for (const content of contentResponse.body) {
          await makeRequest('DELETE', `/api/content/${content.id}`).catch(() => {});
        }
      }
    } catch (error) {
      // Ignore errors if no content exists
    }

    try {
      const topicsResponse = await makeRequest('GET', '/api/topics');
      if (topicsResponse.body && Array.isArray(topicsResponse.body)) {
        for (const topic of topicsResponse.body) {
          await makeRequest('DELETE', `/api/topics/${topic.id}`).catch(() => {});
        }
      }
    } catch (error) {
      // Ignore errors if no topics exist
    }

    try {
      const subscribersResponse = await makeRequest('GET', '/api/subscribers');
      if (subscribersResponse.body && Array.isArray(subscribersResponse.body)) {
        for (const subscriber of subscribersResponse.body) {
          await makeRequest('DELETE', `/api/subscribers/${subscriber.id}`).catch(() => {});
        }
      }
    } catch (error) {
      // Ignore errors if no subscribers exist
    }
  });

  test('should create subscribers', async () => {
    const skdResponse = await makeRequest('POST', '/api/subscribers', { email: skdEmail });
    expect(skdResponse.status).toBe(201);
    expect(skdResponse.body).toHaveProperty('id');
    expect(skdResponse.body.email).toBe(skdEmail.toLowerCase());
    skdSubscriberId = skdResponse.body.id;

    const surajResponse = await makeRequest('POST', '/api/subscribers', { email: surajEmail });
    expect(surajResponse.status).toBe(201);
    expect(surajResponse.body).toHaveProperty('id');
    expect(surajResponse.body.email).toBe(surajEmail.toLowerCase());
    surajSubscriberId = surajResponse.body.id;
  });

  test('should create 3 topics: topic_1 (only for skd18), topic_2 (only for surajguava), topic_3 (for both)', async () => {
    const topic1Response = await makeRequest('POST', '/api/topics', {
      name: `topic_1_${timestamp}`,
      description: 'Topic 1 - Only for skd18',
    });
    expect(topic1Response.status).toBe(201);
    expect(topic1Response.body).toHaveProperty('id');
    topic1Id = topic1Response.body.id;

    const topic2Response = await makeRequest('POST', '/api/topics', {
      name: `topic_2_${timestamp}`,
      description: 'Topic 2 - Only for surajguava',
    });
    expect(topic2Response.status).toBe(201);
    expect(topic2Response.body).toHaveProperty('id');
    topic2Id = topic2Response.body.id;

    const topic3Response = await makeRequest('POST', '/api/topics', {
      name: `topic_3_${timestamp}`,
      description: 'Topic 3 - For both subscribers',
    });
    expect(topic3Response.status).toBe(201);
    expect(topic3Response.body).toHaveProperty('id');
    topic3Id = topic3Response.body.id;
  });

  test('should subscribe skd18 to topic_1 and topic_3', async () => {
    const skdTopic1Response = await makeRequest('POST', `/api/subscribers/${skdSubscriberId}/subscribe`, {
      topicId: topic1Id,
    });
    expect([200, 201]).toContain(skdTopic1Response.status);

    const skdTopic3Response = await makeRequest('POST', `/api/subscribers/${skdSubscriberId}/subscribe`, {
      topicId: topic3Id,
    });
    expect([200, 201]).toContain(skdTopic3Response.status);
  });

  test('should subscribe surajguava to topic_2 and topic_3', async () => {
    const surajTopic2Response = await makeRequest('POST', `/api/subscribers/${surajSubscriberId}/subscribe`, {
      topicId: topic2Id,
    });
    expect([200, 201]).toContain(surajTopic2Response.status);

    const surajTopic3Response = await makeRequest('POST', `/api/subscribers/${surajSubscriberId}/subscribe`, {
      topicId: topic3Id,
    });
    expect([200, 201]).toContain(surajTopic3Response.status);
  });

  test('should schedule 3 emails for each topic at 1:40 PM IST', async () => {
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    const istDateStr = istFormatter.format(now);
    const [year, month, day] = istDateStr.split('-').map(Number);
    
    const scheduledTime = getScheduledTimeForSpecificDateIST(year, month, day, 13, 40);

    const topics = [
      { id: topic1Id, name: 'topic_1', emails: [
        { title: 'Topic 1 Email 1', body: 'First email for topic 1' },
        { title: 'Topic 1 Email 2', body: 'Second email for topic 1' },
        { title: 'Topic 1 Email 3', body: 'Third email for topic 1' },
      ]},
      { id: topic2Id, name: 'topic_2', emails: [
        { title: 'Topic 2 Email 1', body: 'First email for topic 2' },
        { title: 'Topic 2 Email 2', body: 'Second email for topic 2' },
        { title: 'Topic 2 Email 3', body: 'Third email for topic 2' },
      ]},
      { id: topic3Id, name: 'topic_3', emails: [
        { title: 'Topic 3 Email 1', body: 'First email for topic 3' },
        { title: 'Topic 3 Email 2', body: 'Second email for topic 3' },
        { title: 'Topic 3 Email 3', body: 'Third email for topic 3' },
      ]},
    ];

    for (const topic of topics) {
      for (const email of topic.emails) {
        const response = await makeRequest('POST', '/api/content', {
          topicId: topic.id,
          title: email.title,
          body: email.body,
          scheduledTime: scheduledTime,
        });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.topic_id).toBe(topic.id);
        expect(response.body.title).toBe(email.title);
        expect(response.body.is_sent).toBe(false);
        expect(response.body.status).toBe('pending');
      }
    }
  });
});
