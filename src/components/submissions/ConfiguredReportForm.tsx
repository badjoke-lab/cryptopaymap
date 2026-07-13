import { useEffect, useState } from 'react';
import {
  reportClientConfigurationSchema,
  type ReportClientConfiguration,
} from '../../submissions/report-client-config';
import type { ReportBrowserFormValues } from '../../submissions/report-browser-contract';
import { StatePanel } from '../ui/StatePanel';
import { ReportForm, type ReportFormOption } from './ReportForm';

export interface ConfiguredReportFormProps {
  submissionType: ReportBrowserFormValues['submissionType'];
  assets: ReportFormOption[];
  networks: ReportFormOption[];
  initialTargetType?: ReportBrowserFormValues['targetType'] | undefined;
  initialTargetId?: string | undefined;
}

interface ResolvedTarget {
  targetType: ReportBrowserFormValues['targetType'];
  targetId: string;
}

function readBrowserTarget(fallback: ResolvedTarget): ResolvedTarget {
  const parameters = new URLSearchParams(window.location.search);
  const requestedType = parameters.get('targetType');
  const targetType =
    requestedType === 'location' || requestedType === 'claim' || requestedType === 'entity'
      ? requestedType
      : fallback.targetType;
  const requestedId = parameters.get('targetId')?.trim();

  return {
    targetType,
    targetId: requestedId && requestedId.length > 0 ? requestedId : fallback.targetId,
  };
}

export function ConfiguredReportForm({
  submissionType,
  assets,
  networks,
  initialTargetType = 'entity',
  initialTargetId = '',
}: ConfiguredReportFormProps) {
  const [configuration, setConfiguration] = useState<ReportClientConfiguration | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [target, setTarget] = useState<ResolvedTarget>({
    targetType: initialTargetType,
    targetId: initialTargetId,
  });

  useEffect(() => {
    const controller = new AbortController();
    setTarget(
      readBrowserTarget({
        targetType: initialTargetType,
        targetId: initialTargetId,
      }),
    );

    async function loadConfiguration() {
      try {
        const response = await fetch('/api/reports/config', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Report configuration unavailable.');
        const parsed = reportClientConfigurationSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Report configuration invalid.');
        setConfiguration(parsed.data);
        setState('ready');
      } catch {
        if (controller.signal.aborted) return;
        setConfiguration(null);
        setState('error');
      }
    }

    void loadConfiguration();
    return () => controller.abort();
  }, [initialTargetId, initialTargetType]);

  if (state === 'loading') {
    return (
      <StatePanel
        tone="loading"
        title="Preparing the secure report form"
        description="Loading the review and verification configuration for this environment."
      />
    );
  }

  if (state === 'error' || configuration === null) {
    return (
      <StatePanel
        tone="error"
        title="Report form unavailable"
        description="The submission environment is not ready. No public data was changed. Please try again later."
      />
    );
  }

  return (
    <ReportForm
      submissionType={submissionType}
      siteKey={configuration.siteKey}
      action={configuration.action}
      assets={assets}
      networks={networks}
      initialTargetType={target.targetType}
      initialTargetId={target.targetId}
    />
  );
}
