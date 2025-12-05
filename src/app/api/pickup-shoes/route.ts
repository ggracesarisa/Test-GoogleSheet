// src/app/api/pickup-shoes/route.ts

import { google } from "googleapis";
import { NextResponse } from "next/server";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Enable timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

// Load environment variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

// CORS setup
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// POST handler
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

    // Read request JSON
    const body = await req.json();
    const { user_email } = body;

    if (!user_email) {
      return NextResponse.json(
        { message: "Missing required field: user_email" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Read sheet data
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

    // Extract column indexes
    const header = rows[0];
    const userEmailIndex = header.indexOf("user_email");
    const finishIndex = header.indexOf("finish_time");
    const statusIndex = header.indexOf("status");
    const pickupIndex = header.indexOf("pickup_time");

    // Filter only active tasks
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

    // Select the latest task
    const latest = activeRows[activeRows.length - 1];
    const targetRowIndex = latest.i + 1;

    const finishTime = latest.row[finishIndex];
    const statusNow = latest.row[statusIndex];

    // Use ISO8601 parsing
    const finishTimeParsed = dayjs(finishTime);
    const now = dayjs().tz("Asia/Bangkok");

    const isFinished =
      now.isAfter(finishTimeParsed) || now.isSame(finishTimeParsed);

    // If still not finished → return status real value
    if (!isFinished) {
      return NextResponse.json(
        {
          message: `The shoe-drying process is still running. Please come back after ${finishTime}.`,
          finish_time: finishTime,
          status: statusNow, // the real status from sheet
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // If finished → set pickup time + update status
    const newStatus = "ผู้ใช้รับรองเท้าเรียบร้อย";
    const pickupTimeNow = now.format("YYYY-MM-DDTHH:mm:ssZ"); // ISO8601 + timezone

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `J${targetRowIndex}:K${targetRowIndex}`, // pickup_time + status
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[pickupTimeNow, newStatus]],
      },
    });

    return NextResponse.json(
      {
        message: "Pickup recorded successfully.",
        pickup_time: pickupTimeNow,
        status: newStatus,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Error in pickup API:", err);
    return NextResponse.json(
      { message: "Internal Server Error", error: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
