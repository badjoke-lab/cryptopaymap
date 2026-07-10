import { readTrustedCloudflareEdgeIdentity } from '../src/submissions/cloudflare-edge-identity';

const ipv4 = readTrustedCloudflareEdgeIdentity(
  new Request('https://example.test/api/suggest', {
    headers: { 'CF-Connecting-IP': '203.0.113.42' },
  }),
);
const ipv6 = readTrustedCloudflareEdgeIdentity(
  new Request('https://example.test/api/suggest', {
    headers: { 'CF-Connecting-IP': '2001:0db8:0:0:0:0:0:1' },
  }),
);

if (ipv4 !== '203.0.113.42' || ipv6 !== '2001:db8::1') {
  throw new Error('Submission Cloudflare edge identity extraction contract failed.');
}

console.log('Submission Cloudflare edge identity checks passed.');
