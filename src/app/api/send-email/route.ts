import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_email, percent, message } = body;

    if (!user_email) {
      return NextResponse.json(
        { error: "user_email is required" },
        { status: 400 }
      );
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "t56014223@gmail.com", 
        pass: "wbsl befq bndm rhvk",
      },
    });

    const mailOptions = {
      from: `"Smart Shoe Locker 👟" <t56014223@gmail.com>`,
      to: user_email,
      subject: "Your shoes are almost ready 👀",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Your shoes are almost ready!</h2>
          <p>The cleaning process is <b>${percent || 95}% complete</b>.</p>
          <p>You can prepare to pick them up soon 🚪👟</p>
          <br>
          <p style="color: #777; font-size: 12px;">
            Smart Shoe Locker System
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (err: any) {
    console.error("Email error:", err);
    return NextResponse.json(
      {
        error: "Failed to send email",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
