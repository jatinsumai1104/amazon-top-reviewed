# Amazon Top Reviewed

A Chrome extension (Manifest V3) that finds the **10 most-reviewed products** for any search query on [amazon.in](https://www.amazon.in).

## How it works

Type a query in the popup and hit Search. The extension opens the Amazon search results in a hidden background tab, scrapes the product listings (review counts, star ratings, titles, prices, thumbnails, links), pulls a second page if needed to reach 10 results, then closes the tab and shows the top 10 ranked by review count. Your last search is saved and restored when you reopen the popup.

## Preview

<img width="421" height="527" alt="image" src="https://github.com/user-attachments/assets/28e6fa52-1177-49af-bba4-b9a7cb2e35c3" />

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory
4. Pin the extension and click its icon to open the popup

After editing any file, click the reload icon on the extension card.

## Notes

- Works on **amazon.in** only.
- Results depend on Amazon's page layout — if Amazon shows a CAPTCHA or changes its markup, scraping may return nothing.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3), permissions, popup entry |
| `popup.html` | Popup UI and styles |
| `popup.js` | Search flow, tab scraping, rendering, storage |
| `icon.png` | Toolbar icon |
