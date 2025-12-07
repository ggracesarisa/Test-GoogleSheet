// src/app/api/sending-email/route.ts
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

// CORS configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight CORS requests
export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

// Main POST handler
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_email, percent } = body;

    if (!user_email) {
      return NextResponse.json(
        { error: "user_email is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Send Email
    const data = await resend.emails.send({
      from: "onboarding@resend.dev", // Defualt resend email
      to: user_email,
      subject: "Your shoes are almost ready 👟",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 12px;">
          <h2>Your shoes are almost ready!</h2>
          <p>The cleaning process is <b>${percent || 95}%</b> complete.</p>
          <p>You can prepare to pick them up soon </p>
          <br>
          <p style="font-size: 12px; color: #777;">
            Smart Shoe Locker System
          </p>
        </div>
      `,
    });

    return NextResponse.json(
      { success: true, data },
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("Email sending error:", error);

    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
