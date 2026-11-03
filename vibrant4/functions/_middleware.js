// One address for search engines: the bare domain and the pages.dev host 301 to www.
const CANONICAL_HOST = 'www.vibranthealthswfl.com';
const REDIRECT_HOSTS = new Set(['vibranthealthswfl.com', 'vibrant-site.pages.dev']);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
