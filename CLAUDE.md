# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension ("Amazon Top Reviewed") that finds the 10 most-reviewed products for a search query on **amazon.in**. There is no build step, bundler, or test suite — the four source files (`manifest.json`, `popup.html`, `popup.js`, `icon.png`) load directly.

## Running / testing

Load unpacked: `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory. Reload from that page after edits. Debug the popup via right-click → Inspect on the popup window.

## Architecture

Everything runs in the popup (`popup.js`) — there is no background/service worker or content script file. The flow in `runSearch()`:

1. Open the Amazon search URL in a **hidden tab** (`active: false`).
2. Wait for `tabs.onUpdated` `status === "complete"`, then inject `scrapePage()` into the tab via `chrome.scripting.executeScript`.
3. If fewer than 10 products come back, navigate the same tab to `&page=2` and scrape again, merging by ASIN (`mergeDedupe`).
4. Close the tab, sort by review count, take top 10, render, and persist to `chrome.storage.local` (`lastQuery`/`lastResults`/`lastStatus`, restored on next open).

`scrapePage()` is serialized and executed in the Amazon page context, so it must stay self-contained (no closures over popup variables). It parses `.s-result-item[data-asin]` and extracts review count, stars, title, url, price (`.a-price .a-offscreen`) and thumbnail (`img.s-image`). This is the fragile part: Amazon's DOM/selectors change often and CAPTCHAs return zero results. The review-count and title selectors already try multiple fallbacks — extend those lists rather than replacing them when scraping breaks. `price`/`image` may be null for some listings; `renderResults` guards both.

## Constraints

- `host_permissions` is `https://www.amazon.in/*` only. Supporting other Amazon domains requires adding hosts here **and** generalizing the hardcoded `amazon.in` URLs in `popup.js`.
- Scraped strings are inserted into the DOM via `innerHTML` in `renderResults` — keep that in mind when touching rendering.
