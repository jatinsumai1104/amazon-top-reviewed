const btn = document.getElementById("search-btn");
const input = document.getElementById("query-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

// ─── Restore last search on open ─────────────────────────────────────────────
chrome.storage.local.get(["lastQuery", "lastResults", "lastStatus"], (data) => {
  if (data.lastQuery) {
    input.value = data.lastQuery;
  }
  if (data.lastResults && data.lastResults.length) {
    setStatus(data.lastStatus || "Last search results");
    renderResults(data.lastResults);
  }
});

// Allow pressing Enter to search
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
btn.addEventListener("click", runSearch);

function setStatus(msg, loading = false) {
  statusEl.innerHTML = loading
    ? `<div class="spinner"></div><span>${msg}</span>`
    : `<span>${msg}</span>`;
}

function rankClass(i) {
  if (i === 0) return "rank-badge gold";
  if (i === 1) return "rank-badge silver";
  if (i === 2) return "rank-badge bronze";
  return "rank-badge";
}

function starsHTML(rating) {
  if (!rating) return "";
  const full = Math.round(parseFloat(rating));
  const stars = "★".repeat(full) + "☆".repeat(5 - full);
  return `<span class="stars">${stars}</span><span class="stars-val">${rating}</span>`;
}

function renderResults(products) {
  if (!products.length) {
    resultsEl.innerHTML = `<div class="empty">No products found.<br>Amazon may have shown a CAPTCHA.</div>`;
    return;
  }

  resultsEl.innerHTML = products
    .map(
      (p, i) => `
    <a class="product" href="${p.url}" target="_blank" title="${p.title}">
      <div class="${rankClass(i)}">${i + 1}</div>
      ${p.image ? `<img class="thumb" src="${p.image}" alt="" />` : ""}
      <div class="info">
        <div class="product-title">${p.title || "Unknown product"}</div>
        <div class="product-meta">
          ${starsHTML(p.stars)}
          <span class="review-count"><strong>${p.reviews.toLocaleString()}</strong> reviews</span>
          ${p.price ? `<span class="price">${p.price}</span>` : ""}
        </div>
      </div>
    </a>
  `
    )
    .join("");

  resultsEl.innerHTML += `<div class="pages-note">Scraped ${products._pages || 1} page(s) · ${products._total || products.length} products scanned</div>`;
}

async function runSearch() {
  const query = input.value.trim();
  if (!query) return;

  btn.disabled = true;
  resultsEl.innerHTML = "";

  // Build the Amazon search URL
  const searchUrl =
    "https://www.amazon.in/s?k=" + encodeURIComponent(query.replace(/\s+/g, "+"));

  setStatus(`Opening Amazon…`, true);

  // Create a hidden tab, scrape it, then close it
  chrome.tabs.create({ url: searchUrl, active: false }, async (tab) => {
    // Wait for the tab to fully load
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId !== tab.id || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(listener);

      setStatus("Scraping page 1…", true);

      // Inject scraper into the tab
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: scrapePage,
        },
        async (results) => {
          if (chrome.runtime.lastError || !results || !results[0]) {
            setStatus("Error: " + (chrome.runtime.lastError?.message || "unknown"));
            btn.disabled = false;
            chrome.tabs.remove(tab.id);
            return;
          }

          let products = results[0].result || [];
          let pagesScraped = 1;

          // If we have fewer than 10, try page 2
          if (products.length < 10) {
            setStatus("Scraping page 2…", true);
            const page2Url = searchUrl + "&page=2";
            await new Promise((resolve) => {
              chrome.tabs.update(tab.id, { url: page2Url }, () => {
                chrome.tabs.onUpdated.addListener(function l2(tid, info2) {
                  if (tid !== tab.id || info2.status !== "complete") return;
                  chrome.tabs.onUpdated.removeListener(l2);

                  chrome.scripting.executeScript(
                    { target: { tabId: tab.id }, func: scrapePage },
                    (r2) => {
                      if (!chrome.runtime.lastError && r2?.[0]?.result) {
                        products = mergeDedupe(products, r2[0].result);
                        pagesScraped = 2;
                      }
                      resolve();
                    }
                  );
                });
              });
            });
          }

          chrome.tabs.remove(tab.id);

          // Sort by review count, take top 10
          const top10 = products
            .sort((a, b) => b.reviews - a.reviews)
            .slice(0, 10);

          top10._pages = pagesScraped;
          top10._total = products.length;

          const statusMsg = top10.length === 0
            ? "No products with reviews found."
            : `Top ${top10.length} products by review count`;

          setStatus(statusMsg);
          renderResults(top10);
          btn.disabled = false;

          if (top10.length > 0) {
            chrome.storage.local.set({
              lastQuery: query,
              lastResults: top10,
              lastStatus: `Last search: "${query}" · ${top10.length} results`,
            });
          }
        }
      );
    });
  });
}

// Merge two product arrays, deduplicating by ASIN
function mergeDedupe(a, b) {
  const seen = new Set(a.map((p) => p.asin));
  return [...a, ...b.filter((p) => !seen.has(p.asin))];
}

// ─── This function runs INSIDE the Amazon tab ────────────────────────────────
function scrapePage() {
  const products = [];

  document.querySelectorAll(".s-result-item[data-asin]").forEach((item) => {
    const asin = item.dataset.asin?.trim();
    if (!asin) return;

    // Review count — try multiple selectors Amazon uses
    const reviewEl =
      item.querySelector(".s-underline-text span.s-underline-text") ||
      item.querySelector("span[aria-label*='ratings'] .s-underline-text") ||
      item.querySelector("a[aria-label*='ratings'] span") ||
      item.querySelector(".a-size-small .a-link-normal span");

    if (!reviewEl) return;

    let raw = reviewEl.textContent.replace(/,/g, "").replace(/[()]/g, "").trim();
    let count = 0;
    if (/k/i.test(raw)) {
      count = Math.round(parseFloat(raw) * 1000);
    } else {
      count = parseInt(raw, 10);
    }
    if (!count || isNaN(count)) return;

    // Star rating
    const starEl = item.querySelector("span.a-icon-alt");
    const stars = starEl
      ? starEl.textContent.split(" ")[0]
      : null;

    // Title
    const titleEl = item.querySelector("h2 span, .a-size-base-plus, .a-size-medium");
    const title = titleEl ? titleEl.textContent.trim() : "";

    // URL — strip tracking params
    const linkEl = item.querySelector("h2 a, a.a-link-normal[href*='/dp/']");
    const href = linkEl ? linkEl.getAttribute("href").split("?")[0] : `/dp/${asin}`;
    const url = "https://www.amazon.in" + href;

    // Price (current/offer price) and product thumbnail
    const priceEl = item.querySelector(".a-price .a-offscreen");
    const price = priceEl ? priceEl.textContent.trim() : null;
    const imgEl = item.querySelector("img.s-image");
    const image = imgEl ? imgEl.getAttribute("src") : null;

    products.push({ asin, title, stars, reviews: count, url, price, image });
  });

  return products;
}
