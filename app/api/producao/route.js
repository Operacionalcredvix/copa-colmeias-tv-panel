import { handleRadarRequest } from '../../../lib/radar-core';
import { handleStructuredAiRequest } from '../../../lib/deepseek-structured';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_ORIGINS = new Set([
  'https://operacionalcredvix.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function getCorsHeaders(request) {
  const origin = request.headers.get('origin');

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function withCors(request, response) {
  const headers = new Headers(response.headers);

  Object.entries(getCorsHeaders(request)).forEach(
    ([key, value]) => {
      headers.set(key, value);
    },
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request) {
  const response = isAiMode(request)
    ? await handleStructuredAiRequest(request)
    : await handleRadarRequest(request);

  return withCors(request, response);
}

export async function POST(request) {
  const response = isAiMode(request)
    ? await handleStructuredAiRequest(request)
    : await handleRadarRequest(request);

  return withCors(request, response);
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

function isAiMode(request) {
  const url = new URL(request.url);

  const mode = String(
    url.searchParams.get('mode') ||
    url.searchParams.get('rota') ||
    '',
  ).toLowerCase();

  return mode === 'ai' || mode === 'radar-ai';
}