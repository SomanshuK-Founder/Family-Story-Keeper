import type { Server } from 'node:http';

import type { Express } from 'express';

export function startHttpServer(app: Express, port: number, host = '127.0.0.1'): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      resolve(server);
    });
    server.once('error', reject);
  });
}
