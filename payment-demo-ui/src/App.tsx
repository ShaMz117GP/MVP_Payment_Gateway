import { useMemo, useState } from "react";
import {
  ApiClientError,
  authorisePayment,
  capturePayment,
  createPayment,
  getPaymentById,
  getPaymentHistory,
  normalizeBaseUrl,
  refundPayment,
} from "./api/client";
import type { ApiConfig } from "./types/api";
import type {
  CreatePaymentRequest,
  PaymentHistoryEntry,
  PaymentSummary,
} from "./types/payment";

const DEFAULT_API_BASE = "http://localhost:5206";
type ProcessorMode = "success" | "decline" | "timeout";
type FeedbackKind = "success" | "error" | "info";
type FeedbackSource = "expected" | "unexpected";
const DEFAULT_CREATE_FORM = {
  amount: "100.00",
  currency: "ZAR",
  cardNumber: "4111111111111111",
  cardHolder: "Demo User",
  expiry: "12/29",
  cvv: "123",
};

function getDefaultCreateForm() {
  return { ...DEFAULT_CREATE_FORM };
}

function newDemoIdempotencyKey() {
  const seed = Math.random().toString(36).slice(2, 10);
  return `demo-${seed}`;
}

function toStatusLabel(status: unknown): string {
  if (typeof status === "number") {
    switch (status) {
      case 1:
        return "Created";
      case 2:
        return "Authorised";
      case 3:
        return "Captured";
      case 4:
        return "Refunded";
      default:
        return String(status);
    }
  }

  if (typeof status === "string") {
    return status;
  }

  return "-";
}

export default function App() {
  const [config, setConfig] = useState<ApiConfig>({ baseUrl: DEFAULT_API_BASE });
  const [idempotencyKey, setIdempotencyKey] = useState("demo-key-1");
  const [createForm, setCreateForm] = useState(getDefaultCreateForm);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [processorMode, setProcessorMode] = useState<ProcessorMode>("success");
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: FeedbackKind;
    source: FeedbackSource;
    message: string;
    details?: string;
  } | null>(null);

  const normalizedBaseUrl = useMemo(() => normalizeBaseUrl(config.baseUrl), [config.baseUrl]);
  const hasSelectedPayment = selectedPaymentId.trim().length > 0;
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [history]
  );
  const paymentStatusLabel = useMemo(() => toStatusLabel(payment?.status), [payment?.status]);
  const keyTimes = useMemo(() => {
    const firstByStatus: Record<string, string | null> = {
      Authorised: null,
      Captured: null,
      Refunded: null,
    };

    for (const entry of history) {
      const statusLabel = toStatusLabel(entry.status);
      if (statusLabel in firstByStatus && !firstByStatus[statusLabel]) {
        firstByStatus[statusLabel] = entry.at;
      }
    }

    return firstByStatus;
  }, [history]);

  function setError(error: unknown) {
    if (error instanceof ApiClientError) {
      const mapped = mapBusinessError(error);
      setFeedback({
        kind: "error",
        source: "expected",
        message: mapped.message,
        details: error.body ? JSON.stringify(error.body, null, 2) : undefined,
      });
      return;
    }

    setFeedback({
      kind: "error",
      source: "unexpected",
      message: "Unexpected error.",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  function mapBusinessError(error: ApiClientError): { message: string } {
    if (error.status === 400) {
      return { message: `Validation failed: ${error.message}` };
    }

    if (error.status === 404) {
      return { message: "Payment not found." };
    }

    if (error.status === 409) {
      return { message: `Invalid lifecycle transition or idempotency conflict: ${error.message}` };
    }

    if (error.status === 504) {
      return { message: "Processor timeout. Please retry or use a different processor mode." };
    }

    if (error.status === 402) {
      return { message: "Processor declined the payment." };
    }

    return { message: `Business error (${error.status}): ${error.message}` };
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshPaymentAndHistory(id: string) {
    const [nextPayment, nextHistory] = await Promise.all([
      getPaymentById(normalizedBaseUrl, id),
      getPaymentHistory(normalizedBaseUrl, id),
    ]);
    setPayment(nextPayment);
    setHistory(nextHistory);
  }

  async function onCreatePayment() {
    await runAction(async () => {
      const amount = Number(createForm.amount);
      const currency = createForm.currency.trim().toUpperCase();
      const cardNumberDigits = createForm.cardNumber.replace(/\s+/g, "");
      const cardLast4 = cardNumberDigits.slice(-4);
      const cardHolder = createForm.cardHolder.trim();
      const expiry = createForm.expiry.trim();
      const cvv = createForm.cvv.trim();
      const idemKey = idempotencyKey.trim();

      if (!idemKey) {
        setFeedback({ kind: "error", source: "expected", message: "Idempotency key is required." });
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        setFeedback({ kind: "error", source: "expected", message: "Amount must be a number greater than 0." });
        return;
      }

      if (!/^[A-Z]{3}$/.test(currency)) {
        setFeedback({
          kind: "error",
          source: "expected",
          message: "Currency must be 3 letters (example: ZAR).",
        });
        return;
      }

      if (!/^\d{12,19}$/.test(cardNumberDigits)) {
        setFeedback({ kind: "error", source: "expected", message: "Card number must be 12 to 19 digits." });
        return;
      }

      if (!cardHolder) {
        setFeedback({ kind: "error", source: "expected", message: "Card holder is required." });
        return;
      }

      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        setFeedback({ kind: "error", source: "expected", message: "Expiry must be in MM/YY format." });
        return;
      }

      if (!/^\d{3,4}$/.test(cvv)) {
        setFeedback({ kind: "error", source: "expected", message: "CVV must be 3 or 4 digits." });
        return;
      }

      const payload: CreatePaymentRequest = {
        amount,
        currency,
        cardLast4,
        merchantReference: `DEMO-${cardHolder.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)}-${expiry.replace("/", "")}`,
      };

      const result = await createPayment(normalizedBaseUrl, idemKey, payload);

      setPayment(result.payment);
      setSelectedPaymentId(result.payment.id);
      await refreshPaymentAndHistory(result.payment.id);
      setFeedback({
        kind: "success",
        source: "expected",
        message: result.idempotentReplay ? "Idempotent replay returned stored response." : "Payment created.",
      });
    });
  }

  async function onRefreshPayment() {
    await runAction(async () => {
      if (!selectedPaymentId.trim()) {
        setFeedback({ kind: "info", source: "expected", message: "Enter a payment id first." });
        return;
      }

      const nextPayment = await getPaymentById(normalizedBaseUrl, selectedPaymentId.trim());
      setPayment(nextPayment);
      setFeedback({ kind: "success", source: "expected", message: "Payment refreshed." });
    });
  }

  async function onRefreshHistory() {
    await runAction(async () => {
      if (!selectedPaymentId.trim()) {
        setFeedback({ kind: "info", source: "expected", message: "Enter a payment id first." });
        return;
      }

      const nextHistory = await getPaymentHistory(normalizedBaseUrl, selectedPaymentId.trim());
      setHistory(nextHistory);
      setFeedback({ kind: "success", source: "expected", message: "History refreshed." });
    });
  }

  async function onAuthorise() {
    await runAction(async () => {
      if (!selectedPaymentId.trim()) {
        setFeedback({ kind: "info", source: "expected", message: "Enter a payment id first." });
        return;
      }

      await authorisePayment(normalizedBaseUrl, selectedPaymentId.trim(), processorMode);
      await refreshPaymentAndHistory(selectedPaymentId.trim());
      setFeedback({
        kind: "success",
        source: "expected",
        message: `Authorise called with mode: ${processorMode}.`,
      });
    });
  }

  async function onCapture() {
    await runAction(async () => {
      if (!selectedPaymentId.trim()) {
        setFeedback({ kind: "info", source: "expected", message: "Enter a payment id first." });
        return;
      }

      await capturePayment(normalizedBaseUrl, selectedPaymentId.trim());
      await refreshPaymentAndHistory(selectedPaymentId.trim());
      setFeedback({ kind: "success", source: "expected", message: "Capture successful." });
    });
  }

  async function onRefund() {
    await runAction(async () => {
      if (!selectedPaymentId.trim()) {
        setFeedback({ kind: "info", source: "expected", message: "Enter a payment id first." });
        return;
      }

      await refundPayment(normalizedBaseUrl, selectedPaymentId.trim());
      await refreshPaymentAndHistory(selectedPaymentId.trim());
      setFeedback({ kind: "success", source: "expected", message: "Refund successful." });
    });
  }

  function generateIdempotencyKey() {
    setIdempotencyKey(newDemoIdempotencyKey());
  }

  function prefillSampleValues() {
    setCreateForm(getDefaultCreateForm());
    setIdempotencyKey(newDemoIdempotencyKey());
    setFeedback({
      kind: "info",
      source: "expected",
      message: "Sample values loaded with a fresh idempotency key.",
    });
  }

  function resetPageState() {
    setCreateForm(getDefaultCreateForm());
    setIdempotencyKey("demo-key-1");
    setSelectedPaymentId("");
    setProcessorMode("success");
    setPayment(null);
    setHistory([]);
    setFeedback({
      kind: "info",
      source: "expected",
      message: "Page state reset.",
    });
  }

  return (
    <main className="page">
      <h1>Payment Gateway Demo UI</h1>
      <p className="sub">One-page demo client focused on payment lifecycle behavior.</p>
      <section className="card">
        <h2>API Configuration</h2>
        <label>
          Base URL
          <input
            value={config.baseUrl}
            onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))}
            placeholder="http://localhost:5206"
          />
        </label>
      </section>
      <section className="card">
        <h2>Demo Helpers</h2>
        <p className="hint">
          Suggested order: Create {"->"} Authorise {"->"} Capture {"->"} Refund {"->"} Refresh History.
        </p>
        <div className="actions">
          <button className="action-btn secondary-btn" disabled={isBusy} onClick={prefillSampleValues}>
            Prefill Sample Values
          </button>
          <button className="action-btn secondary-btn" disabled={isBusy} onClick={generateIdempotencyKey}>
            New Idempotency Key
          </button>
          <button className="action-btn secondary-btn" disabled={isBusy} onClick={resetPageState}>
            Reset Page State
          </button>
        </div>
      </section>
      <section className="loading-strip" aria-live="polite">
        {isBusy ? "Working..." : "Ready"}
      </section>
      <section className="card">
        <h2>Payment Creation Form</h2>
        <div className="grid">
          <label>
            Amount
            <input
              value={createForm.amount}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  amount: e.target.value,
                }))
              }
            />
          </label>
          <label>
            Currency
            <input
              value={createForm.currency}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  currency: e.target.value,
                }))
              }
            />
          </label>
          <label>
            Card Number
            <input
              value={createForm.cardNumber}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  cardNumber: e.target.value,
                }))
              }
            />
          </label>
          <label>
            Card Holder
            <input
              value={createForm.cardHolder}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  cardHolder: e.target.value,
                }))
              }
            />
          </label>
          <label>
            Expiry (MM/YY)
            <input
              value={createForm.expiry}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  expiry: e.target.value,
                }))
              }
            />
          </label>
          <label>
            CVV
            <input
              value={createForm.cvv}
              onChange={(e) =>
                setCreateForm((current) => ({
                  ...current,
                  cvv: e.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>
              Idempotency Key{" "}
              <span
                title="Used to safely retry create payment. Same key + same payload replays the original result; same key + different payload returns conflict."
              >
                (?)
              </span>
            </span>
            <div className="inline-field">
              <input value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} />
              <button className="secondary-btn" type="button" disabled={isBusy} onClick={generateIdempotencyKey}>
                Generate
              </button>
            </div>
          </label>
        </div>
        <button className="action-btn" disabled={isBusy} onClick={onCreatePayment}>
          Create / Replay Payment
        </button>
        <p className="hint">
          Replay tip: keep the same form values and same idempotency key, then submit again.
        </p>
      </section>

      <section className="card">
        <h2>Payment Actions Panel</h2>
        <div className="grid">
          <label>
            Selected Payment ID
            <input value={selectedPaymentId} onChange={(e) => setSelectedPaymentId(e.target.value)} />
          </label>
          <label>
            Processor Mode
            <select value={processorMode} onChange={(e) => setProcessorMode(e.target.value as ProcessorMode)}>
              <option value="success">success</option>
              <option value="decline">decline</option>
              <option value="timeout">timeout</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button className="action-btn" disabled={isBusy || !hasSelectedPayment} onClick={onAuthorise}>
            Authorise
          </button>
          <button className="action-btn" disabled={isBusy || !hasSelectedPayment} onClick={onCapture}>
            Capture
          </button>
          <button className="action-btn" disabled={isBusy || !hasSelectedPayment} onClick={onRefund}>
            Refund (Full)
          </button>
          <button className="action-btn" disabled={isBusy || !hasSelectedPayment} onClick={onRefreshPayment}>
            Refresh Payment
          </button>
          <button className="action-btn" disabled={isBusy || !hasSelectedPayment} onClick={onRefreshHistory}>
            Refresh History
          </button>
        </div>
        <p className="hint">Actions require a selected payment id. Refund is full refund only.</p>
      </section>

      <section className="card">
        <h2>Payment Details Panel</h2>
        {!payment ? (
          <p className="hint">No payment loaded.</p>
        ) : (
          <div className="details-grid">
            <p>
              <strong>Current Status:</strong>{" "}
              <span className={`status-badge status-${paymentStatusLabel.toLowerCase()}`}>{paymentStatusLabel}</span>
            </p>
            <p>
              <strong>Payment ID:</strong> {payment.id}
            </p>
            <p>
              <strong>Amount:</strong> {payment.amount}
            </p>
            <p>
              <strong>Currency:</strong> {payment.currency}
            </p>
            <p>
              <strong>Created At:</strong> {payment.createdAt}
            </p>
            <p>
              <strong>Authorised At:</strong> {keyTimes.Authorised ?? "-"}
            </p>
            <p>
              <strong>Captured At:</strong> {keyTimes.Captured ?? "-"}
            </p>
            <p>
              <strong>Refunded At:</strong> {keyTimes.Refunded ?? "-"}
            </p>
            <p>
              <strong>Captured Amount:</strong>{" "}
              {paymentStatusLabel === "Captured" || paymentStatusLabel === "Refunded" ? payment.amount : "-"}
            </p>
            <p>
              <strong>Refunded Amount:</strong> {paymentStatusLabel === "Refunded" ? payment.amount : "-"}
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Payment History Panel</h2>
        <p className="hint">Current payment state is derived from these state transition events.</p>
        {sortedHistory.length === 0 ? (
          <p className="hint">No history loaded.</p>
        ) : (
          <div className="history-list">
            {sortedHistory.map((entry) => (
              <div className="history-item" key={entry.id}>
                <p>
                  <strong>Event:</strong> {toStatusLabel(entry.status)}
                </p>
                <p>
                  <strong>Timestamp:</strong> {entry.at}
                </p>
                <p>
                  <strong>Reason:</strong> {entry.note || "-"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Feedback / Error Message Area</h2>
        <p>
          API Base URL: <strong>{normalizedBaseUrl || "-"}</strong>
        </p>
        <p>
          Busy: <strong>{isBusy ? "yes" : "no"}</strong>
        </p>
        {feedback ? (
          <div className={`feedback ${feedback.kind}`}>
            <p>
              <strong>Type:</strong> {feedback.kind}
            </p>
            <p>
              <strong>Source:</strong> {feedback.source}
            </p>
            <p>
              <strong>Message:</strong> {feedback.message}
            </p>
            {feedback.details ? (
              <>
                <p>
                  <strong>Details:</strong>
                </p>
                <pre>{feedback.details}</pre>
              </>
            ) : null}
          </div>
        ) : (
          <p className="hint">No feedback yet.</p>
        )}
      </section>
    </main>
  );
}
