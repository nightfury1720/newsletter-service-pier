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

async function makeRequest(method: string, endpoint: string, body?: any) {
  const url = `${BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json() as any;
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${JSON.stringify(data)}`);
  }
  
  return { status: response.status, body: data as any };
}

describe('Content, Topic, and Subscribers Integration Test', () => {
  let createdTopicId: number;
  let createdContentId: number;
  let subscriberIds: number[] = [];
  const testSubscriberEmail = 'suraj.kumar@dslrteam.com';
  const testEmails = [
    testSubscriberEmail,
    'test1@example.com',
    'test2@example.com',
    'skd18@iitbbs.ac.in',
  ];

  test('should create a topic', async () => {
    const response = await makeRequest('POST', '/api/topics', {
      name: 'Test Technology News',
      description: 'Latest technology updates and news',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Test Technology News');
    expect(response.body.description).toBe('Latest technology updates and news');
    createdTopicId = response.body.id;
  });

  test('should create subscribers', async () => {
    for (const email of testEmails) {
      const response = await makeRequest('POST', '/api/subscribers', { email });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(email.toLowerCase());
      expect(response.body.is_active).toBe(true);
      subscriberIds.push(response.body.id);
    }

    // Verify suraj.kumar@dslrteam.com was created
    const surajSubscriber = subscriberIds.find((_, index) => testEmails[index] === testSubscriberEmail);
    expect(surajSubscriber).toBeDefined();
  });

  test('should subscribe subscribers to topic', async () => {
    for (const subscriberId of subscriberIds) {
      const response = await makeRequest('POST', `/api/subscribers/${subscriberId}/subscribe`, {
        topicId: createdTopicId,
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('subscriber_id', subscriberId);
      expect(response.body).toHaveProperty('topic_id', createdTopicId);
    }
  });

  test('should create content for the topic', async () => {
    const scheduledTime = getScheduledTimeForIST(13, 30);

    const response = await makeRequest('POST', '/api/content', {
      topicId: createdTopicId,
      title: 'Test Newsletter Content',
      body: 'This is a test newsletter content body with important information.',
      scheduledTime: scheduledTime,
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.topic_id).toBe(createdTopicId);
    expect(response.body.title).toBe('Test Newsletter Content');
    expect(response.body.body).toBe('This is a test newsletter content body with important information.');
    expect(response.body.is_sent).toBe(false);
    expect(response.body.status).toBe('pending');
    createdContentId = response.body.id;
  });

  test('should verify topic via GET request', async () => {
    const response = await makeRequest('GET', `/api/topics/${createdTopicId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', createdTopicId);
    expect(response.body.name).toBe('Test Technology News');
    expect(response.body).toHaveProperty('subscriber_count');
    expect(parseInt(response.body.subscriber_count)).toBeGreaterThanOrEqual(testEmails.length);
  });

  test('should verify all topics via GET request', async () => {
    const response = await makeRequest('GET', '/api/topics');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const createdTopic = response.body.find((topic: any) => topic.id === createdTopicId);
    expect(createdTopic).toBeDefined();
    expect(createdTopic.name).toBe('Test Technology News');
    expect(parseInt(createdTopic.subscriber_count)).toBeGreaterThanOrEqual(testEmails.length);
  });

  test('should verify subscribers via GET request', async () => {
    const response = await makeRequest('GET', '/api/subscribers');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const surajSubscriber = response.body.find((sub: any) => sub.email === testSubscriberEmail);
    expect(surajSubscriber).toBeDefined();
    expect(surajSubscriber.is_active).toBe(true);
    expect(subscriberIds).toContain(surajSubscriber.id);
  });

  test('should verify specific subscriber via GET request', async () => {
    const surajSubscriberId = subscriberIds[testEmails.indexOf(testSubscriberEmail)];
    const response = await makeRequest('GET', `/api/subscribers/${surajSubscriberId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', surajSubscriberId);
    expect(response.body.email).toBe(testSubscriberEmail);
    expect(response.body.is_active).toBe(true);
    expect(response.body).toHaveProperty('topics');
    expect(Array.isArray(response.body.topics)).toBe(true);
    const subscribedTopic = response.body.topics.find((topic: any) => topic.id === createdTopicId);
    expect(subscribedTopic).toBeDefined();
    expect(subscribedTopic.name).toBe('Test Technology News');
  });

  test('should verify content via GET request', async () => {
    const response = await makeRequest('GET', `/api/content/${createdContentId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', createdContentId);
    expect(response.body.topic_id).toBe(createdTopicId);
    expect(response.body.title).toBe('Test Newsletter Content');
    expect(response.body.body).toBe('This is a test newsletter content body with important information.');
    expect(response.body.topic_name).toBe('Test Technology News');
    expect(response.body).toHaveProperty('total_subscribers');
    expect(parseInt(response.body.total_subscribers)).toBeGreaterThanOrEqual(testEmails.length);
  });

  test('should verify content list via GET request', async () => {
    const response = await makeRequest('GET', '/api/content');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const createdContent = response.body.find((c: any) => c.id === createdContentId);
    expect(createdContent).toBeDefined();
    expect(createdContent.topic_id).toBe(createdTopicId);
    expect(createdContent.topic_name).toBe('Test Technology News');
    expect(parseInt(createdContent.total_subscribers)).toBeGreaterThanOrEqual(testEmails.length);
  });

  test('should create and subscribe skd18@iitbbs.ac.in and schedule 10 tech newsletters', async () => {
    const skdEmail = 'skd18@iitbbs.ac.in';
    let skdSubscriberId: number;

    const skdEmailIndex = testEmails.indexOf(skdEmail);
    if (skdEmailIndex >= 0 && subscriberIds[skdEmailIndex]) {
      skdSubscriberId = subscriberIds[skdEmailIndex];
    } else {
      const subscriberResponse = await makeRequest('POST', '/api/subscribers', { email: skdEmail });
      expect(subscriberResponse.status).toBe(201);
      expect(subscriberResponse.body).toHaveProperty('id');
      skdSubscriberId = subscriberResponse.body.id;
    }

    const subscribeResponse = await makeRequest('POST', `/api/subscribers/${skdSubscriberId}/subscribe`, {
      topicId: createdTopicId,
    });
    expect(subscribeResponse.status).toBe(201);
    expect(subscribeResponse.body).toHaveProperty('subscriber_id', skdSubscriberId);
    expect(subscribeResponse.body).toHaveProperty('topic_id', createdTopicId);

    const techNewsletters = [
      { title: 'AI Breakthrough: New Language Models Revolutionize Tech', body: 'Recent advancements in artificial intelligence are transforming how we interact with technology. Large language models are now capable of understanding context and generating human-like responses.' },
      { title: 'Cloud Computing Trends: Multi-Cloud Strategies Dominate', body: 'Enterprises are increasingly adopting multi-cloud architectures to avoid vendor lock-in and optimize costs. This trend is reshaping the cloud computing landscape.' },
      { title: 'Cybersecurity Alert: Zero-Day Vulnerabilities Discovered', body: 'Security researchers have identified critical vulnerabilities in popular software. Organizations are urged to update their systems immediately to prevent potential breaches.' },
      { title: 'Quantum Computing Milestone: Error Correction Achieved', body: 'Scientists have made significant progress in quantum error correction, bringing practical quantum computing one step closer to reality. This breakthrough could revolutionize cryptography and drug discovery.' },
      { title: '5G Expansion: Next-Gen Networks Roll Out Globally', body: 'Telecom companies worldwide are expanding 5G infrastructure, promising faster speeds and lower latency. This expansion is enabling new applications in IoT and autonomous vehicles.' },
      { title: 'Blockchain Innovation: Smart Contracts Gain Traction', body: 'Smart contracts are becoming mainstream in various industries, from finance to supply chain management. This technology promises to automate complex business processes.' },
      { title: 'Edge Computing: Processing Data Closer to Users', body: 'Edge computing is reducing latency by processing data near its source. This technology is crucial for real-time applications like autonomous driving and augmented reality.' },
      { title: 'DevOps Evolution: GitOps Practices Transform Deployment', body: 'GitOps is revolutionizing how teams manage infrastructure and deployments. This approach brings version control and automation to operations workflows.' },
      { title: 'Machine Learning in Healthcare: AI Diagnoses Improve', body: 'Machine learning algorithms are assisting doctors in diagnosing diseases with higher accuracy. These AI systems are analyzing medical images and patient data to detect conditions earlier.' },
      { title: 'Sustainable Tech: Green Computing Initiatives Accelerate', body: 'Technology companies are investing heavily in sustainable practices. From renewable energy data centers to energy-efficient processors, the industry is going green.' },
    ];

    const startDate = new Date();
    const targetYear = startDate.getFullYear();
    const targetMonth = 11;
    const targetDay = 25;
    const startHour = 2;
    const startMinute = 30;

    const createdNewsletterIds: number[] = [];

    for (let i = 0; i < 10; i++) {
      const minuteOffset = i * 10;
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
        title: techNewsletters[i].title,
        body: techNewsletters[i].body,
        scheduledTime: scheduledTime,
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.topic_id).toBe(createdTopicId);
      expect(response.body.title).toBe(techNewsletters[i].title);
      expect(response.body.body).toBe(techNewsletters[i].body);
      expect(response.body.is_sent).toBe(false);
      expect(response.body.status).toBe('pending');
      createdNewsletterIds.push(response.body.id);
    }

    expect(createdNewsletterIds.length).toBe(10);
  });
});

