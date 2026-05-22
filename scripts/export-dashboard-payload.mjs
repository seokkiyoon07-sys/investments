import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_INPUT,
  REPORT_FIELDS,
  normalizeReports,
  parseArgs,
  readPayloadFromHtml,
  toCsvValue
} from './lib-dashboard-payload.mjs';

const args = parseArgs(process.argv.slice(2));
const input = resolve(args.input || DEFAULT_INPUT);
const format = args.format || 'ndjson';
const output = resolve(args.output || `data/reports.${format === 'csv' ? 'csv' : 'ndjson'}`);

if (!['ndjson', 'csv'].includes(format)) {
  throw new Error(`Unsupported --format "${format}". Use ndjson or csv.`);
}

mkdirSync(dirname(output), { recursive: true });

const payload = readPayloadFromHtml(input);
const reports = normalizeReports(payload);
const stream = createWriteStream(output, 'utf8');

if (format === 'csv') {
  stream.write(`${REPORT_FIELDS.join(',')}\n`);
  for (const report of reports) {
    stream.write(`${REPORT_FIELDS.map((field) => toCsvValue(report[field])).join(',')}\n`);
  }
} else {
  for (const report of reports) {
    stream.write(`${JSON.stringify(report)}\n`);
  }
}

stream.end(() => {
  console.log(`Exported ${reports.length.toLocaleString()} reports to ${output}`);
});
