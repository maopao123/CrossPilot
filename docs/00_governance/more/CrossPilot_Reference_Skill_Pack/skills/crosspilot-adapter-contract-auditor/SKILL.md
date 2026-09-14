---
name: crosspilot-adapter-contract-auditor
description: Audit CrossPilot commerce adapters and mock stores for contract parity, credential isolation, explicit unsupported fields, error envelopes, retries and deterministic testability. Use when adding Amazon, Shopify, ERP or simulator adapters.
---
# Adapter Contract Auditor

## Core principle
Mock, simulator, and real adapters implement the same port. Business logic above the adapter must not forge dedicated fake-success paths; however, execution mode isolation (MOCK / SIMULATOR / LIVE), truthfulness labeling (`ExecutionEvidence.mode`), and fail-closed capability guards must be strictly preserved. SIMULATOR (deterministic advancing world) is distinct from pure static MOCK.

## Check
- same DTO semantics across adapters.
- missing fields return null/unsupported, not fake values.
- credential stays server-side and never reaches model/tool args.
- tool error contains code, category, retryability, why and suggested fix.
- rate limit/retry/circuit-breaker behavior is bounded.
- deterministic seed for mock data.
- mock has realistic historical scenarios but explicitly unsupported platform-only behavior.

## Error envelope
code, category, message, why, retryable, retryAfterMs, suggestedFix, docsRef.
