# Payment Gateway MVP (.NET 8)

Simple payment gateway MVP built for a time-boxed assessment.

## What was built

- ASP.NET Core minimal API (`.NET 8`)
- EF Core + SQLite persistence
- Explicit payment lifecycle:
  - `Created -> Authorised -> Captured -> Refunded`
- Endpoints:
  - `POST /payments` (create + idempotency)
  - `POST /payments/{id}/authorise` (fake processor)
  - `POST /payments/{id}/capture`
  - `POST /payments/{id}/refund`
  - `GET /payments/{id}`
  - `GET /payments/{id}/history`
- Idempotency with `Idempotency-Key`:
  - same key + same payload => replay stored response
  - same key + different payload => `409 Conflict`
- Fake processor simulation:
  - `success`, `decline`, `timeout`
  - deterministic override via `X-Processor-Mode` header
- Minimal test suite focused on:
  - idempotency
  - lifecycle
  - one failure path

## Run locally

From `PaymentGatewayMvp` (one command, opens API + UI terminals):

- `.\start-demo.cmd`

From `PaymentGatewayMvp/PaymentGatewayMvpApp`:

- `dotnet run`

From `PaymentGatewayMvp/PaymentGatewayMvpApp.Tests`:

- `dotnet test`

## Design principles used

- Keep logic explicit
- Keep state transitions obvious
- Avoid overengineering
- Keep behavior easy to explain in an interview/demo

## Demo UI (thin client)

The React UI exists only to support the walkthrough. It is a thin client over the API, not a merchant-facing product.

- Scope is intentionally limited to create, authorise, capture, refund, payment details, and history.
- It does not include auth, routing complexity, dashboards, reporting, or product-level UX features.
- Backend correctness (idempotency, lifecycle rules, audit/history, processor outcomes) is the priority; the UI only exposes those behaviors clearly.

Run the UI from `PaymentGatewayMvp/payment-demo-ui`:

- `npm install`
- `npm run dev`

Connection to backend:

- Run the API first from `PaymentGatewayMvp/PaymentGatewayMvpApp` with `dotnet run`.
- In the UI, set the API Base URL to the running API URL (for example `http://localhost:5031`).
- UI requests call the existing backend endpoints directly; no extra BFF/proxy layer is used.
