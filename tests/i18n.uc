// Native LuCI runtime seam; pass a directory containing the packaged LMO.
import { load_catalog, change_catalog, translate } from 'luci.core';
function check(condition, message) { if (!condition) die(message + '\n'); }
check(load_catalog('zh-cn', ARGV[0]), 'cannot load native Chinese catalog');
check(change_catalog('zh-cn'), 'cannot select Chinese catalog');
for (let pair in [
 ['TLS certificates', 'TLS 证书'], ['Overview', '概览'],
 ['Configuration', '配置'], ['Stored certificates', '已存储证书'],
 ['Certificate alerts', '证书告警'], ['Logs and diagnostics', '日志与诊断'],
 ['Save', '保存'], ['Save & Apply', '保存并应用'],
 ['Access authentication', '访问认证'], ['Username', '用户名'],
 ['New password', '新密码'], ['Verification method', '验证方式'],
 ['Reload active configuration', '重载生效配置'],
 ['Unknown', '未知']
]) check(translate(pair[0]) == pair[1], 'translation mismatch: ' + pair[0]);
// luci.core returns null for unknown keys; native LuCI JS _() uses the msgid.
check(translate('caddy-untranslated-fallback') == null, 'unexpected fallback override');
print('native LuCI Chinese catalog and English fallback passed\n');
