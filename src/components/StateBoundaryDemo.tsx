import { useQuery } from '@tanstack/react-query';
import { Database, Link2, List, Map as MapIcon, RefreshCw } from 'lucide-react';
import { AppStateProviders } from './state/AppStateProviders';
import { useDiscoveryStore } from './state/DiscoveryStoreProvider';
import { Badge, Button, Card, SelectField, StatePanel } from './ui';
import { useDiscoveryHistorySync } from '../state/useDiscoveryHistorySync';
import { serializeDiscoveryUrlState } from '../state/discovery-url';

interface FoundationPlace {
  id: string;
  slug: string;
  name: string;
  status: 'confirmed';
  asset: string;
  network: string;
  route: 'direct_wallet';
  lastConfirmed: string;
  howToPay: string;
}

const assetOptions = [
  { value: 'all', label: 'All assets' },
  { value: 'btc', label: 'Bitcoin (BTC)' },
  { value: 'usdc', label: 'USD Coin (USDC)' },
  { value: 'xrp', label: 'XRP' },
];

async function fetchFoundationPlace(): Promise<FoundationPlace> {
  const response = await fetch('/data/foundation-place.json', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Public sample request failed with status ${response.status}`);
  }

  return response.json() as Promise<FoundationPlace>;
}

function StateBoundaryContent() {
  const urlState = useDiscoveryStore((state) => state.urlState);
  const bottomSheet = useDiscoveryStore((state) => state.bottomSheet);
  const listScrollOffset = useDiscoveryStore((state) => state.listScrollOffset);
  const { commitUrlPatch, commitUiPatch } = useDiscoveryHistorySync();
  const placeQuery = useQuery({
    queryKey: ['public-place', 'foundation-example-place'],
    queryFn: fetchFoundationPlace,
  });

  const selectedAsset = urlState.assets[0] ?? 'all';
  const serializedState = serializeDiscoveryUrlState(urlState).toString() || '(default URL state)';

  function handleAssetChange(value: string) {
    commitUrlPatch({ assets: value === 'all' ? [] : [value] }, 'push');
  }

  function toggleSelectedPlace() {
    if (!placeQuery.data) return;

    const nextSelectedPlace =
      urlState.selectedPlace === placeQuery.data.slug ? null : placeQuery.data.slug;

    commitUrlPatch({ selectedPlace: nextSelectedPlace }, 'push');
    commitUiPatch({ bottomSheet: nextSelectedPlace ? 'peek' : 'closed' });
  }

  return (
    <section className="grid gap-6" aria-labelledby="state-boundary-title">
      <div className="max-w-3xl">
        <p className="m-0 text-sm font-semibold text-brand-700">P1-05 state ownership</p>
        <h2
          id="state-boundary-title"
          className="mt-1 text-3xl font-semibold tracking-tight text-ink"
        >
          Each kind of state has one owner
        </h2>
        <p className="mt-3 text-base leading-7 text-muted">
          Public fetched data is cached by TanStack Query. Shareable discovery state is encoded in
          the URL. Temporary interface state remains in a per-island Zustand store and browser
          history state.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card
          eyebrow="Public server state"
          title="Fetched public place"
          description="The record is loaded from a public JSON endpoint and is never copied into the UI store."
          footer={
            <div className="flex flex-wrap justify-between gap-3">
              <Badge tone="brand" icon={<Database aria-hidden="true" className="size-3.5" />}>
                TanStack Query
              </Badge>
              <Button
                variant="secondary"
                onClick={() => void placeQuery.refetch()}
                loading={placeQuery.isFetching}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Refresh public data
              </Button>
            </div>
          }
        >
          {placeQuery.isPending ? (
            <StatePanel
              tone="loading"
              title="Loading public place"
              description="The existing interface state remains separate while server data is fetched."
            />
          ) : placeQuery.isError ? (
            <StatePanel
              tone="error"
              title="Public data could not be loaded"
              description="The query can be retried without clearing the selected view or URL filters."
              action={
                <Button variant="secondary" onClick={() => void placeQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="m-0 text-xl font-semibold text-ink">{placeQuery.data.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {placeQuery.data.asset} · {placeQuery.data.network} · {placeQuery.data.route}
                  </p>
                </div>
                <Badge tone="confirmed">Confirmed</Badge>
              </div>
              <p className="m-0 rounded-control bg-canvas p-4 text-sm leading-6 text-muted">
                {placeQuery.data.howToPay}
              </p>
              <Button variant="secondary" onClick={toggleSelectedPlace}>
                {urlState.selectedPlace === placeQuery.data.slug
                  ? 'Clear selected place'
                  : 'Select public place'}
              </Button>
            </div>
          )}
        </Card>

        <Card
          eyebrow="Shareable URL state"
          title="Discovery controls"
          description="Only public, stable discovery values are serialized."
        >
          <div className="grid gap-5">
            <SelectField
              id="state-demo-asset"
              label="Asset filter"
              options={assetOptions}
              value={selectedAsset}
              onValueChange={handleAssetChange}
            />

            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="sr-only">View mode</legend>
              <Button
                variant={urlState.view === 'map' ? 'primary' : 'secondary'}
                onClick={() => commitUrlPatch({ view: 'map' }, 'replace')}
              >
                <MapIcon aria-hidden="true" className="size-4" />
                Map
              </Button>
              <Button
                variant={urlState.view === 'list' ? 'primary' : 'secondary'}
                onClick={() => commitUrlPatch({ view: 'list' }, 'replace')}
              >
                <List aria-hidden="true" className="size-4" />
                List
              </Button>
            </fieldset>

            <div className="rounded-control border border-border bg-canvas p-4">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
                <Link2 aria-hidden="true" className="size-4 text-brand-700" />
                Canonical query string
              </p>
              <code className="mt-2 block break-all text-xs leading-5 text-muted">
                {serializedState}
              </code>
            </div>
          </div>
        </Card>
      </div>

      <Card
        as="section"
        eyebrow="Ephemeral UI state"
        title="Stored outside the URL"
        description="These values support restoration but are not useful or safe as shareable query parameters."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-control bg-canvas p-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
              Bottom sheet
            </p>
            <p className="mt-2 font-semibold text-ink">{bottomSheet}</p>
          </div>
          <div className="rounded-control bg-canvas p-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
              List scroll
            </p>
            <p className="mt-2 font-semibold text-ink">{Math.round(listScrollOffset)}px</p>
          </div>
          <div className="rounded-control bg-canvas p-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
              Selected public place
            </p>
            <p className="mt-2 break-all font-semibold text-ink">
              {urlState.selectedPlace ?? 'none'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              commitUiPatch({ bottomSheet: bottomSheet === 'expanded' ? 'peek' : 'expanded' })
            }
          >
            Toggle sheet state
          </Button>
          <Button
            variant="ghost"
            onClick={() => commitUiPatch({ listScrollOffset: listScrollOffset + 240 })}
          >
            Simulate list scroll
          </Button>
        </div>
      </Card>
    </section>
  );
}

export function StateBoundaryDemo() {
  return (
    <AppStateProviders>
      <StateBoundaryContent />
    </AppStateProviders>
  );
}
