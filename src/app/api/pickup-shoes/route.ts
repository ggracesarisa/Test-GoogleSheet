// src/app/api/pickup-shoes/route.ts

import { google } from "googleapis";
import { NextResponse } from "next/server";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Configure dayjs to support timezones
dayjs.extend(utc);
dayjs.extend(timezone);

// Load environment variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

// CORS configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight CORS requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Main POST handler
export async function POST(req: Request) {
  try {
    if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_BASE64) {
      return NextResponse.json(
        { message: "Missing SHEET_ID or GOOGLE_SERVICE_ACCOUNT_BASE64" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Decode base64 service account JSON
    const serviceAccountJson = JSON.parse(
      Buffer.from(SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
    );

    const auth = new google.auth.JWT({
      email: serviceAccountJson.client_email,
      key: serviceAccountJson.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Read request body
    const body = await req.json();
    const { user_email } = body;

    if (!user_email) {
      return NextResponse.json(
        { message: "Missing required field: user_email" },
        { status: 400, headers: corsHeaders }
      );
    }

    // STEP 1 — Read the entire sheet
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "A:K",
    });

    const rows = readRes.data.values ?? [];

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "Database is empty." },
        { status: 404, headers: corsHeaders }
      );
    }

    // STEP 2 — Find headers
    const header = rows[0];
    const userEmailIndex = header.indexOf("user_email");
    const finishIndex = header.indexOf("finish_time");
    const statusIndex = header.indexOf("status");

    const pickupIndex = header.indexOf("pickup_time");

    // Filter active tasks of user
    const activeRows = rows
      .map((row, i) => ({ row, i }))
      .filter(
        (item) =>
          item.row[userEmailIndex] === user_email &&
          ["กำลังทำงาน", "พร้อมส่งมอบรองเท้า"].includes(
            item.row[statusIndex]
          )
      );

    if (activeRows.length === 0) {
      return NextResponse.json(
        { message: "No active shoe-cleaning task found for this user." },
        { status: 404, headers: corsHeaders }
      );
    }

    const latest = activeRows[activeRows.length - 1];
    const targetRowIndex = latest.i + 1;

    const finishTime = latest.row[finishIndex];
    const currentStatus = latest.row[statusIndex];

    // STEP 3 — Compare current time with finish_time
    const now = dayjs().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm:ss");

    const isFinished =
      dayjs(now).isAfter(dayjs(finishTime)) ||
      dayjs(now).isSame(dayjs(finishTime));

    // If not finished, return real status from sheet
    if (!isFinished) {
      return NextResponse.json(
        {
          message: `The shoe-drying process is still running. Please come back after ${finishTime}.`,
          finish_time: finishTime,
          status: currentStatus,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // STEP 4 — Update pickup_time + status
    const newStatus = "ผู้ใช้รับรองเท้าเรียบร้อย";

    const pickupTimeISO = dayjs().tz("Asia/Bangkok").format();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `J${targetRowIndex}:K${targetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[pickupTimeISO, newStatus]],
      },
    });

    return NextResponse.json(
      {
        message: "Pickup recorded successfully.",
        pickup_time: pickupTimeISO,
        status: newStatus,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Error in pickup API:", err);
    return NextResponse.json(
      {
        message: "Internal Server Error",
        error: err.message,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
