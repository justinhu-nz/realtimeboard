const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  for (const file of ['index.html', 'index2.html', 'index-live.html']) {
    for (const deployed of [false, true]) {
      const secret = 'TEST-DEPLOYED-SECRET';
      let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
        .match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    render\(\);\s*$/, '');
      if (deployed) source = source.replace('__AT_API_KEY__', secret);
      const store = new Map(), app = {}, requests = [];
      const context = vm.createContext({app, console, URL, Intl, Date, AbortSignal,
        location: {hash: '', href: 'https://board.example/'},
        localStorage: {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)},
        window: {addEventListener() {}},
        document: {getElementById: () => app, querySelector: () => null, querySelectorAll: () => []},
        fetch: async (url, options) => {
          requests.push({url, headers: options.headers});
          return {ok: true, json: async () => ({entity: []})};
        }
      });
      const run = code => vm.runInContext(code, context);
      run(source);
      assert.equal(run('subscriptionKey(state.config)'), deployed ? secret : '');
      run('renderSetup()');
      assert.equal(app.innerHTML.includes('name="subscriptionKey"'), !deployed);
      assert(!app.innerHTML.includes(secret));
      run('state.editingKey = true; renderSetup()');
      assert(app.innerHTML.includes('name="subscriptionKey" type="password" value=""'));
      assert(!app.innerHTML.includes(secret));
      run('saveConfig()');
      assert(!Array.from(store.values()).some(value => value.includes(secret)));
      run('state.config.departuresUrl = "";');
      await run('refreshRealtime()');
      if (deployed) {
        assert.equal(requests.length, 3);
        assert.equal(run("state.subKeyOk"), true);
        assert(requests.every(request => request.headers['Ocp-Apim-Subscription-Key'] === secret));
        run('state.config.subscriptionKey = BUILTIN_AT_KEY; saveConfig(); state.config = loadConfig(); renderSetup()');
        assert.equal(run('state.config.subscriptionKey'), '');
        assert(!app.innerHTML.includes(secret));
        assert(!Array.from(store.values()).some(value => value.includes(secret)));
      } else assert.equal(requests.length, 0);
      run('state.config.subscriptionKey = "PERSONAL-KEY"; saveConfig(); state.config = loadConfig()');
      assert.equal(run('subscriptionKey(state.config)'), 'PERSONAL-KEY');
      run('state.keyTest = null; renderSetup()');
      assert(app.innerHTML.includes('name="subscriptionKey" type="password" value="PERSONAL-KEY"'));
      if (file === 'index2.html') {
        run('boardSource = "motat"; state.config = {...MOTAT_DEFAULT_CONFIG}');
        assert.equal(run('subscriptionKey(state.config)'), '');
      }
    }
    console.log(file + ': automatic credentials, rendered form, request headers, persistence, migration, and personal-key override passed');
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
