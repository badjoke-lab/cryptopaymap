import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createDiscoveryStore,
  type DiscoveryStoreApi,
  type DiscoveryStoreInitialState,
  type DiscoveryStoreState,
} from '../../state/discovery-store';

const DiscoveryStoreContext = createContext<DiscoveryStoreApi | null>(null);

export interface DiscoveryStoreProviderProps {
  children: ReactNode;
  initialState?: DiscoveryStoreInitialState;
}

export function DiscoveryStoreProvider({ children, initialState }: DiscoveryStoreProviderProps) {
  const storeRef = useRef<DiscoveryStoreApi | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createDiscoveryStore(initialState ?? {});
  }

  return (
    <DiscoveryStoreContext.Provider value={storeRef.current}>
      {children}
    </DiscoveryStoreContext.Provider>
  );
}

export function useDiscoveryStoreApi(): DiscoveryStoreApi {
  const store = useContext(DiscoveryStoreContext);

  if (store === null) {
    throw new Error('useDiscoveryStoreApi must be used inside DiscoveryStoreProvider');
  }

  return store;
}

export function useDiscoveryStore<T>(selector: (state: DiscoveryStoreState) => T): T {
  return useStore(useDiscoveryStoreApi(), selector);
}
