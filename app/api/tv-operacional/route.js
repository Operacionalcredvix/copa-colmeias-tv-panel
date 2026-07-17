import { JWT } from 'google-auth-library';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SPREADSHEET_ID = process.env.MANAGEMENT_SPREADSHEET_ID || '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
const RANGES = {
  daily: "'DIÁRIA ESTÁTICA'!A1:J123",
  projection: "'PROJEÇÃO DE META'!A1:G127"
};

let tokenCache = null;
let payloadCache = null;

export async function GET(request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  try {
    const payload = await getPayload(forceRefresh);
    return Response.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch