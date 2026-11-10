import 'dotenv/config';
import { createApp } from './app.js';
import { getBackendEnv } from './config/env.js';

const env = getBackendEnv();
const app = createApp({ env });

app.listen(env.PORT, () => {
  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Backend foundation server started',
      port: env.PORT,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    }),
  );
});
