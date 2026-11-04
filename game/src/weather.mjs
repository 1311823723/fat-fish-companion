export const weatherKind = (c) =>
  c === 0
    ? "clear"
    : [1, 2].includes(c)
      ? "cloudy"
      : c === 3
        ? "overcast"
        : [45, 48].includes(c)
          ? "fog"
          : [95, 96, 99].includes(c)
            ? "thunder"
            : [71, 73, 75, 77, 85, 86].includes(c)
              ? "snow"
              : [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(c)
                ? "rain"
                : null;
export class Weather {
  constructor(settings, store, fetcher = fetch) {
    this.settings = settings;
    this.store = store;
    this.fetcher = fetcher;
  }
  async refresh() {
    const s = this.settings;
    if (!s || !Number.isFinite(s.latitude) || !Number.isFinite(s.longitude))
      return;
    try {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.search = new URLSearchParams({
        latitude: s.latitude,
        longitude: s.longitude,
        timezone: "Asia/Shanghai",
        current: "temperature_2m,weather_code",
        hourly: "temperature_2m,weather_code",
        forecast_days: "1",
      });
      const r = await this.fetcher(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw Error();
      const d = await r.json(),
        kind = weatherKind(d.current.weather_code);
      if (!kind || !Number.isFinite(d.current.temperature_2m)) throw Error();
      this.store.transact({
        type: "weather",
        requestId: "weather:" + Date.now(),
        args: {
          weather: {
            available: true,
            stale: false,
            city: s.city,
            kind,
            label: {
              clear: "晴",
              cloudy: "多云",
              overcast: "阴",
              rain: "雨",
              snow: "雪",
              fog: "雾",
              thunder: "雷雨",
            }[kind],
            temperature: d.current.temperature_2m,
            updatedAt: Date.now(),
            forecast: d.hourly.time.map((t, i) => ({
              at: Date.parse(t + "+08:00"),
              kind: weatherKind(d.hourly.weather_code[i]),
              temperature: d.hourly.temperature_2m[i],
            })),
          },
        },
      });
    } catch {
      const w = this.store.raw().weather;
      if (w.available)
        this.store.transact({
          type: "weather",
          requestId: "weather:failed:" + Date.now(),
          args: { weather: { ...w, stale: true } },
        });
      this.expire();
    }
  }
  expire() {
    const w = this.store.raw().weather;
    if (w.updatedAt && Date.now() - w.updatedAt > 6 * 3600000 && w.available)
      this.store.transact({
        type: "weather",
        requestId: "weather:expire:" + Date.now(),
        args: { weather: { ...w, available: false, stale: true } },
      });
  }
  start() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 30 * 60000);
    this.expiry = setInterval(() => this.expire(), 60000);
    this.timer.unref();
    this.expiry.unref();
  }
  stop() {
    clearInterval(this.timer);
    clearInterval(this.expiry);
  }
}
