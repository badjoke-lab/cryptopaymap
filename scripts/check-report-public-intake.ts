import { reportClientConfigurationSchema } from '../src/submissions/report-client-config';
import {
  buildReportSubmissionIntakeFromBrowserForm,
  emptyReportBrowserFormValues,
} from '../src/submissions/report-browser-contract';
import { reportSubmissionIntakeSchema } from '../src/submissions/report-contract';

const targetId = '10000000-0000-4000-8000-000000000001';
const values = emptyReportBrowserFormValues('2026-07-13', 'entity', targetId);
values.privacyNoticeAccepted = true;
values.submissionTermsAccepted = true;
values.assetSlug = 'btc';
values.networkSlug = 'bitcoin';
values.paymentContext = 'qr_code';
values.observedSteps = 'The merchant confirmed the payment.';

reportSubmissionIntakeSchema.parse(buildReportSubmissionIntakeFromBrowserForm(values));
reportClientConfigurationSchema.parse({
  siteKey: '1x00000000000000000000AA',
  action: 'cpm_submission',
});

console.log('P5-03H report public intake schemas are valid.');
