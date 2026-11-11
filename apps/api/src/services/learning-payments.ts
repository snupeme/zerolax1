import type { Db } from "@zerolax/db";
import { ApiError } from "../errors";

// Provider adapters must authenticate the raw webhook and/or query the provider's official API.
// No adapter, price or duration is registered by default. Browser success messages are never accepted.
export interface VerifiedPaymentEvent {
  eventId: string;
  paymentId: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  status: "succeeded" | "pending" | "failed" | "refunded" | "expired";
}
export interface PaymentProvider {
  name: string;
  createCheckout(input: {
    paymentId: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ url: string; transactionId: string }>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, unknown>,
  ): Promise<VerifiedPaymentEvent>;
}
export interface PaymentPlan {
  provider: PaymentProvider;
  amountMinor: number;
  currency: string;
  durationSeconds: number;
}
export async function applyVerifiedPayment(
  db: Db,
  provider: string,
  event: VerifiedPaymentEvent,
) {
  await db.transaction(async (tx) => {
    const [payment] = await tx.query<{
      id: string;
      user_id: string;
      provider: string;
      provider_transaction_id: string | null;
      amount_minor: string;
      currency: string;
      duration_seconds: number;
      status: string;
    }>("select * from learning_payments where id=$1 for update", [
      event.paymentId,
    ]);
    if (
      !payment ||
      payment.provider !== provider ||
      Number(payment.amount_minor) !== event.amountMinor ||
      payment.currency !== event.currency ||
      (payment.provider_transaction_id &&
        payment.provider_transaction_id !== event.transactionId)
    )
      throw new ApiError(
        400,
        "PAYMENT_MISMATCH",
        "Payment verification mismatch",
      );
    const prior = await tx.query(
      "select event_id from learning_payment_events where provider=$1 and event_id=$2",
      [provider, event.eventId],
    );
    if (prior.length) return;
    if (
      payment.status === "refunded" ||
      (payment.status === "succeeded" && event.status !== "refunded")
    )
      return;
    if (
      payment.status !== "pending" &&
      payment.status !== "succeeded" &&
      event.status !== "refunded"
    )
      return;
    await tx.query(
      "insert into learning_payment_events(provider,event_id,payment_id,status) values($1,$2,$3,$4)",
      [provider, event.eventId, payment.id, event.status],
    );
    await tx.query(
      "update learning_payments set status=$2,provider_transaction_id=$3,verified_at=now(),updated_at=now() where id=$1",
      [payment.id, event.status, event.transactionId],
    );
    if (event.status === "succeeded")
      await tx.query(
        `insert into learning_subscriptions(user_id,source,starts_at,expires_at,payment_id) values($1,'payment',now(),now()+$2*interval '1 second',$3) on conflict(payment_id) do nothing`,
        [payment.user_id, payment.duration_seconds, payment.id],
      );
    if (event.status === "refunded")
      await tx.query(
        "update learning_subscriptions set revoked_at=now() where payment_id=$1",
        [payment.id],
      );
  });
}
