import { JWT } from 'google-auth-library';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SPREADSHEET_ID = process.env.MANAGEMENT_SPREADSHEET_ID || '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
const RANGES = { daily: "'DIÁRIA ESTÁTICA'!A1:J123", projection: "'PROJEÇÃO DE META'!A1:G127" };
const COORDINATORS = ['DAIELLY', 'MARIA FERNANDA', 'MARIEL