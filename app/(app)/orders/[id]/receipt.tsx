import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getOrder, updateOrderContact, voidOrder } from '@/features/orders/orderService';
import { needsVoidOverride } from '@/features/auth/permissions';
import {
  computeTaxComponentBreakdown,
  toReceiptLineItems,
} from '@/features/receipts/receiptEngine';
import {
  buildReceiptHtml,
  buildReceiptText,
  estimateReceiptPdfHeightPx,
  RECEIPT_PDF_WIDTH_PX,
  type ReceiptInput,
} from '@/features/receipts/receiptHtml';
import { printReceiptHtml, receiptPdfUri } from '@/features/receipts/printerService';
import {
  sendReceiptEmail,
  sendReceiptSms,
  shareReceiptFile,
  shareReceiptPdfToWhatsApp,
} from '@/features/receipts/shareService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { PinOverrideModal } from '@/components/PinOverrideModal';

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const restaurant = useAuthStore((s) => s.restaurant)!;

  const currentUser = useAuthStore((s) => s.currentUser)!;
  const orderQuery = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });
  const order = orderQuery.data;

  const [phone, setPhone] = useState(order?.customerName ? (order.customerPhone ?? '') : '');
  const [email, setEmail] = useState(order?.customerEmail ?? '');
  const [voidReason, setVoidReason] = useState('');
  const [voidOverrideVisible, setVoidOverrideVisible] = useState(false);

  const receiptInput: ReceiptInput | null = useMemo(() => {
    if (!order) return null;
    const taxComponents = computeTaxComponentBreakdown(order.items);
    const lineItems = toReceiptLineItems(
      order.items.map((item) => ({
        ...item,
        modifierNames: item.modifiers.map((m) => m.nameSnapshot),
      })),
    );
    return {
      business: {
        name: restaurant.name,
        addressLine1: restaurant.addressLine1,
        addressLine2: restaurant.addressLine2,
        city: restaurant.city,
        state: restaurant.state,
        postalCode: restaurant.postalCode,
        phone: restaurant.phone,
        taxIdLabel: restaurant.taxIdLabel,
        taxId: restaurant.taxId,
        invoiceFooterText: restaurant.invoiceFooterText,
        currencySymbol: restaurant.currencySymbol,
      },
      order: {
        invoiceNumber: order.invoiceNumber,
        orderType: order.orderType,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        createdAt: new Date(order.createdAt),
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        serviceChargeTotal: order.serviceChargeTotal,
        roundingAdjustment: order.roundingAdjustment,
        grandTotal: order.grandTotal,
      },
      lineItems,
      taxComponents,
    };
  }, [order, restaurant]);

  const printMutation = useMutation({
    mutationFn: async () => {
      const result = await printReceiptHtml(buildReceiptHtml(receiptInput!));
      if (!result.success) {
        throw new Error(result.message || 'Print failed. Bill saved locally.');
      }
      Alert.alert('Success', 'Receipt sent to printer.');
    },
    onError: (e) => Alert.alert('Print Error', e instanceof Error ? e.message : String(e)),
  });

  async function generateReceiptPdf() {
    const html = buildReceiptHtml(receiptInput!);
    const heightPx = estimateReceiptPdfHeightPx(receiptInput!);
    return receiptPdfUri(html, RECEIPT_PDF_WIDTH_PX, heightPx);
  }

  const shareMutation = useMutation({
    mutationFn: async () => shareReceiptFile(await generateReceiptPdf()),
    onError: (e) => Alert.alert('Share failed', e instanceof Error ? e.message : String(e)),
  });

  const smsMutation = useMutation({
    mutationFn: async () => {
      await sendReceiptSms(phone, buildReceiptText(receiptInput!));
      await updateOrderContact(id, { customerPhone: phone });
    },
    onError: (e) => Alert.alert('SMS failed', e instanceof Error ? e.message : String(e)),
  });

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      await shareReceiptPdfToWhatsApp(await generateReceiptPdf());
      await updateOrderContact(id, { customerPhone: phone });
    },
    onError: (e) => Alert.alert('WhatsApp failed', e instanceof Error ? e.message : String(e)),
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      const pdfUri = await generateReceiptPdf();
      const body = `Hi,\n\nThank you for dining with us! Please find your receipt attached.\n\n${receiptInput!.business.name}`;
      await sendReceiptEmail(email, `Receipt ${order?.invoiceNumber ?? ''}`, body, pdfUri);
      await updateOrderContact(id, { customerEmail: email });
    },
    onError: (e) => Alert.alert('Email failed', e instanceof Error ? e.message : String(e)),
  });

  const voidMutation = useMutation({
    mutationFn: (approvedByStaffId?: string) =>
      voidOrder(id, { staffId: currentUser.id, reason: voidReason, approvedByStaffId }),
    onSuccess: () => {
      orderQuery.refetch();
      router.dismissTo('/orders');
    },
    onError: (e) => Alert.alert('Void failed', e instanceof Error ? e.message : String(e)),
  });

  function onVoidPress() {
    if (!voidReason.trim()) {
      Alert.alert('Reason required', 'Enter a reason before voiding this bill.');
      return;
    }
    if (needsVoidOverride(currentUser.role)) {
      setVoidOverrideVisible(true);
      return;
    }
    voidMutation.mutate(undefined);
  }

  if (!order || !receiptInput) return null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.receiptCard}>
          <Text style={styles.businessName}>{receiptInput.business.name}</Text>
          {receiptInput.business.addressLine1 && (
            <Text style={styles.muted}>{receiptInput.business.addressLine1}</Text>
          )}
          {receiptInput.business.taxId && (
            <Text style={styles.muted}>
              {receiptInput.business.taxIdLabel}: {receiptInput.business.taxId}
            </Text>
          )}

          <View style={styles.divider} />
          <Text style={styles.meta}>Invoice: {order.invoiceNumber ?? '—'}</Text>
          <Text style={styles.meta}>{ORDER_TYPE_LABEL[order.orderType]}</Text>
          <Text style={styles.meta}>{new Date(order.createdAt).toLocaleString()}</Text>
          <View style={styles.divider} />

          {receiptInput.lineItems.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>
                {item.quantity}× {item.name}
              </Text>
              <Text style={styles.itemTotal}>₹{item.lineTotal.toFixed(2)}</Text>
            </View>
          ))}

          <View style={styles.divider} />
          <TotalRow label="Subtotal" value={order.subtotal} />
          {order.discountTotal > 0 && <TotalRow label="Discount" value={-order.discountTotal} />}
          {receiptInput.taxComponents.map((c) => (
            <TotalRow key={c.label} label={c.label} value={c.amount} />
          ))}
          {order.serviceChargeTotal > 0 && (
            <TotalRow label="Service charge" value={order.serviceChargeTotal} />
          )}
          {order.roundingAdjustment !== 0 && (
            <TotalRow label="Rounding" value={order.roundingAdjustment} />
          )}
          <TotalRow label="Total" value={order.grandTotal} emphasize />
        </View>

        <Button
          label={printMutation.isPending ? 'Printing…' : 'Print receipt'}
          onPress={() => printMutation.mutate()}
          style={styles.button}
        />
        <Button label="Done" onPress={() => router.dismissTo('/orders')} style={styles.button} />
        <Button
          label="Share as PDF"
          variant="secondary"
          onPress={() => shareMutation.mutate()}
          style={styles.button}
        />

        <Text style={styles.sectionLabel}>Send digitally</Text>
        <FormField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="For SMS / WhatsApp"
        />
        <View style={styles.row}>
          <Button
            label="SMS"
            variant="secondary"
            onPress={() => smsMutation.mutate()}
            disabled={!phone.trim()}
            style={{ flex: 1 }}
          />
          <Button
            label="WhatsApp"
            variant="secondary"
            onPress={() => whatsappMutation.mutate()}
            disabled={!phone.trim()}
            style={{ flex: 1 }}
          />
        </View>
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="For email receipt"
        />
        <Button
          label="Email receipt"
          variant="secondary"
          onPress={() => emailMutation.mutate()}
          disabled={!email.trim()}
          style={styles.button}
        />

        {order.status === 'paid' && (
          <>
            <Text style={styles.sectionLabel}>Void this bill</Text>
            <FormField
              label="Reason"
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Required to void"
            />
            <Button
              label="Void Order"
              variant="danger"
              onPress={onVoidPress}
              style={styles.button}
            />
          </>
        )}
      </ScrollView>

      <PinOverrideModal
        visible={voidOverrideVisible}
        restaurantId={order.restaurantId}
        title="Manager approval needed"
        message="Voiding a bill needs an owner/admin PIN to approve."
        onApprove={(approverId) => {
          setVoidOverrideVisible(false);
          voidMutation.mutate(approverId);
        }}
        onCancel={() => setVoidOverrideVisible(false)}
      />
    </View>
  );
}

function TotalRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, emphasize && styles.totalEmphasize]}>{label}</Text>
      <Text style={[styles.totalValue, emphasize && styles.totalEmphasize]}>
        {value < 0 ? '-' : ''}₹{Math.abs(value).toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  receiptCard: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 20 },
  businessName: { fontSize: 18, fontWeight: '700' },
  muted: { color: '#666', fontSize: 12, marginTop: 2 },
  meta: { fontSize: 13, color: '#333' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemName: { fontSize: 13, flex: 1 },
  itemTotal: { fontSize: 13, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalLabel: { fontSize: 13, color: '#666' },
  totalValue: { fontSize: 13 },
  totalEmphasize: { fontSize: 16, fontWeight: '700', color: '#111' },
  button: { marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 8, color: '#333' },
});
