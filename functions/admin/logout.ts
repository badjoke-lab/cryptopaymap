import { withAdminSecurityHeaders } from '../../src/admin/access/config';
import { clearOwnerSessionCookie } from '../../src/admin/access/owner-session';

interface AdminLogoutContext {
  request: Request;
}

export async function onRequestPost(_context: AdminLogoutContext): Promise<Response> {
  return withAdminSecurityHeaders(
    new Response(null, {
      status: 303,
      headers: {
        Location: '/admin/login',
        'Set-Cookie': clearOwnerSessionCookie(),
      },
    }),
  );
}

export async function onRequestGet(): Promise<Response> {
  return withAdminSecurityHeaders(
    new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    }),
  );
}
