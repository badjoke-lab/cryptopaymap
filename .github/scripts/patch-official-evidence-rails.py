from pathlib import Path
import re

path = Path('scripts/promote-confirm-official-evidence-batch.ts')
text = path.read_text()
text = text.replace('hasNegatedLightningAcceptance', 'hasNegatedBitcoinAcceptance')

marker = 'async function reverifyOfficialEvidence(url: string, officialDomain: string): Promise<boolean> {'
if marker not in text:
    raise SystemExit('reverification marker missing')

insert = r'''function hasPositiveBitcoinAcceptance(text: string): boolean {
  if (hasNegatedBitcoinAcceptance(text)) return false;
  return [
    /(?:accept|accepts|accepted|support|supports|take|takes|offer|offers)[^.!?]{0,120}(?:bitcoin|btc)/i,
    /(?:bitcoin|btc)[^.!?]{0,120}(?:accept|accepted|payment|pay|checkout)/i,
    /(?:pay|payment|checkout)[^.!?]{0,120}(?:bitcoin|btc)/i,
    /(?:ビットコイン|btc)[^。！？]{0,100}(?:決済|支払|支払い|利用|対応)/i,
  ].some((pattern) => pattern.test(text));
}

type PaymentRail = 'lightning' | 'onchain';

'''
text = text.replace(marker, insert + marker, 1)

pattern = re.compile(r"async function reverifyOfficialEvidence\(url: string, officialDomain: string\): Promise<boolean> \{.*?\n\}\n\nfunction countryCodeFromRelations", re.S)
replacement = r'''async function reverifyOfficialEvidence(
  url: string,
  officialDomain: string,
): Promise<PaymentRail | null> {
  if (!sameOfficialDomain(url, officialDomain)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'CryptoPayMap-official-payment-review/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    if (!sameOfficialDomain(response.url, officialDomain)) return null;
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    const text = normalizedPageText(body);
    if (hasPositiveLightningAcceptance(text)) return 'lightning';
    if (hasPositiveBitcoinAcceptance(text)) return 'onchain';
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function countryCodeFromRelations'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'reverification replacement count={count}')

registry_pattern = re.compile(r"  const \[\[bitcoin\], \[lightning\], \[lightningInvoice\]\] = await Promise\.all\(\[.*?  if \(!bitcoin \|\| !lightning \|\| !lightningInvoice\) \{\n    throw new Error\('BTC / Lightning / lightning_invoice staging registry is not ready\.'\);\n  \}\n", re.S)
registry_replacement = r'''  const [[bitcoin], [lightning], [lightningInvoice], [bitcoinNetwork], [onchain]] =
    await Promise.all([
      db.select({ id: assets.id }).from(assets).where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active'))).limit(1),
      db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'lightning'), eq(networks.status, 'active'))).limit(1),
      db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'lightning_invoice'), eq(paymentMethods.status, 'active'))).limit(1),
      db.select({ id: networks.id }).from(networks).where(and(eq(networks.slug, 'bitcoin'), eq(networks.status, 'active'))).limit(1),
      db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.slug, 'onchain'), eq(paymentMethods.status, 'active'))).limit(1),
    ]);
  if (!bitcoin || !lightning || !lightningInvoice || !bitcoinNetwork || !onchain) {
    throw new Error('BTC / Lightning / on-chain staging registries are not ready.');
  }
'''
text, count = registry_pattern.subn(registry_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'registry replacement count={count}')

text = text.replace('skippedNotLightningTagged: 0,', 'skippedMissingPaymentTag: 0,\n    skippedRailTagMismatch: 0,')

old_tags = """    const lightningTagged = ['yes', 'only'].includes(
      (paymentTags['payment:lightning'] ?? '').toLowerCase(),
    );"""
new_tags = """    const lightningTagged = ['yes', 'only'].includes(
      (paymentTags['payment:lightning'] ?? '').toLowerCase(),
    );
    const bitcoinTagged = ['yes', 'only'].includes(
      (paymentTags['payment:bitcoin'] ?? '').toLowerCase(),
    );"""
if old_tags not in text:
    raise SystemExit('payment tag block missing')
text = text.replace(old_tags, new_tags, 1)

old_gate = """    if (!lightningTagged) {
      counters.skippedNotLightningTagged += 1;
      continue;
    }"""
new_gate = """    if (!lightningTagged && !bitcoinTagged) {
      counters.skippedMissingPaymentTag += 1;
      continue;
    }"""
if old_gate not in text:
    raise SystemExit('old Lightning tag gate missing')
text = text.replace(old_gate, new_gate, 1)

old_reverify = """    if (!(await reverifyOfficialEvidence(evidenceUrl, originDomain))) {
      counters.skippedOfficialReverification += 1;
      continue;
    }"""
new_reverify = """    const paymentRail = await reverifyOfficialEvidence(evidenceUrl, originDomain);
    if (!paymentRail) {
      counters.skippedOfficialReverification += 1;
      continue;
    }
    if (
      (paymentRail === 'lightning' && !lightningTagged) ||
      (paymentRail === 'onchain' && !bitcoinTagged)
    ) {
      counters.skippedRailTagMismatch += 1;
      continue;
    }"""
if old_reverify not in text:
    raise SystemExit('old reverification gate missing')
text = text.replace(old_reverify, new_reverify, 1)

text = text.replace(
    "`official-evidence-batch:claim-asset:${candidate.candidateId}`",
    "`official-evidence-batch:claim-asset:${candidate.candidateId}:${paymentRail}`",
    1,
)
text = text.replace(
    'howToPay:\n              "Pay with Bitcoin over the Lightning Network using the merchant\'s Lightning payment option.",',
    "howToPay:\n              paymentRail === 'lightning'\n                ? \"Pay with Bitcoin over the Lightning Network using the merchant's Lightning payment option.\"\n                : \"Pay with Bitcoin on-chain using the merchant's advertised Bitcoin payment option.\",",
    1,
)
text = text.replace(
    'networkId: lightning.id,\n              paymentMethodId: lightningInvoice.id,',
    "networkId: paymentRail === 'lightning' ? lightning.id : bitcoinNetwork.id,\n              paymentMethodId: paymentRail === 'lightning' ? lightningInvoice.id : onchain.id,",
    1,
)
text = text.replace(
    "'Fixed-review staging batch confirmation from reverified official merchant Lightning payment Evidence.',",
    "`Fixed-review staging batch confirmation from reverified official merchant ${paymentRail === 'lightning' ? 'Lightning' : 'Bitcoin on-chain'} payment Evidence.`,",
    1,
)
text = text.replace("paymentRail: 'BTC/Lightning',", "paymentRails: ['BTC/Lightning', 'BTC/on-chain'],")

path.write_text(text)
