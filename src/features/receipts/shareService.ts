import * as Sharing from 'expo-sharing';
import * as SMS from 'expo-sms';
import * as MailComposer from 'expo-mail-composer';

export async function shareReceiptFile(uri: string, dialogTitle = 'Share receipt'): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
}

export async function sendReceiptSms(phone: string, message: string): Promise<void> {
  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('SMS is not available on this device.');
  }
  await SMS.sendSMSAsync([phone], message);
}

export async function sendReceiptEmail(email: string, subject: string, body: string, pdfUri?: string): Promise<void> {
  const isAvailable = await MailComposer.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('No email app is configured on this device.');
  }
  await MailComposer.composeAsync({
    recipients: [email],
    subject,
    body,
    attachments: pdfUri ? [pdfUri] : undefined,
  });
}

/**
 * Shares the receipt PDF through the OS share sheet with WhatsApp as the intended target.
 * WhatsApp's phone-prefilled deep link (whatsapp://send?phone=...) can only carry plain text,
 * not a file attachment, so there is no public API to both pre-select a contact by phone number
 * AND attach a PDF in one step — the user picks WhatsApp (and the contact) from the share sheet.
 */
export async function shareReceiptPdfToWhatsApp(pdfUri: string): Promise<void> {
  await shareReceiptFile(pdfUri, 'Send receipt via WhatsApp');
}
