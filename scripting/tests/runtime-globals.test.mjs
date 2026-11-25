import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("native globals must not be shadowed by scripting SDK imports", async () => {
  for (const file of ["core/store.js", "core/reminders.js", "core/api.js", "app_view.tsx"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']scripting["']/g)) {
      assert.doesNotMatch(match[1], /\b(Storage|Keychain|WebViewController|TimeIntervalNotificationTrigger)\b/, file);
    }
  }
});

test("storage starts with defaults and credentials remain in Keychain", async () => {
  const mock = () => {
    const values = new Map();
    return {
      get: key => values.get(key) ?? null,
      set: (key, value) => { values.set(key, value); return true; },
      remove: key => values.delete(key),
      keys: () => [...values.keys()]
    };
  };
  globalThis.Storage = mock();
  globalThis.Keychain = mock();
  try {
    const config = new URL("../core/config.js", import.meta.url).href;
    const source = (await readFile(new URL("../core/store.js", import.meta.url), "utf8"))
      .replace('"./config"', JSON.stringify(config));
    const store = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
    assert.equal(store.getPreferences().theme, "navy");
    assert.equal(store.getAccount().configured, false);
    store.savePreferences({ theme: "teal" });
    assert.equal(store.getPreferences().theme, "teal");
    store.saveAccount({ username: "test", password: " test password ", deviceId: "test-device" });
    assert.equal(store.getAccount().configured, true);
    assert.equal(store.getAccount().password, " test password ");
    assert.equal(Storage.keys().some(key => /password|token/i.test(key)), false);
  } finally {
    delete globalThis.Storage;
    delete globalThis.Keychain;
  }
});
