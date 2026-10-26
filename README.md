# TradingStrategist — Offline Trading Simulator

A free trading simulator for practising price action, ICT / smart-money concepts and news trading.
No account, no data feed, no backend: just HTML, CSS and JavaScript. Works offline and installs as an app on phone and PC.

**[▶ Open the web app](https://malackyevidence.github.io/tradestrategist/)** ·
**[⬇ Download TradingStrategist.html](https://github.com/malackyevidence/TradingStrategist/releases/latest/download/TradingStrategist.html)**

## Install it as an app (phone and PC)
Open the web app link above once, then:
- **Windows / Mac / Linux (Chrome or Edge):** click the install icon in the address bar, or the **⬇ Install app** button in TradingStrategist, or menu → *Install TradingStrategist*.
- **Android (Chrome):** menu ⋮ → *Install app* (or *Add to Home screen*).
- **iPhone / iPad (Safari):** Share button → *Add to Home Screen*.

After installing it opens in its own window like any app and keeps working with no internet.
Prefer a single file? Download `TradeStategist.html` from Releases and double-click it (works offline, but cannot be "installed").

## Features
- MetaTrader-style candlestick chart: M1 to D1, wheel / pinch zoom, drag to scroll back through 30 days of history
- RSI (14) and Volume panes, optional fair-value-gap shading, drawing tools (horizontal line, trend line, zone, Fibonacci, magnet)
- Market, limit and stop orders with stop loss / take profit; drag SL, TP and pending lines on the chart
- Partial close, close all / winners / losers, break-even, risk-% lot calculator, margin, margin call, stop-out and slippage
- Open trades, pending orders, full history with statistics, CSV export and a Journal of every event
- A Main account and a Trading account with transfers between them
- Forex, gold, crypto, a stock and synthetic indices
- Realistic simulated price action: ranges, trends, pullbacks, liquidity sweeps, displacement and session volatility
- Random CPI, NFP, rate decisions and more at realistic times, with a prediction alert 10 minutes before release and a real price reaction
- Pause, speed up to 240x, step one candle at a time, jump to the next news event

## Shortcuts
Wheel = zoom · drag = pan · Shift+wheel or arrow keys = scroll · +/- = zoom · Home/End = oldest/latest ·
Space = pause/resume · N = next candle · Right-click = order menu · Del = delete drawing · Esc = cancel

## Your data
Everything stays in your browser (localStorage). Nothing is sent anywhere. *Settings → New session* resets it.

## Deploy / build from source
Hosting: publish the repository root with GitHub Pages (Settings → Pages → branch `main`, folder `/ (root)`).
Source: `src/` holds the readable files; `node build.js` bundles them into `TradingStrategist.html` and a ready-to-deploy `site/` folder.
After changing the app, bump `CACHE` in `src/pwa/sw.js` (e.g. `TradingStrategist-v3`) so installed copies refresh, and bump `ENGINE_VER` in `src/engine.js` only if price generation changes.

## Disclaimer
TradingStrategist is an educational simulator. Prices, news and results are artificial, use play money, and do not predict or
represent real markets. Nothing here is financial advice. Not affiliated with MetaTrader, TradingView or any broker.

## License
MIT — free to use, modify and share. See [LICENSE](LICENSE).
