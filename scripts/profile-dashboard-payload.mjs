import { resolve } from 'node:path';
import {
  DEFAULT_INPUT,
  normalizeReports,
  parseArgs,
  profileReports,
  readPayloadFromHtml
} from './lib-dashboard-payload.mjs';

const args = parseArgs(process.argv.slice(2));
const input = resolve(args.input || DEFAULT_INPUT);
const payload = readPayloadFromHtml(input);
const reports = normalizeReports(payload);

console.log(JSON.stringify(profileReports(reports, payload), null, 2));
