import nodemailer, { Transporter } from 'nodemailer';
import logger from '../config/logger.js';

interface EmailResult {
  success: boolean;
  messageId: string;
  response: string;
}

class EmailService {
  private transporter!: Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    try {
      const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT || '30000');
      const socketTimeout = parseInt(process.env.SMTP_SOCKET_TIMEOUT || '60000');
      const maxConnections = parseInt(process.env.SMTP_MAX_CONNECTIONS || '3');
      
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        connectionTimeout,
        socketTimeout,
        greetingTimeout: connectionTimeout,
        pool: true,
        maxConnections,
        maxMessages: 50,
      });

      logger.info('Email transporter initialized', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        connectionTimeout,
        socketTimeout,
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified');
      return true;
    } catch (error) {
      logger.error('SMTP connection verification failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    htmlBody: string | null = null
  ): Promise<EmailResult> {
    const emailData = {
      from: `"${process.env.SMTP_FROM_NAME || 'Newsletter Service'}" <${process.env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      text: body,
      html: htmlBody || this.formatPlainTextAsHtml(body),
    };

    try {
      const sendTimeout = parseInt(process.env.SMTP_SEND_TIMEOUT || '60000');
      const result = await Promise.race([
        this.transporter.sendMail(emailData),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), sendTimeout)
        ),
      ]);

      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
        response: result.response,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Failed to send email', {
        to,
        subject,
        error: errorMessage,
      });

      throw new Error(errorMessage.includes('timeout') ? 'Connection timeout' : errorMessage);
    }
  }

  private formatPlainTextAsHtml(text: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="white-space: pre-wrap;">${text.replace(/\n/g, '<br>')}</div>
        </body>
      </html>
    `;
  }

}

export default new EmailService();

