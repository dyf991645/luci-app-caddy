const assets = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/app.js', 'app.js'], ['/style.css', 'style.css'], ['/theme.css', 'theme.css'],
  ['/bootstrap-preview.css', 'bootstrap-preview.css'],
]);
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT || 4183),
  fetch(request) {
    const asset = assets.get(new URL(request.url).pathname);
    if (!asset) return new Response('Not Found', { status: 404 });
    return new Response(Bun.file(new URL(asset, import.meta.url)), {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  },
});
console.log(`Caddy UI preview: ${server.url}`);
