# SOLUTION

## What I built

I built a small, end-to-end payment gateway MVP with:

- API endpoints for create, authorise, capture, refund, and read
- SQLite persistence via EF Core for:
  - payments
  - history entries
  - idempotency records
- Explicit lifecycle rules and transition validation
- Processor simulation with controlled outcomes
- Focused automated tests for critical behavior

The implementation favors straightforward service logic over abstraction-heavy architecture.

## What I left out

Intentionally excluded for MVP scope:

- Authentication and authorization
- Real payment processor integration
- Queues, retries, background workers
- Distributed locks / multi-node idempotency hardening
- Search/list/pagination endpoints
- Partial refunds and multi-capture support
- Advanced observability (metrics dashboards, tracing pipelines)
- Full migration pipeline / deployment infrastructure

## Why I left these out

This is a 4-hour MVP. The goal is correctness of core flows, clarity of logic, and easy explainability.

The most important risks were:

1. duplicate creates (idempotency)
2. invalid state transitions (lifecycle rules)
3. missing traceability (history/audit)
4. external dependency uncertainty (processor simulation)

Time was invested in those areas first, and non-essential platform concerns were deferred.

## Trade-off summary

- **Pros**: small codebase, explicit behavior, easy to review and reason about
- **Cons**: not production-hardened, intentionally limited features

This is deliberate: a clean MVP foundation that can be extended in later phases.


UI / Demo Approach

The brief did not explicitly require a user interface, and the core requirements were centred around backend correctness (idempotency, lifecycle, auditability, and processor reliability).

Given that, I initially treated the system as an API-first implementation and validated all behaviour through direct API interaction.

However, for the purposes of the demo, I added a minimal UI layer. The goal was not to build a full front-end, but to provide a clearer and more controlled way to demonstrate the payment lifecycle, idempotency behaviour, and processor failure modes without relying on external tools like Swagger or Postman.

The UI is intentionally thin and does not introduce additional business logic. It simply surfaces the backend behaviour in a way that is easier to walkthrough in the demo.