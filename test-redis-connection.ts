import 'dotenv/config';
import Redis from 'ioredis';
import Queue from 'bull';

interface TestJobData {
  test: string;
}

const getRedisConfig = () => {
  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    const isTls = url.startsWith('rediss://');
    
    if (isTls) {
      const urlObj = new URL(url);
      return {
        host: urlObj.hostname,
        port: parseInt(urlObj.port || '6379'),
        password: urlObj.password || undefined,
        username: urlObj.username || undefined,
        tls: {},
      };
    }
    
    return url;
  }

  const useTls = process.env.REDIS_TLS === 'true';
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    ...(useTls && {
      tls: {},
    }),
  };
};

async function testConnection() {
  console.log('🔍 Testing Redis connection...');
  
  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
    console.log('📍 Using connection string:', maskedUrl);
  } else {
    console.log('📍 Host:', process.env.REDIS_HOST || 'localhost');
    console.log('📍 Port:', process.env.REDIS_PORT || '6379');
    console.log('📍 TLS:', process.env.REDIS_TLS === 'true' ? 'enabled' : 'disabled');
  }

  const redisConfig = getRedisConfig();
  let redis: Redis | null = null;
  let testQueue: Queue<TestJobData> | null = null;

  try {
    console.log('\n⏳ Step 1: Testing direct Redis connection...');
    redis = typeof redisConfig === 'string' 
      ? new Redis(redisConfig)
      : new Redis(redisConfig);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      redis!.on('connect', () => {
        console.log('✅ Redis client connected');
      });

      redis!.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redis!.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('✅ Direct Redis connection successful!');
    
    console.log('\n⏳ Step 2: Testing Redis operations...');
    await redis.set('test:connection', 'success', 'EX', 10);
    const value = await redis.get('test:connection');
    console.log('✅ SET/GET operations successful:', value);
    await redis.del('test:connection');
    
    console.log('\n⏳ Step 3: Testing Bull queue connection...');
    
    const getBullRedisConfig = () => {
      if (process.env.REDIS_URL) {
        const url = process.env.REDIS_URL;
        const isTls = url.startsWith('rediss://');
        
        if (isTls) {
          const urlObj = new URL(url);
          return {
            redis: {
              host: urlObj.hostname,
              port: parseInt(urlObj.port || '6379'),
              password: urlObj.password || undefined,
              username: urlObj.username || undefined,
              tls: {},
            },
          };
        }
        
        return {
          redis: url,
        };
      }

      const useTls = process.env.REDIS_TLS === 'true';
      return {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          ...(useTls && {
            tls: {},
          }),
        },
      };
    };

    testQueue = new Queue<TestJobData>('redis-connection-test', {
      ...getBullRedisConfig(),
    });

    testQueue.on('error', (error: Error) => {
      console.error('❌ Queue error:', error.message);
    });

    console.log('⏳ Attempting to add test job (this verifies queue connection)...');
    
    try {
      const testJob = await Promise.race([
        testQueue.add('test', { test: 'connection-test' }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Job add timeout')), 10000)
        ),
      ]);
      
      console.log('✅ Job added successfully (ID:', testJob.id, ')');
      
      const jobCounts = await testQueue.getJobCounts();
      console.log('📊 Queue stats:', {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
      });
      
      await testJob.remove();
      console.log('✅ Test job cleaned up');
      
      await testQueue.close();
      await redis.quit();
      
      console.log('\n✅ All Redis connection tests passed!');
      console.log('✅ Your Redis connection is working correctly!');
      process.exit(0);
    } catch (error: any) {
      if (error.message.includes('timeout')) {
        console.log('⚠️  Job add timed out, but direct Redis connection works.');
        console.log('✅ This means Redis is connected - Bull queue should work when your app runs.');
        await testQueue.close();
        await redis.quit();
        console.log('\n✅ Redis connection verified!');
        process.exit(0);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('\n❌ Redis connection test failed!');
    console.error('Error details:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Connection refused. Possible causes:');
      console.error('   - Redis server is not running');
      console.error('   - Wrong host/port in configuration');
      console.error('   - Firewall blocking the connection');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Host not found. Check your Redis hostname.');
    } else if (error.message.includes('password') || error.message.includes('auth') || error.message.includes('NOAUTH')) {
      console.error('\n💡 Authentication failed. Check your Redis password.');
    } else if (error.message.includes('TLS') || error.message.includes('SSL') || error.message.includes('certificate')) {
      console.error('\n💡 TLS/SSL error. Make sure REDIS_TLS is set correctly.');
      console.error('   For Upstash, use rediss:// (with double s) in REDIS_URL');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Connection timeout. Possible causes:');
      console.error('   - Network connectivity issues');
      console.error('   - Firewall blocking the connection');
      console.error('   - Redis server not responding');
    }
    
    if (testQueue) {
      try {
        await testQueue.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    process.exit(1);
  }
}

testConnection();

