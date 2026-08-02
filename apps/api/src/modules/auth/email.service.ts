import nodemailer, { type Transporter } from 'nodemailer';

export class EmailService {
  private transporter: Transporter;
  private from: string;
  private isDev: boolean;

  constructor(transporter?: Transporter) {
    this.isDev =
      process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    this.from = process.env.EMAIL_FROM || 'noreply@breeyo.com';

    if (transporter) {
      this.transporter = transporter;
    } else {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      });
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL || 'http://localhost:3001';
    const link = `${webUrl}/verify-email?token=${token}`;

    if (this.isDev) {
      console.log(`[EmailService] Verification link for ${email}: ${link}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Verify your Breeyo email',
      html: `
        <h2>Welcome to Breeyo!</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="${link}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL || 'http://localhost:3001';
    const link = `${webUrl}/reset-password?token=${token}`;

    if (this.isDev) {
      console.log(`[EmailService] Password reset link for ${email}: ${link}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Reset your Breeyo password',
      html: `
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${link}">Reset Password</a>
        <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
      `,
    });
  }
}
