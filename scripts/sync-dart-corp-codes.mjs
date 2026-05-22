import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { loadDotEnv } from './lib-env.mjs';

// DART corpCode.xml(=ZIP)을 받아 종목코드 → corp_code 매핑 JSON을 만든다.
// 상장사만 추려서 data/dart-corp-codes.json 으로 저장. 분기에 한 번 정도만 다시 실행하면 충분하다.

loadDotEnv();

const apiKey = process.env.DART_API_KEY?.trim();
if (!apiKey) {
  console.error('DART_API_KEY가 없습니다. opendart.fss.or.kr 에서 무료 발급 후 .env.local 에 추가하세요.');
  process.exit(1);
}

const OUT_PATH = resolve('data/dart-corp-codes.json');
const ZIP_PATH = resolve(tmpdir(), `dart-corpcode-${Date.now()}.zip`);

console.log('DART corp code 아카이브를 내려받는 중...');
const response = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(apiKey)}`);
if (!response.ok) {
  throw new Error(`다운로드 실패: HTTP ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());

// 키 오류 등이면 ZIP 대신 XML 에러 본문이 온다.
if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
  throw new Error(`ZIP이 아닌 응답을 받았습니다 (키 확인 필요):\n${buffer.toString('utf8').slice(0, 400)}`);
}

writeFileSync(ZIP_PATH, buffer);

let xml;
try {
  console.log('CORPCODE.xml 추출 중...');
  xml = execFileSync('unzip', ['-p', ZIP_PATH], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8');
} finally {
  try {
    unlinkSync(ZIP_PATH);
  } catch {
    /* 임시파일 정리 실패는 무시 */
  }
}

const map = {};
let listed = 0;
let total = 0;
const listRegex = /<list>([\s\S]*?)<\/list>/g;
let match;
while ((match = listRegex.exec(xml)) !== null) {
  total += 1;
  const block = match[1];
  const corpCode = block.match(/<corp_code>([^<]*)<\/corp_code>/)?.[1]?.trim();
  const stockCode = block.match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]?.replace(/\D/g, '') ?? '';
  if (!corpCode || stockCode.length !== 6) continue; // 비상장사는 stock_code가 공백
  map[stockCode] = corpCode;
  listed += 1;
}

if (!listed) {
  throw new Error('상장사를 한 건도 파싱하지 못했습니다. API 키나 응답 형식을 확인하세요.');
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), count: listed, map }));

console.log(`전체 ${total.toLocaleString()}개 법인 중 상장사 ${listed.toLocaleString()}개 매핑 저장 → ${OUT_PATH}`);
