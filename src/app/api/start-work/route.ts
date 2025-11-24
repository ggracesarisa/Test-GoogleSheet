// src/app/api/start-work/route.ts

import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

// 1. ดึง Environment Variables ที่จำเป็น
const SPREADSHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY_RAW = process.env.GOOGLE_PRIVATE_KEY;

// 2. CORS Headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// 3. OPTIONS Handler (สำหรับ CORS Preflight)
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// 4. POST Handler (Main Logic)
export async function POST(req: Request) {

    // ตรวจสอบ Configuration Error ก่อน
    if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY_RAW) {
        return NextResponse.json(
            { message: 'Configuration Error: Missing required environment variables.' },
            { status: 500, headers: corsHeaders }
        );
    }

    try {
        const body = await req.json();
        const { user_email, recommended_time_min } = body;

        // Validation
        if (!user_email || typeof recommended_time_min === 'undefined') {
            return NextResponse.json(
                { message: 'Missing required fields: user_email and recommended_time_min' },
                { status: 400, headers: corsHeaders }
            );
        }

        const recommendedMin = parseInt(recommended_time_min as string, 10);
        if (isNaN(recommendedMin) || recommendedMin <= 0) {
            return NextResponse.json(
                { message: 'Invalid recommended_time_min. Must be a positive number.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // JWT Client Setup (แก้ไข Type Error)
        const privateKey = PRIVATE_KEY_RAW.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT({
            email: SERVICE_ACCOUNT_EMAIL!, // ใช้ ! เพราะตรวจสอบแล้วว่ามีค่า
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // Data Preparation
        const log_id = uuidv4();
        const locker_id = 'L001';
        const start_time = dayjs().format();
        const finish_time = dayjs(start_time).add(recommendedMin, 'minute').format();
        const status = 'กำลังทำงาน';
        const pickup_time = '';

        const newRow = [log_id, locker_id, user_email, start_time, finish_time, recommendedMin, pickup_time, status];

        // เขียนข้อมูลลง Google Sheet
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:H',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [newRow] },
        });

        // Success Response
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
        console.error('Error writing to Google Sheet:', error);
        return NextResponse.json(
            { message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500, headers: corsHeaders }
        );
    }
}