// src/app/api/start-work/route.ts

import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

// 1. ดึง Environment Variables ที่จำเป็น
const SPREADSHEET_ID = process.env.SHEET_ID;
// เปลี่ยนมาใช้ตัวแปร Base64 แทน
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;


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
    if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_BASE64) {
        return NextResponse.json(
            { message: 'Configuration Error: Missing SHEET_ID or GOOGLE_SERVICE_ACCOUNT_BASE64.' },
            { status: 500, headers: corsHeaders }
        );
    }

    try {
        // JWT Client Setup: ถอดรหัส Base64
        
        // ถอดรหัส Base64 กลับเป็น JSON String และ Parse เป็น Object
        const serviceAccountJson = JSON.parse(
            Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
        );

        // ดึงค่า client_email และ private_key จาก Object ที่ถอดรหัสมา
        const auth = new google.auth.JWT({
            email: serviceAccountJson.client_email, 
            key: serviceAccountJson.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        
        // ----------------------------------------------------------------------
        
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
        console.error('Error processing request or writing to Google Sheet:', error);
        
        // หากเกิด Error จากการถอดรหัส Base64 จะถูกจับที่นี่
        return NextResponse.json(
            { message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500, headers: corsHeaders }
        );
    }
}