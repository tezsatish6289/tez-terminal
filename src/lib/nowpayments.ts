/**
 * NOWPayments API client.
 * Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 */

const API_BASE = "https://api.nowpayments.io/v1";

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not configured");
  return key;
}

export function getIpnSecret(): string {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) throw new Error("NOWPAYMENTS_IPN_SECRET is not configured");
  return secret;
}

async function apiCall(method: string, endpoint: string, body?: Record<string, any>) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `NOWPayments API error: ${res.status}`);
  }
  return data;
}

export interface CreatePaymentParams {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  ipn_callback_url: string;
}

export interface CreatePaymentResponse {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: number;
  created_at: string;
  updated_at: string;
  expiration_estimate_date: string;
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  return apiCall("POST", "/payment", params);
}

export interface PaymentStatusResponse {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: number;
  created_at: string;
  updated_at: string;
  outcome_amount: number;
  outcome_currency: string;
}

export async function getPaymentStatus(paymentId: number): Promise<PaymentStatusResponse> {
  return apiCall("GET", `/payment/${paymentId}`);
}

export async function getEstimatedPrice(
  amount: number,
  currencyFrom: string,
  currencyTo: string
): Promise<{ estimated_amount: number }> {
  return apiCall(
    "GET",
    `/estimate?amount=${amount}&currency_from=${currencyFrom}&currency_to=${currencyTo}`
  );
}

export async function getMinimumPaymentAmount(
  currencyFrom: string,
  currencyTo: string
): Promise<{ min_amount: number }> {
  return apiCall(
    "GET",
    `/min-amount?currency_from=${currencyFrom}&currency_to=${currencyTo}`
  );
}

export async function getApiStatus(): Promise<{ message: string }> {
  return apiCall("GET", "/status");
}
