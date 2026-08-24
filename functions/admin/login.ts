import {
  readAdminAccessConfiguration,
  type AdminAccessEnvironment,
  withAdminSecurityHeaders,
} from '../../src/admin/access/config';
import {
  createOwnerSessionCookie,
  isSameOriginAdminMutation,
  issueOwnerSession,
  verifyOwnerLoginSecret,
} from '../../src/admin/access/owner-session';

interface AdminLoginEnvironment extends AdminAccessEnvironment {
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

interface AdminLoginContext {
  request: Request;
  env: AdminLoginEnvironment;
}

interface TurnstileResult {
  success?: boolean;
  hostname?: string;
  action?: string;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[character] ?? character;
  });
}

function loginPage(siteKey: string): Response {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>CryptoPayMap Admin</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>body{font-family:system-ui,sans-serif;background:#09090b;color:#f4f4f5;margin:0;min-height:100vh;display:grid;place-items:center}.box{width:min(92vw,28rem);padding:2rem;border:1px solid #27272a;border-radius:1rem;background:#18181b}label{display:block;margin-bottom:.5rem}input{box-sizing:border-box;width:100%;padding:.8rem;border-radius:.5rem;border:1px solid #3f3f46;background:#09090b;color:#fff;margin-bottom:1rem}button{width:100%;padding:.8rem;border:0;border-radius:.5rem;font-weight:700;cursor:pointer}</style>
</head>
<body><main class="box"><h1>CryptoPayMap Admin</h1><form method="post" action="/admin/login" autocomplete="off"><label for="owner_secret">Owner secret</label><input id="owner_secret" name="owner_secret" type="password" required autocomplete="current-password"><div class="cf-turnstile" data-sitekey="${htmlEscape(siteKey)}" data-action="admin-login"></div><button type="submit">Sign in</button></form></main></body>
</html>`;
  return withAdminSecurityHeaders(
    new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    }),
  );
}

function denied(): Response {
  return withAdminSecurityHeaders(
    new Response('Administration sign-in failed.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

function unavailable(): Response {
  return withAdminSecurityHeaders(
    new Response('Administration sign-in is unavailable.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  let result: TurnstileResult;
  try {
    result = (await response.json()) as TurnstileResult;
  } catch {
    return false;
  }
  return result.success === true && result.hostname === 'cryptopaymap.com' && result.action === 'admin-login';
}

export async function onRequestGet(context: AdminLoginContext): Promise<Response> {
  let configuration;
  try {
    configuration = readAdminAccessConfiguration(context.env);
  } catch {
    return unavailable();
  }
  const siteKey = context.env.PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (configuration.mode !== 'owner_session' || !siteKey) return unavailable();
  return loginPage(siteKey);
}

export async function onRequestPost(context: AdminLoginContext): Promise<Response> {
  if (!isSameOriginAdminMutation(context.request)) return denied();

  let configuration;
  try {
    configuration = readAdminAccessConfiguration(context.env);
  } catch {
    return unavailable();
  }
  const turnstileSecret = context.env.TURNSTILE_SECRET_KEY?.trim();
  if (configuration.mode !== 'owner_session' || !turnstileSecret) return unavailable();

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return denied();
  }
  const ownerSecret = form.get('owner_secret');
  const turnstileToken = form.get('cf-turnstile-response');
  if (typeof ownerSecret !== 'string' || typeof turnstileToken !== 'string') return denied();
  if (ownerSecret.length > 256 || turnstileToken.length > 4096) return denied();

  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    turnstileSecret,
    context.request.headers.get('CF-Connecting-IP'),
  );
  if (!turnstileOk) return denied();
  if (!(await verifyOwnerLoginSecret(ownerSecret, configuration.ownerSecretBase64Url))) return denied();

  const token = await issueOwnerSession(
    configuration.ownerSecretBase64Url,
    configuration.ownerSubject,
    configuration.sessionTtlSeconds,
  );
  return withAdminSecurityHeaders(
    new Response(null, {
      status: 303,
      headers: {
        Location: '/admin/',
        'Set-Cookie': createOwnerSessionCookie(token, configuration.sessionTtlSeconds),
      },
    }),
  );
}
