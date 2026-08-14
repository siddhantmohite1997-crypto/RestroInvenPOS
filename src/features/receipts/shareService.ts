import { Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as SMS from 'expo-sms';
import * as MailComposer from 'expo-mail-composer';

export async function shareReceiptFile(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share receipt' });
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

/** Opens a WhatsApp chat with the receipt text pre-filled — no WhatsApp Business API needed. */
export async function openWhatsAppWithReceipt(phone: string, message: string): Promise<void> {
  const digitsOnly = phone.replace(/[^\d]/g, '');
  const url = `whatsapp://send?phone=${digitsOnly}&text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('WhatsApp is not installed on this device.');
  }
  await Linking.openURL(url);
}
