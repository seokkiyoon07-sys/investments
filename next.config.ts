import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  // DART corp_code 매핑 파일을 서버 함수 번들에 포함시킨다 (Vercel 등 배포 환경).
  outputFileTracingIncludes: {
    '/api/dart/[code]': ['./data/dart-corp-codes.json']
  }
};

export default nextConfig;
