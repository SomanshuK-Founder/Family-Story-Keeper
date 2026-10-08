import type { Server } from 'node:http';

import type { Express } from 'express';

export function startHttpServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
    server.once('error', reject);
  });
}
