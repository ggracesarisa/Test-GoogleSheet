// src/app/api/update-status/route.ts

import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configure dayjs to support timezones
dayjs.extend(utc);
dayjs.extend(timezone);

// Load environment variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
const CRON_SECRET = process.env.CRON_SECRET;

// CORS configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret',
};

// Handle preflight CORS requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Main POST handler
export async function POST(req: Request) {

  // Ensure required environment variables exist
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_BASE64 || !CRON_SECRET) {
    return NextResponse.json(
      { message: 'Configuration error: Missing required environment variables.' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // Authenticate request
    const reqSecret = req.headers.get('x-cron-secret');
    if (!reqSecret || reqSecret !== CRON_SECRET) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // Decode service account and build JWT client for Google Sheets
    const serviceAccountJson = JSON.parse(
      Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );

    const auth = new google.auth.JWT({
      email: serviceAccountJson.client_email,
      key: serviceAccountJson.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Read all rows (A:K) — first row is expected to be header
    const sheetRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:K',
    });

    const rows = sheetRes.data.values || [];

    if (rows.length < 2) {
      return NextResponse.json({ message: 'No rows to process.' }, { headers: corsHeaders });
    }

    const now = dayjs().tz('Asia/Bangkok');

    // Collect batched updates
    const updates: { range: string; values: string[][] }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Column mapping (0-based index):
      const finish_time = row[8];     // column I
      const currentStatus = row[10];  // column K

      if (!finish_time) continue;

      const finish = dayjs(finish_time).tz('Asia/Bangkok');

      // If status is already "ผู้ใช้รับรองเท้าเรียบร้อย" → DO NOT change it
      if (currentStatus === 'ผู้ใช้รับรองเท้าเรียบร้อย') {
        continue;
      }

      // If finish time passed and status is not yet "พร้อมส่งมอบรองเท้า"
      if (finish.isBefore(now) && currentStatus !== 'พร้อมส่งมอบรองเท้า') {
        const rowNumber = i + 1;
        const statusRange = `K${rowNumber}`;
        updates.push({ range: statusRange, values: [['พร้อมส่งมอบรองเท้า']] });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { message: 'All rows are up-to-date. No changes made.' },
        { headers: corsHeaders }
      );
    }

    // Apply updates sequentially
    for (const u of updates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: u.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: u.values },
      });
    }

    return NextResponse.json(
      { message: 'Status updated.', updated_count: updates.length },
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error('Error in update-status:', err);
    return NextResponse.json(
      { message: 'Internal Server Error', error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
}
