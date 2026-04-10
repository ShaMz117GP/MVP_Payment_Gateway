# Payment Gateway MVP Notes

## Scope
- In-memory only (no database).
- Explicit lifecycle rules.
- Deterministic processor simulation.
- Idempotency on `POST /payments` using `Idempotency-Key` header.

## Lifecycle
- Create starts as `Pending`.
- Processor simulation immediately transitions:
  - to `Authorized` when amount in cents is even.
  - to `Failed` when amount in cents is odd.
- Capture allowed only from `Authorized` -> `Captured`.
- Cancel allowed from `Pending` or `Authorized` -> `Cancelled`.
- `Captured`, `Cancelled`, and `Failed` are treated as terminal states.

## Idempotency
- If the same `Idempotency-Key` and same payload are sent again, the same create response is returned with `IdempotentReplay = true`.
- If the same key is used with a different payload, API returns `409 Conflict`.

## Audit Trail
- Each payment records timestamped events:
  - Created
  - AuthorizationResult
  - Captured (if captured)
  - Cancelled (if cancelled)
- Available via `GET /payments/{id}/audit`.
