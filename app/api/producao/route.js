import { handleRadarRequest } from '../../../lib/radar-core';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  return handleRadarRequest(request);
}

export async function POST(request) {
  return handleRadarRequest(request);
}
