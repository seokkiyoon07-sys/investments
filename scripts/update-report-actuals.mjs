import { createSupabaseAdmin } from './lib-supabase-admin.mjs';
import { parseArgs } from './lib-dashboard-payload.mjs';

const args = parseArgs(process.argv.slice(2));
const supabase = createSupabaseAdmin();

const from = normalizeDateArg(args.from);
const to = normalizeDateArg(args.to);
const overwrite = Boolean(args.overwrite);

if (args.batch === 'none') {
  const result = await updateRange(from, to);
  console.log(JSON.stringify(result, null, 2));
} else {
  const result = await updateBatches(from, to);
  console.log(JSON.stringify(result, null, 2));
}

async function updateBatches(fromDate, toDate) {
  const bounds = await getReportBounds();
  const start = firstDayOfMonth(fromDate || bounds.minDate);
  const end = firstDayOfMonth(toDate || bounds.maxDate);
  const total = emptyResult();

  for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) {
    const monthFrom = formatDate(cursor);
    const monthTo = formatDate(lastDayOfMonth(cursor));
    const effectiveFrom = fromDate && fromDate > monthFrom ? fromDate : monthFrom;
    const effectiveTo = toDate && toDate < monthTo ? toDate : monthTo;

    const result = await updateRange(effectiveFrom, effectiveTo);
    addResult(total, result);
  }

  return total;
}

async function updateRange(fromDate, toDate) {
  console.log(`Updating report actual prices${fromDate ? ` from ${fromDate}` : ''}${toDate ? ` to ${toDate}` : ''}${overwrite ? ' with overwrite' : ''}...`);

  const { data, error } = await supabase.rpc('update_report_actual_prices', {
    p_from: fromDate,
    p_to: toDate,
    p_overwrite: overwrite
  });

  if (error) {
    throw new Error(`Report actual price update failed: ${error.message}`);
  }

  return data;
}

async function getReportBounds() {
  const [{ data: minRows, error: minError }, { data: maxRows, error: maxError }] = await Promise.all([
    supabase
      .from('reports')
      .select('report_date')
      .order('report_date', { ascending: true })
      .limit(1),
    supabase
      .from('reports')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1)
  ]);

  const error = minError || maxError;
  if (error) throw new Error(`Could not read report date bounds: ${error.message}`);

  const minDate = minRows?.[0]?.report_date;
  const maxDate = maxRows?.[0]?.report_date;
  if (!minDate || !maxDate) throw new Error('No report dates found.');

  return { minDate, maxDate };
}

function emptyResult() {
  return {
    matchedReports: 0,
    availablePrevious6m: 0,
    availablePrevious1y: 0,
    available6m: 0,
    available1y: 0,
    updatedReports: 0,
    filledPrevious6m: 0,
    filledPrevious1y: 0,
    filled6m: 0,
    filled1y: 0
  };
}

function addResult(total, next) {
  for (const key of Object.keys(total)) {
    total[key] += Number(next?.[key] || 0);
  }
}

function normalizeDateArg(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or YYYYMMDD.`);
}

function firstDayOfMonth(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonth(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function addMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}
