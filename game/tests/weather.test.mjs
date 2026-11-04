import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.mjs";
import { Weather, weatherKind } from "../src/weather.mjs";
test("weather has known WMO types, retains failed cache, expires and recovers without coordinates in state", async () => {
  const store = new Store();
  let fail = false;
  const fetcher = async () => {
    if (fail) throw Error("offline");
    return {
      ok: true,
      json: async () => ({
        current: { weather_code: 61, temperature_2m: 17 },
        hourly: {
          time: ["2026-11-04T12:00"],
          weather_code: [61],
          temperature_2m: [17],
        },
      }),
    };
  };
  const w = new Weather(
    { city: "示例城市", latitude: 39.9, longitude: 116.4 },
    store,
    fetcher,
  );
  await w.refresh();
  assert.equal(store.raw().weather.kind, "rain");
  assert.ok(!JSON.stringify(store.snapshot()).includes("latitude"));
  fail = true;
  await w.refresh();
  assert.equal(store.raw().weather.available, true);
  assert.equal(store.raw().weather.stale, true);
  const raw = store.raw();
  raw.weather.updatedAt = Date.now() - 7 * 3600000;
  store.db.prepare("UPDATE world SET json=?").run(JSON.stringify(raw));
  w.expire();
  assert.equal(store.raw().weather.available, false);
  fail = false;
  await w.refresh();
  assert.equal(store.raw().weather.available, true);
  assert.equal(store.raw().weather.stale, false);
  assert.equal(weatherKind(999), null);
  assert.equal(weatherKind(75), "snow");
  store.close();
});
