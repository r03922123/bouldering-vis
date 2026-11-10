import { createMlClient, type MlClient } from '../workers/client';

let client: MlClient | null = null;

/** The app's single ML worker, created on first use. */
export function getMl(): MlClient {
  client ??= createMlClient();
  return client;
}
