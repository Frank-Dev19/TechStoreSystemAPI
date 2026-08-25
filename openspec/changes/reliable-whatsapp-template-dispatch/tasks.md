# Tasks

## 1. Contracts

- [x] 1.1 Specify aggregate post-commit intake notification behavior.
- [x] 1.2 Specify the three-variable single-template intake contract.
- [x] 1.3 Specify regression coverage for all active template payloads.

## 2. Tests

- [x] 2.1 Add a failing aggregate post-commit dispatch test.
- [x] 2.2 Add failing intake template and message-matrix contract tests.
- [x] 2.3 Complete active-template contract coverage.

## 3. Implementation

- [x] 3.1 Extract intake preparation into a reusable notification service.
- [x] 3.2 Invoke it from aggregate creation after commit while preserving the compatibility path.
- [x] 3.3 Align intake variables, buttons, language and environment defaults.

## 4. Verification

- [x] 4.1 Run focused Jest suites.
- [x] 4.2 Run TypeScript typecheck and production build.
- [x] 4.3 Run `git diff --check` and compare implementation to every scenario.
