import { useEffect, useState } from 'react';
import {
  photoClientConfigurationSchema,
  type PhotoClientConfiguration,
} from '../../submissions/photo-client-config';
import type { PhotoBrowserFormValues } from '../../submissions/photo-browser-contract';
import { StatePanel } from '../ui/StatePanel';
import { PhotoForm } from './PhotoForm';

export interface ConfiguredPhotoFormProps {
  initialTargetType?: PhotoBrowserFormValues['targetType'] | undefined;
  initialTargetId?: string | undefined;
}

interface ResolvedTarget {
  targetType: PhotoBrowserFormValues['targetType'];
  targetId: string;
}

function readBrowserTarget(fallback: ResolvedTarget): ResolvedTarget {
  const parameters = new URLSearchParams(window.location.search);
  const requestedType = parameters.get('targetType');
  const targetType =
    requestedType === 'location' || requestedType === 'entity'
      ? requestedType
      : fallback.targetType;
  const requestedId = parameters.get('targetId')?.trim();

  return {
    targetType,
    targetId: requestedId && requestedId.length > 0 ? requestedId : fallback.targetId,
  };
}

export function ConfiguredPhotoForm({
  initialTargetType = 'entity',
  initialTargetId = '',
}: ConfiguredPhotoFormProps) {
  const [configuration, setConfiguration] = useState<PhotoClientConfiguration | null>(null);
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
        const response = await fetch('/api/photos/config', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Photos configuration unavailable.');
        const parsed = photoClientConfigurationSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Photos configuration invalid.');
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
        title="Preparing the secure Photos form"
        description="Loading the direct-upload and private review configuration for this environment."
      />
    );
  }

  if (state === 'error' || configuration === null) {
    return (
      <StatePanel
        tone="error"
        title="Photos form unavailable"
        description="The submission environment is not ready. No files were uploaded and no public data was changed. Please try again later."
      />
    );
  }

  return (
    <PhotoForm
      siteKey={configuration.siteKey}
      action={configuration.action}
      initialTargetType={target.targetType}
      initialTargetId={target.targetId}
    />
  );
}
