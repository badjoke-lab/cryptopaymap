import { createHash, createHmac } from 'node:crypto';

const names = [
  'CPM_R2_ACCOUNT_ID',
  'CPM_R2_PHOTO_QUARANTINE_BUCKET',
  'CPM_R2_ACCESS_KEY_ID',
  'CPM_R2_SECRET_ACCESS_KEY',
];
const presence = Object.fromEntries(names.map((name) => [name, Boolean(process.env[name])]))
const result = {
  configuration: { presence, validShape: false },
  put: null,
  head: null,
  get: null,
  unsignedGet: null,
  delete: null,
  afterDelete: null,
  digestMatches: false,
  cleanup: 'not_run',
};

function output(exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (Object.values(presence).some((value) => !value)) {
  output(2);
} else {
  const accountId = process.env.CPM_R2_ACCOUNT_ID;
  const bucket = process.env.CPM_R2_PHOTO_QUARANTINE_BUCKET;
  const accessKeyId = process.env.CPM_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CPM_R2_SECRET_ACCESS_KEY;
  const valid =
    /^[0-9a-f]{32}$/i.test(accountId) &&
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) &&
    /^[A-Za-z0-9]{16,128}$/.test(accessKeyId) &&
    secretAccessKey.length >= 32;
  result.configuration.validShape = valid;
  if (!valid) {
    output(2);
  } else {
    const host = `${bucket}.${accountId.toLowerCase()}.r2.cloudflarestorage.com`;
    const key = 'quarantine/photos/v1/94000000-0000-8000-8000-000000000001';
    const body = Buffer.from('CryptoPayMap configured R2 capability fixture v1\n', 'utf8');
    const expectedDigest = createHash('sha256').update(body).digest('hex');

    function awsEncode(value) {
      return encodeURIComponent(value).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    }

    function canonicalQuery(parameters) {
      return Object.entries(parameters)
        .map(([name, value]) => [awsEncode(name), awsEncode(value)])
        .sort(([leftName, leftValue], [rightName, rightValue]) =>
          leftName === rightName
            ? leftValue.localeCompare(rightValue)
            : leftName.localeCompare(rightName),
        )
        .map(([name, value]) => `${name}=${value}`)
        .join('&');
    }

    function hmac(keyBytes, value) {
      return createHmac('sha256', keyBytes).update(value).digest();
    }

    function presign(method, expiresSeconds = 300, headers = {}) {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      const canonicalUri = `/${key.split('/').map(awsEncode).join('/')}`;
      const headerEntries = [
        ['host', host],
        ...Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()]),
      ].sort(([left], [right]) => left.localeCompare(right));
      const signedHeaders = headerEntries.map(([name]) => name).join(';');
      const canonicalHeaders = headerEntries.map(([name, value]) => `${name}:${value}`).join('\n');
      const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
      const query = canonicalQuery({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
        'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresSeconds),
        'X-Amz-SignedHeaders': signedHeaders,
      });
      const canonicalRequest = [
        method,
        canonicalUri,
        query,
        canonicalHeaders,
        '',
        signedHeaders,
        'UNSIGNED-PAYLOAD',
      ].join('\n');
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        createHash('sha256').update(canonicalRequest).digest('hex'),
      ].join('\n');
      const dateKey = hmac(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), dateStamp);
      const regionKey = hmac(dateKey, 'auto');
      const serviceKey = hmac(regionKey, 's3');
      const signingKey = hmac(serviceKey, 'aws4_request');
      const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
      return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
    }

    async function statusOnly(method, headers = {}, requestBody = undefined) {
      const response = await fetch(presign(method, 300, headers), {
        method,
        headers,
        body: requestBody,
        redirect: 'manual',
      });
      return response;
    }

    try {
      const headers = {
        'content-type': 'application/octet-stream',
        'x-amz-meta-cpm-purpose': 'configured-staging-capability-diagnostic',
      };
      const putResponse = await statusOnly('PUT', headers, body);
      result.put = putResponse.status;

      const headResponse = await statusOnly('HEAD');
      result.head = headResponse.status;

      const getResponse = await statusOnly('GET');
      result.get = getResponse.status;
      if (getResponse.ok) {
        const received = Buffer.from(await getResponse.arrayBuffer());
        result.digestMatches =
          createHash('sha256').update(received).digest('hex') === expectedDigest;
      }

      const unsignedResponse = await fetch(`https://${host}/${key}`, {
        method: 'GET',
        redirect: 'manual',
      });
      result.unsignedGet = unsignedResponse.status;

      const deleteResponse = await statusOnly('DELETE');
      result.delete = deleteResponse.status;
      const afterDeleteResponse = await statusOnly('HEAD');
      result.afterDelete = afterDeleteResponse.status;
      result.cleanup = afterDeleteResponse.status === 404 ? 'passed' : 'failed';

      const passed =
        [200, 201, 204].includes(result.put) &&
        result.head === 200 &&
        result.get === 200 &&
        result.digestMatches &&
        [401, 403, 404].includes(result.unsignedGet) &&
        [200, 204].includes(result.delete) &&
        result.cleanup === 'passed';
      output(passed ? 0 : 1);
    } catch {
      result.cleanup = 'unknown_after_network_failure';
      output(1);
    }
  }
}
