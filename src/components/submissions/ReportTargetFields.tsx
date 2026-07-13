import type { ReportBrowserFormValues } from '../../submissions/report-browser-contract';
import { FormSection, InputField, SelectField } from './ReportFormControls';
import { targetTypeOptions } from './report-form-options';

export interface ReportTargetFieldsProps {
  values: ReportBrowserFormValues;
  update<Key extends keyof ReportBrowserFormValues>(
    key: Key,
    value: ReportBrowserFormValues[Key],
  ): void;
}

export function ReportTargetFields({ values, update }: ReportTargetFieldsProps) {
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
    </FormSection>
  );
}
