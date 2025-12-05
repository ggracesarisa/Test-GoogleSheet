// src/app/api/start-work/route.ts

import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configure dayjs to support timezones
dayjs.extend(utc);
dayjs.extend(timezone);

// Load environment variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

// CORS configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle preflight CORS requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Main POST handler
export async function POST(req: Request) {
  // Ensure required environment variables exist
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_BASE64) {
    return NextResponse.json(
      { message: 'Configuration Error: Missing SHEET_ID or GOOGLE_SERVICE_ACCOUNT_BASE64.' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // Decode the Base64 service account JSON
    const serviceAccountJson = JSON.parse(
      Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    );

    // Initialize Google Sheets authentication
    const auth = new google.auth.JWT({
      email: serviceAccountJson.client_email,
      key: serviceAccountJson.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Parse the incoming request body
    const body = await req.json();
    const { user_email, shoe_type, recommended_time_min, temperature, humidity } = body;

    // Validate that all required fields exist
    if (!user_email || !shoe_type || !recommended_time_min || !temperature || !humidity) {
      return NextResponse.json(
        {
          message:
            'Missing required fields: user_email, shoe_type, recommended_time_min, temperature, humidity',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Convert numeric fields (they are strings from the client)
    const recommendedMin = parseInt(recommended_time_min, 10);
    const tempVal = parseFloat(temperature);
    const humVal = parseFloat(humidity);

    // Validate recommended time
    if (isNaN(recommendedMin) || recommendedMin <= 0) {
      return NextResponse.json(
        { message: 'Invalid recommended_time_min. Must be a positive number.' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate unique log ID
    const log_id = uuidv4();

    // Default locker (fixed value)
    const locker_id = 'L001';

    // Generate timestamps using Thailand timezone
    const start_time = dayjs().tz('Asia/Bangkok').format();
    const finish_time = dayjs(start_time)
      .add(recommendedMin, 'minute')
      .tz('Asia/Bangkok')
      .format();

    // Default status
    const status = 'กำลังทำงาน';
    const pickup_time = '';

    // Build a row based on the new Google Sheet column structure A:K
    const newRow = [
      log_id,
      locker_id,
      user_email,
      shoe_type,
      recommendedMin,
      tempVal,
      humVal,
      start_time,
      finish_time,
      pickup_time,
      status,
    ];

    // Append the row to Google Sheets
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    // Success response
    return NextResponse.json(
      {
        message: 'Start work successful. Data saved to Google Sheet.',
        log_id,
        start_time,
        finish_time,
        sheets_update: response.data,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error processing request or writing to Google Sheet:', error);

    return NextResponse.json(
      {
        message: 'Internal Server Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
