import * as Print from 'expo-print';

export interface PrinterCheckResult {
  available: boolean;
  error?: string;
}

/**
 * Print receipt HTML with error handling.
 * If print fails or user cancels, returns error message.
 */
export async function printReceiptHtml(html: string): Promise<{ success: boolean; message?: string }> {
  try {
    await Print.printAsync({ html });
    return { success: true, message: 'Receipt printed successfully.' };
  } catch (err) {
    const errorMessage = String(err);

    if (errorMessage.includes('cancelled') || errorMessage.includes('Cancelled')) {
      return { success: false, message: 'Print cancelled. Bill saved locally.' };
    }

    if (errorMessage.includes('No printers') || errorMessage.includes('no printer')) {
      return { success: false, message: 'No printer connected. Bill saved locally. Go to Settings to add a printer.' };
    }

    return { success: false, message: `Print failed: ${errorMessage}. Bill saved locally.` };
  }
}

/**
 * Generate a receipt as PDF file URI (for email/sharing).
 */
export async function receiptPdfUri(html: string): Promise<string> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  } catch (err) {
    throw new Error(`Failed to generate PDF: ${String(err)}`);
  }
}
