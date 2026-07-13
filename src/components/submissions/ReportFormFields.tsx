import type { ReportBrowserFormValues } from '../../submissions/report-browser-contract';
import {
  FormSection,
  InputField,
  SelectField,
  TextAreaField,
  type ReportFormOption,
} from './ReportFormControls';
import {
  paymentContextOptions,
  paymentMethodOptions,
  paymentResultOptions,
  problemTypeOptions,
  reportKindOptions,
  routeOptions,
  targetTypeOptions,
} from './report-form-options';

export interface ReportFormFieldsProps {
  values: ReportBrowserFormValues;
  assets: ReportFormOption[];
  networks: ReportFormOption[];
  update<Key extends keyof ReportBrowserFormValues>(
    key: Key,
    value: ReportBrowserFormValues[Key],
  ): void;
}

export function ReportTargetFields({ values, update }: ReportFormFieldsProps) {
  return (
    <FormSection eyebrow="1. Target" title="What record are you reporting?">
      <SelectField
        id="report-target-type"
        label="Target type"
        value={values.targetType}
        options={targetTypeOptions}
        onChange={(value) => update('targetType', value as ReportBrowserFormValues['targetType'])}
      />
      <InputField
        id="report-target-id"
        label="Target UUID"
        value={values.targetId}
        maxLength={64}
        hint="Use the identifier from the CryptoPayMap record or report link."
        onChange={(value) => update('targetId', value)}
      />
      <SelectField
        id="report-kind"
        label="Report type"
        value={values.submissionType}
        options={reportKindOptions}
        onChange={(value) =>
          update('submissionType', value as ReportBrowserFormValues['submissionType'])
        }
      />
    </FormSection>
  );
}

export function PaymentReportFields({ values, assets, networks, update }: ReportFormFieldsProps) {
  const processorRoute = values.routeType === 'processor_checkout';
  return (
    <FormSection eyebrow="2. Payment" title="Describe the payment result">
      <SelectField
        id="payment-result"
        label="Result"
        value={values.paymentResult}
        options={paymentResultOptions}
        onChange={(value) =>
          update('paymentResult', value as ReportBrowserFormValues['paymentResult'])
        }
      />
      <InputField
        id="payment-date"
        label="Payment date"
        type="date"
        value={values.paymentDate}
        onChange={(value) => update('paymentDate', value)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="payment-asset"
          label="Asset"
          value={values.assetSlug}
          options={assets}
          optional
          onChange={(value) => update('assetSlug', value)}
        />
        <SelectField
          id="payment-network"
          label="Network"
          value={values.networkSlug}
          options={networks}
          optional
          onChange={(value) => update('networkSlug', value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id="payment-route"
          label="Route"
          value={values.routeType}
          options={routeOptions}
          optional
          onChange={(value) => update('routeType', value as ReportBrowserFormValues['routeType'])}
        />
        <SelectField
          id="payment-method"
          label="Method"
          value={values.paymentMethod}
          options={paymentMethodOptions}
          optional
          onChange={(value) =>
            update('paymentMethod', value as ReportBrowserFormValues['paymentMethod'])
          }
        />
      </div>
      {processorRoute ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            id="processor-name"
            label="Processor name"
            value={values.processorName}
            maxLength={160}
            onChange={(value) => update('processorName', value)}
          />
          <InputField
            id="processor-url"
            label="Processor website"
            type="url"
            value={values.processorWebsiteUrl}
            maxLength={2_048}
            optional
            onChange={(value) => update('processorWebsiteUrl', value)}
          />
        </div>
      ) : null}
      <SelectField
        id="payment-context"
        label="Payment context"
        value={values.paymentContext}
        options={paymentContextOptions}
        optional
        onChange={(value) =>
          update('paymentContext', value as ReportBrowserFormValues['paymentContext'])
        }
      />
      <TextAreaField
        id="observed-steps"
        label="What happened?"
        value={values.observedSteps}
        maxLength={2_000}
        optional
        hint="Describe the concrete steps, error, confirmation, or merchant response."
        onChange={(value) => update('observedSteps', value)}
      />
      <InputField
        id="private-transaction-url"
        label="Private transaction or receipt URL"
        type="url"
        value={values.privateTransactionUrl}
        maxLength={2_048}
        optional
        hint="Stored for protected review only."
        onChange={(value) => update('privateTransactionUrl', value)}
      />
      <TextAreaField
        id="payment-notes"
        label="Additional notes"
        value={values.paymentNotes}
        maxLength={2_000}
        optional
        onChange={(value) => update('paymentNotes', value)}
      />
    </FormSection>
  );
}

function ProfileCorrectionFields({ values, update }: ReportFormFieldsProps) {
  return (
    <div className="grid gap-5 rounded-control border border-border bg-canvas p-4">
      <p className="m-0 text-sm font-semibold text-ink">Proposed profile correction</p>
      <InputField
        id="correct-address"
        label="Address"
        value={values.addressLine}
        maxLength={500}
        optional
        onChange={(value) => update('addressLine', value)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <InputField
          id="correct-locality"
          label="Locality"
          value={values.locality}
          maxLength={120}
          optional
          onChange={(value) => update('locality', value)}
        />
        <InputField
          id="correct-region"
          label="Region"
          value={values.region}
          maxLength={120}
          optional
          onChange={(value) => update('region', value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <InputField
          id="correct-postal"
          label="Postal code"
          value={values.postalCode}
          maxLength={32}
          optional
          onChange={(value) => update('postalCode', value)}
        />
        <InputField
          id="correct-country"
          label="Country code"
          value={values.countryCode}
          maxLength={2}
          optional
          onChange={(value) => update('countryCode', value)}
        />
      </div>
      <InputField
        id="correct-website"
        label="Website"
        type="url"
        value={values.websiteUrl}
        maxLength={2_048}
        optional
        onChange={(value) => update('websiteUrl', value)}
      />
      <InputField
        id="correct-phone"
        label="Phone"
        value={values.phone}
        maxLength={64}
        optional
        onChange={(value) => update('phone', value)}
      />
      <TextAreaField
        id="correct-description"
        label="Description"
        value={values.description}
        maxLength={5_000}
        optional
        onChange={(value) => update('description', value)}
      />
      <TextAreaField
        id="correct-hours"
        label="Opening hours"
        value={values.openingHours}
        maxLength={2_000}
        optional
        onChange={(value) => update('openingHours', value)}
      />
    </div>
  );
}

export function ProblemReportFields(props: ReportFormFieldsProps) {
  const { values, update } = props;
  const isDuplicate = values.problemType === 'duplicate';
  const isWrongAddress = values.problemType === 'wrong_address';
  const simpleCorrection = ['wrong_asset', 'wrong_network', 'wrong_instructions', 'other'].includes(
    values.problemType,
  );
  const correctionLabel =
    values.problemType === 'wrong_asset'
      ? 'Correct asset slug'
      : values.problemType === 'wrong_network'
        ? 'Correct network slug'
        : values.problemType === 'wrong_instructions'
          ? 'Correct payment instructions'
          : 'Proposed correction';

  return (
    <FormSection eyebrow="2. Problem" title="Describe the incorrect or problematic information">
      <SelectField
        id="problem-type"
        label="Problem category"
        value={values.problemType}
        options={problemTypeOptions}
        onChange={(value) => update('problemType', value as ReportBrowserFormValues['problemType'])}
      />
      <InputField
        id="problem-date"
        label="Observed date"
        type="date"
        value={values.problemObservedAt}
        onChange={(value) => update('problemObservedAt', value)}
      />
      <TextAreaField
        id="problem-explanation"
        label="Explanation"
        value={values.explanation}
        maxLength={5_000}
        onChange={(value) => update('explanation', value)}
      />
      {simpleCorrection ? (
        <TextAreaField
          id="correction-value"
          label={correctionLabel}
          value={values.correctionValue}
          maxLength={5_000}
          optional
          onChange={(value) => update('correctionValue', value)}
        />
      ) : null}
      {isWrongAddress ? <ProfileCorrectionFields {...props} /> : null}
      {isDuplicate ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="duplicate-type"
            label="Duplicate of target type"
            value={values.duplicateTargetType}
            options={targetTypeOptions}
            onChange={(value) =>
              update('duplicateTargetType', value as ReportBrowserFormValues['duplicateTargetType'])
            }
          />
          <InputField
            id="duplicate-id"
            label="Duplicate of target UUID"
            value={values.duplicateTargetId}
            maxLength={64}
            onChange={(value) => update('duplicateTargetId', value)}
          />
        </div>
      ) : null}
      <InputField
        id="private-evidence-url"
        label="Restricted evidence URL"
        type="url"
        value={values.privateEvidenceUrl}
        maxLength={2_048}
        optional
        hint="Stored for protected review only."
        onChange={(value) => update('privateEvidenceUrl', value)}
      />
    </FormSection>
  );
}

export function EvidenceAndContactFields({ values, update }: ReportFormFieldsProps) {
  return (
    <FormSection eyebrow="3. Evidence and follow-up" title="Add supporting information">
      <InputField
        id="public-evidence-url"
        label="Public evidence URL"
        type="url"
        value={values.evidenceUrl}
        maxLength={2_048}
        optional
        onChange={(value) => update('evidenceUrl', value)}
      />
      <TextAreaField
        id="evidence-summary"
        label="Evidence summary"
        value={values.evidenceSummary}
        maxLength={1_000}
        optional
        onChange={(value) => update('evidenceSummary', value)}
      />
      <InputField
        id="contact-email"
        label="Contact email"
        type="email"
        value={values.contactEmail}
        maxLength={320}
        optional
        onChange={(value) => update('contactEmail', value)}
      />
      <label className="flex items-start gap-3 text-sm leading-6 text-ink">
        <input
          className="mt-1 h-4 w-4"
          type="checkbox"
          checked={values.contactAllowed}
          onChange={(event) => update('contactAllowed', event.currentTarget.checked)}
        />
        Reviewers may contact me about this report.
      </label>
    </FormSection>
  );
}
