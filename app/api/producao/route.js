import { handleRadarRequest } from '../../../lib/radar-core';
import { handleStructuredAiRequest } from '../../../lib/deepseek-structured';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  return isAiMode(request) ? handleStructuredAiRequest(request) : handleRadarRequest(request);
}

export async function POST(request) {
  return isAiMode(request) ? handleStructuredAiRequest(request) : handleRadarRequest(request);
}

function isAiMode(request) {
  const url = new URL(request.url);
  const mode = String(url.searchParams.get('mode') || url.searchParams.get('rota') || '').toLowerCase();
  return mode === 'ai' || mode === 'radar-ai';
}
