/**
 * Razorpay SDK double and signed-webhook fixtures, for the integration suite.
 *
 * The implementation lives at
 * `src/modules/billing/__tests__/razorpay-mock.ts` and this file re-exports it,
 * for one structural reason: `apps/api/tsconfig.json` sets `rootDir: "src"` and
 * excludes `tests`, so a unit test under `src/**\/__tests__` cannot import from
 * this directory — tsc rejects it with TS6059. `payment.service.test.ts` is such
 * a unit test and needs the same double the integration tests use.
 *
 * Defining it once under `src` and re-exporting here means the two suites share
 * a single double (a divergent second copy is how a mock stops resembling the
 * thing it stands for) AND the double itself gets typechecked, which nothing
 * under `tests/` currently is. `emr.fixtures.ts` sets the precedent for a
 * non-test helper living inside a `src/**\/__tests__` directory; vitest collects
 * only `*.test.ts`, so neither file is mistaken for a suite.
 *
 * Import from here in `tests/**` and from the `src` path in `src/**`. Plan
 * 06-10's webhook tests are integration tests, so they use this path.
 */
export {
  buildRazorpayMock,
  paymentLinkFixture,
  paymentLinkPaidWebhookFixture,
  refundFixture,
  refundProcessedWebhookFixture,
  signWebhookPayload,
} from '../../src/modules/billing/__tests__/razorpay-mock.js';

export type {
  PaymentLinkFixtureOverrides,
  RazorpayMock,
  RazorpayMockOverrides,
} from '../../src/modules/billing/__tests__/razorpay-mock.js';
