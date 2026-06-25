import { CircleCheck, MapPinned, Plus, Send, SlidersHorizontal, Store } from 'lucide-react';
import { useState } from 'react';
import { AnimatedSwap } from './motion/AnimatedSwap';
import { MotionPolicy } from './motion/MotionPolicy';
import {
  Badge,
  Button,
  Card,
  ModalDialog,
  SelectField,
  Sheet,
  Skeleton,
  StatePanel,
  TextField,
  ToastNotice,
  ToastProvider,
} from './ui';

const assetOptions = [
  { value: 'btc', label: 'Bitcoin (BTC)' },
  { value: 'usdc-base', label: 'USDC on Base' },
  { value: 'xrp', label: 'XRP on XRPL' },
];

const assetSummaries = {
  btc: {
    label: 'BTC · Lightning',
    route: 'Direct wallet',
    instruction: 'Ask staff to display a Lightning invoice, then scan the QR code with a compatible wallet.',
  },
  'usdc-base': {
    label: 'USDC · Base',
    route: 'Processor checkout',
    instruction: 'Choose cryptocurrency at checkout, select USDC on Base, and complete the processor invoice.',
  },
  xrp: {
    label: 'XRP · XRPL',
    route: 'Direct wallet',
    instruction: 'Scan the XRPL payment request and verify the destination tag before signing in your wallet.',
  },
} as const;

type AssetKey = keyof typeof assetSummaries;

export function UIFoundationDemo() {
  const [asset, setAsset] = useState<AssetKey>('btc');
  const [toastOpen, setToastOpen] = useState(false);
  const selectedAsset = assetSummaries[asset];

  function handleAssetChange(value: string) {
    if (value in assetSummaries) {
      setAsset(value as AssetKey);
    }
  }

  return (
    <MotionPolicy>
      <ToastProvider>
        <section className="grid gap-8" aria-labelledby="ui-foundation-title">
          <div className="max-w-3xl">
            <p className="m-0 text-sm font-semibold text-brand-700">P1-04 motion contract</p>
            <h2 id="ui-foundation-title" className="mt-1 text-3xl font-semibold tracking-tight text-ink">
              Motion explains state changes without delaying the task
            </h2>
            <p className="mt-3 text-base leading-7 text-muted">
              Selection feedback, modal surfaces, notifications, and page navigation share one restrained timing system
              and respect the operating system's reduced-motion preference.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              eyebrow="Form primitives"
              title="Suggest payment details"
              description="Changing the asset updates the payment summary with a short, reduced-motion-aware transition."
              footer={
                <div className="flex flex-wrap justify-end gap-3">
                  <Button variant="ghost">Cancel</Button>
                  <Button onClick={() => setToastOpen(true)}>
                    <Send aria-hidden="true" className="size-4" />
                    Save draft
                  </Button>
                </div>
              }
            >
              <div className="grid gap-5">
                <TextField
                  id="merchant-name"
                  label="Business name"
                  placeholder="Example Coffee"
                  hint="Use the public name shown by the business."
                />
                <SelectField
                  id="payment-asset"
                  label="Asset and network"
                  options={assetOptions}
                  value={asset}
                  onValueChange={handleAssetChange}
                  hint="Stablecoins always include their network."
                />
                <AnimatedSwap motionKey={asset} className="rounded-control bg-brand-50 p-4" >
                  <p className="m-0 text-sm font-semibold text-brand-800">{selectedAsset.label}</p>
                  <p className="mt-1 text-sm text-muted">{selectedAsset.route}</p>
                  <p className="mt-3 text-sm leading-6 text-ink">{selectedAsset.instruction}</p>
                </AnimatedSwap>
                <TextField
                  id="evidence-url"
                  label="Evidence URL"
                  placeholder="https://example.com/payments"
                  error="Use a complete HTTPS URL."
                />
              </div>
            </Card>

            <Card
              eyebrow="Record primitives"
              title="Example place card"
              description="Dialog, sheet, and toast motion use the same timing tokens while preserving focus behavior."
              footer={
                <div className="flex flex-wrap gap-3">
                  <ModalDialog
                    trigger={<Button variant="secondary">View evidence</Button>}
                    title="Evidence summary"
                    description="Review the public source and confirmation date before relying on this listing."
                    footer={
                      <div className="flex justify-end">
                        <Button variant="secondary">Open source</Button>
                      </div>
                    }
                  >
                    <p className="m-0 text-sm leading-6 text-muted">
                      The merchant's official payment page identifies Bitcoin Lightning at checkout and was reviewed
                      recently.
                    </p>
                  </ModalDialog>

                  <Sheet
                    trigger={
                      <Button variant="ghost">
                        <SlidersHorizontal aria-hidden="true" className="size-4" />
                        Open sheet
                      </Button>
                    }
                    title="Place details"
                    description="A bottom sheet can later coordinate map selection and mobile place details."
                    footer={<Button className="w-full">View full place</Button>}
                  >
                    <StatePanel
                      tone="success"
                      title="Payment details confirmed"
                      description="Asset, network, route, instructions, evidence, and freshness are present."
                    />
                  </Sheet>
                </div>
              }
            >
              <div className="grid gap-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700">
                    <Store aria-hidden="true" className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="m-0 text-lg font-semibold text-ink">Example Coffee</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                      <MapPinned aria-hidden="true" className="size-4" />
                      Tokyo, Japan
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone="confirmed" icon={<CircleCheck aria-hidden="true" className="size-3.5" />}>
                    Confirmed
                  </Badge>
                  <Badge tone="brand">BTC · Lightning</Badge>
                  <Badge>Direct wallet</Badge>
                </div>

                <p className="m-0 rounded-control bg-canvas p-4 text-sm leading-6 text-muted">
                  Ask staff to display a Lightning invoice, then scan the QR code with a compatible wallet.
                </p>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <StatePanel
              tone="empty"
              title="No confirmed places in this area"
              description="Expand the search area, include stale records, or suggest a place for review."
              action={
                <Button variant="secondary">
                  <Plus aria-hidden="true" className="size-4" />
                  Suggest a place
                </Button>
              }
            />

            <div className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:p-6" aria-label="Loading example">
              <span className="sr-only">Loading example</span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 w-20 rounded-pill" />
                <Skeleton className="h-8 w-24 rounded-pill" />
              </div>
            </div>
          </div>
        </section>

        <ToastNotice
          open={toastOpen}
          onOpenChange={setToastOpen}
          tone="success"
          title="Draft saved"
          description="The example interaction completed without changing public data."
        />
      </ToastProvider>
    </MotionPolicy>
  );
}
