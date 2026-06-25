import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { DiscoveryStoreInitialState } from '../../state/discovery-store';
import { createAppQueryClient } from '../../state/query-client';
import { MotionPolicy } from '../motion/MotionPolicy';
import { DiscoveryStoreProvider } from './DiscoveryStoreProvider';

export interface AppStateProvidersProps {
  children: ReactNode;
  initialDiscoveryState?: DiscoveryStoreInitialState;
}

export function AppStateProviders({ children, initialDiscoveryState }: AppStateProvidersProps) {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <MotionPolicy>
      <QueryClientProvider client={queryClient}>
        <DiscoveryStoreProvider initialState={initialDiscoveryState ?? {}}>
          {children}
        </DiscoveryStoreProvider>
      </QueryClientProvider>
    </MotionPolicy>
  );
}
