import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Support running from the workspace root or from apps/api.
dotenv.config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});
