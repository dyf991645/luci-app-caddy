// Exercise the public rpcd methods in an isolated /tmp fixture on OpenWrt.
let plugin = loadfile(ARGV[0])()['luci.caddy'];
let result = plugin.action.call({ args: { action: 'start; touch /tmp/caddy-unexpected' } });
assert(result.ok == false, 'unknown lifecycle actions must fail');
assert(result.error == 'Unsupported service action', 'invalid action should have a useful error');
print('PASS: lifecycle action rejects command injection\n');
let status = plugin.status.call({ args: {} });
if (ARGV[1] == 'installed') {
	assert(status.installed == true, 'installed package must expose the actual executable');
	assert(index(status.version, 'v2.11.8 ') == 0, 'installed upstream Caddy version must match the reviewed artifact');
	assert(length(filter(status.modules, line => index(line, 'dns.providers.cloudflare v0.2.4') == 0)) == 1,
		'the reviewed Cloudflare module must be present');
	print('PASS: installed package reports actual upstream version and Cloudflare module\n');
	exit(0);
}
assert(status.installed == false, 'missing binary must not be reported as installed');
assert(status.running == false, 'missing service must not be reported as running');
assert(status.enabled == false, 'missing init script must not be reported as boot enabled');
assert(status.version == null && length(status.modules) == 0, 'missing binary has no invented version or modules');
print('PASS: status reports the actual missing Caddy installation\n');
for (let action in ['start', 'stop', 'restart', 'reload', 'enable', 'disable']) {
	let response = plugin.action.call({ args: { action } });
	assert(response.ok == false && response.error == 'Caddy service is not installed',
		'valid action on absent service must explain the unavailable installation');
}
print('PASS: unavailable lifecycle operations fail without inventing success\n');
