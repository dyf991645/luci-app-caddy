#!/usr/bin/env python3
"""Actual Authelia4.39 session/login acceptance via isolated Caddy.

Requires the documented real fixture; only a disposable local test user exists.
"""
import json
import pathlib
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='caddy08-client-') as directory:
    directory = pathlib.Path(directory)
    cookies = directory / 'cookies'
    def request(host, path, payload=None, session=False, forged=False):
        headers, body = directory / 'headers', directory / 'body'
        command = ['curl', '--noproxy', '*', '-ksS', '--connect-to', f'{host}:28443:127.0.0.1:18443',
                   '-D', str(headers), '-o', str(body), '-w', '%{http_code}', '-c', str(cookies)]
        if session:
            command += ['-b', str(cookies)]
        if forged:
            for header in ['Remote-User','Remote-Groups','Remote-Email','Remote-Name']:
                command += ['-H', f'{header}: forged']
        if payload is not None:
            command += ['-H', 'Content-Type: application/json', '--data', json.dumps(payload)]
        command += [f'https://{host}:28443{path}']
        return int(subprocess.check_output(command)), headers.read_text(), body.read_text()

    status, headers, _ = request('app.example.test','/media/')
    assert status == 302 and 'location: https://auth.example.test:28443/' in headers.lower()
    assert request('auth.example.test','/api/health')[0] == 200, 'portal is directly accessible'
    payload = {'username':'ticket08','password':'wrong-password','keepMeLoggedIn':False,
               'targetURL':'https://app.example.test:28443/media/','requestMethod':'GET'}
    assert request('auth.example.test','/api/firstfactor',payload,True)[0] == 401
    payload['password'] = 'Ticket08-Isolated-Only-2026'
    status, _, body = request('auth.example.test','/api/firstfactor',payload,True)
    assert status == 200 and json.loads(body)['status'] == 'OK'
    status, _, body = request('app.example.test','/media/item?x=1',session=True,forged=True)
    result = json.loads(body)
    assert status == 200 and result['uri'] == '/item?x=1'
    assert result['identity'] == {'Remote-User':'ticket08','Remote-Groups':'testers',
                                  'Remote-Email':'ticket08@example.test','Remote-Name':'Ticket Eight'}
    assert request('app.example.test','/media/denied',session=True)[0] == 403
    assert request('app.example.test','/outside',session=True)[0] == 404
    print('PASS actual Authelia4.39.28: anonymous302, public portal, invalid-login401, real single-factor session login, protected200, trusted identity, policy403, outside404')
