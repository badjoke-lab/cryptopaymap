import { useEffect, useState } from 'react';
import {
  suggestClientConfigurationSchema,
  type SuggestClientConfiguration,
} from '../../submissions/suggest-client-config';
import { StatePanel } from '../ui/StatePanel';
import { SuggestForm, type SuggestFormOption } from './SuggestForm';

export interface ConfiguredSuggestFormProps {
  assets: SuggestFormOption[];
  networks: SuggestFormOption[];
}

export function ConfiguredSuggestForm({ assets, networks }: ConfiguredSuggestFormProps) {
  const [configuration, setConfiguration] = useState<SuggestClientConfiguration | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();

    async function loadConfiguration() {
      try {
        const response = await fetch('/api/suggest/config', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Suggest configuration unavailable.');
        const parsed = suggestClientConfigurationSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Suggest configuration invalid.');
        setConfiguration(parsed.data);
        setState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setConfiguration(null);
        setState('error');
      }
    }

    void loadConfiguration();
    return () => controller.abort();
  }, []);

  if (state === 'loading') {
    return (
      <StatePanel
        tone="loading"
        title="Preparing the secure submission form"
        description="Loading the review and verification configuration for this environment."
      />
    );
  }

  if (state === 'error' || configuration === null) {
    return (
      <StatePanel
        tone="error"
        title="Suggestion form unavailable"
        description="The submission environment is not ready. No public data was changed. Please try again later."
      />
    );
  }

  return (
    <SuggestForm
      siteKey={configuration.siteKey}
      action={configuration.action}
      assets={assets}
      networks={networks}
    />
  );
}
