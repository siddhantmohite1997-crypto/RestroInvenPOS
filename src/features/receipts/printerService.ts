import * as Print from 'expo-print';

/**
 * ASSUMPTION flagged for review: raw ESC/POS printing over Bluetooth SPP (the common transport
 * for cheap 2"/3" thermal printers) requires a native module — there is no Expo Go equivalent,
 * only a custom dev client / EAS build with something like `react-native-bluetooth-escpos-printer`
 * wired in and paired against real hardware to test. That's out of scope for this environment
 * (no physical printer, and the whole app has been developed/tested against Expo Go so far).
 *
 * What *is* here and fully working: printing via the OS print dialog (expo-print), which many
 * modern thermal/receipt printers support directly (Mopria on Android, AirPrint on iOS) without
 * any custom native code. The ESC/POS byte builder (escpos.ts) is ready for a Bluetooth transport
 * to be dropped in later — printReceiptHtml() below is the only function that would need to grow
 * a second implementation.
 */
export async function printReceiptHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

export async function receiptPdfUri(html: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}
