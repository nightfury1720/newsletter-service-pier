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
  let createdTopicId: number;
  let skdSubscriberId: number;
  let surajSubscriberId: number;
  const timestamp = Date.now();
  const testTopicName = `Test Technology News ${timestamp}`;
  const skdEmail = 'skd18@iitbbs.ac.in';
  const surajEmail = 'surajguava@gmail.com';

  test('should create a topic', async () => {
    const response = await makeRequest('POST', '/api/topics', {
      name: testTopicName,
      description: 'Latest technology updates and news',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe(testTopicName);
    createdTopicId = response.body.id;
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

  test('should subscribe subscribers to topic', async () => {
    const skdSubscribeResponse = await makeRequest('POST', `/api/subscribers/${skdSubscriberId}/subscribe`, {
      topicId: createdTopicId,
    });
    expect([200, 201]).toContain(skdSubscribeResponse.status);

    const surajSubscribeResponse = await makeRequest('POST', `/api/subscribers/${surajSubscriberId}/subscribe`, {
      topicId: createdTopicId,
    });
    expect([200, 201]).toContain(surajSubscribeResponse.status);
  });

  test('should schedule emails from 1:10 PM IST for both skd18@iitbbs.ac.in and surajguava@gmail.com in parallel', async () => {
    const targetYear = 2025;
    const targetMonth = 11;
    const targetDay = 25;
    const startHour = 13;
    const startMinute = 10;

    const emails = [
      { title: 'Newsletter Email 1', body: 'This is the first newsletter email sent to both subscribers in parallel' },
      { title: 'Newsletter Email 2', body: 'This is the second newsletter email sent to both subscribers in parallel' },
      { title: 'Newsletter Email 3', body: 'This is the third newsletter email sent to both subscribers in parallel' },
      { title: 'Newsletter Email 4', body: 'This is the fourth newsletter email sent to both subscribers in parallel' },
      { title: 'Newsletter Email 5', body: 'This is the fifth newsletter email sent to both subscribers in parallel' },
    ];

    const createdContentIds: number[] = [];

    for (let i = 0; i < emails.length; i++) {
      const minuteOffset = i * 2;
      const scheduledMinute = startMinute + minuteOffset;
      const scheduledHour = startHour + Math.floor(scheduledMinute / 60);
      const finalMinute = scheduledMinute % 60;

      const scheduledTime = getScheduledTimeForSpecificDateIST(
        targetYear,
        targetMonth,
        targetDay,
        scheduledHour,
        finalMinute
      );

      const response = await makeRequest('POST', '/api/content', {
        topicId: createdTopicId,
        title: emails[i].title,
        body: emails[i].body,
        scheduledTime: scheduledTime,
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.topic_id).toBe(createdTopicId);
      expect(response.body.title).toBe(emails[i].title);
      expect(response.body.is_sent).toBe(false);
      expect(response.body.status).toBe('pending');
      createdContentIds.push(response.body.id);
    }

    expect(createdContentIds.length).toBe(5);
  });
});
