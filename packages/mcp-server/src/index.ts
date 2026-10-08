import { loadConfig } from '@story-keeper/shared';

import { createApplication } from './app.js';
import { startHttpServer } from './server.js';

const config = loadConfig();
const { app } = createApplication();

await startHttpServer(app, config.port);
console.log(JSON.stringify({ level: 'info', operation: 'server.start', port: config.port }));
