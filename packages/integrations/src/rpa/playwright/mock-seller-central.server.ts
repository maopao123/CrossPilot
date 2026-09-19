import * as http from 'node:http';
import { AddressInfo } from 'node:net';

export interface MockSellerListing {
  sku: string;
  title: string;
  price: number;
  status: string;
  asin: string;
}

export const DEFAULT_MOCK_LISTINGS: Record<string, MockSellerListing> = {
  'SKU-001': {
    sku: 'SKU-001',
    title: 'Marble Toothbrush Holder White',
    price: 24.99,
    status: 'Active',
    asin: 'B0C7M8W101',
  },
  'MTH-GREEN-001': {
    sku: 'MTH-GREEN-001',
    title: 'Marble Toothbrush Holder Green',
    price: 29.99,
    status: 'Active',
    asin: 'B0C7M8W102',
  },
  'SHOE-ORG-001': {
    sku: 'SHOE-ORG-001',
    title: '16-Pair Shoe Organizer Box',
    price: 39.99,
    status: 'Active',
    asin: 'B0C7M8W103',
  },
};

export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Embedded Mock Amazon Seller Central server for realistic Playwright Browser Automation.
 * Serves live interactive HTML UI with SKU inventory list, listing editor, and API state persistence.
 */
export class MockSellerCentralServer {
  private server: http.Server | null = null;
  private port = 0;
  private listings = new Map<string, MockSellerListing>();

  constructor() {
    this.resetListings();
  }

  resetListings(): void {
    this.listings.clear();
    for (const [k, v] of Object.entries(DEFAULT_MOCK_LISTINGS)) {
      this.listings.set(k, { ...v });
    }
  }

  getListing(sku: string): MockSellerListing | undefined {
    return this.listings.get(sku);
  }

  setListing(sku: string, data: Partial<MockSellerListing>): MockSellerListing {
    const existing = this.listings.get(sku) || {
      sku,
      title: 'New Product',
      price: 19.99,
      status: 'Active',
      asin: 'B000000000',
    };
    const updated = { ...existing, ...data };
    this.listings.set(sku, updated);
    return updated;
  }

  async start(port = 0): Promise<string> {
    if (this.server) {
      return `http://127.0.0.1:${this.port}`;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getUrl(): string {
    if (!this.server) throw new Error('MockSellerCentralServer is not running');
    return `http://127.0.0.1:${this.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // 1. API: Get listing JSON
    if (method === 'GET' && pathname.startsWith('/api/listings/')) {
      const sku = decodeURIComponent(pathname.replace('/api/listings/', ''));
      const item = this.listings.get(sku);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'SKU not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(item));
      return;
    }

    // 2. API: Update listing JSON
    if (method === 'POST' && pathname === '/api/listings/update') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (payload.simulateFail) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Simulated Seller Central server error' }));
            return;
          }
          if (!payload.sku) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'sku is required' }));
            return;
          }
          const updated = this.setListing(payload.sku, {
            ...(payload.title != null ? { title: String(payload.title) } : {}),
            ...(payload.price != null ? { price: parseFloat(String(payload.price)) } : {}),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, listing: updated }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 3. UI: Listing Edit Page
    if (method === 'GET' && pathname === '/edit') {
      const sku = parsedUrl.searchParams.get('sku') || '';
      const listing = this.listings.get(sku);
      if (!listing) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Error: SKU "${sku}" not found</h1><a href="/">Back to inventory</a>`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderEditPage(listing));
      return;
    }

    // 4. UI: Inventory Dashboard (Home)
    if (method === 'GET' && (pathname === '/' || pathname === '/inventory')) {
      const search = (parsedUrl.searchParams.get('q') || '').toLowerCase();
      const rows = Array.from(this.listings.values()).filter(
        (l) => !search || l.sku.toLowerCase().includes(search) || l.title.toLowerCase().includes(search),
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderDashboardPage(rows, search));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private renderDashboardPage(items: MockSellerListing[], search: string): string {
    const escapedSearch = escapeHtml(search);
    const tableRows = items
      .map(
        (item) => `
        <tr data-sku="${escapeHtml(item.sku)}" id="row-${escapeHtml(item.sku)}">
          <td class="col-sku font-mono">${escapeHtml(item.sku)}</td>
          <td class="col-asin text-muted">${escapeHtml(item.asin)}</td>
          <td class="col-title" id="title-${escapeHtml(item.sku)}">${escapeHtml(item.title)}</td>
          <td class="col-price" id="price-${escapeHtml(item.sku)}">$${item.price.toFixed(2)}</td>
          <td class="col-status"><span class="badge badge-active">${escapeHtml(item.status)}</span></td>
          <td class="col-action">
            <a class="btn-edit" id="edit-${escapeHtml(item.sku)}" href="/edit?sku=${encodeURIComponent(item.sku)}">Edit Listing</a>
          </td>
        </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Amazon Seller Central - Manage Inventory (Mock)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; color: #111; }
    .header { background: #232f3e; color: #fff; padding: 15px 25px; border-radius: 6px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
    .card { background: #fff; border: 1px solid #d5dbdb; border-radius: 6px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
    input[type="text"] { flex: 1; max-width: 400px; padding: 8px 12px; border: 1px solid #888c8c; border-radius: 4px; font-size: 14px; }
    button { background: #ffd814; border: 1px solid #fcd200; border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-weight: 500; }
    button:hover { background: #f7ca00; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #eaeded; }
    th { background: #fafafa; font-weight: 600; color: #555; }
    .btn-edit { background: #e7e9ec; border: 1px solid #888c8c; border-radius: 4px; padding: 6px 12px; text-decoration: none; color: #111; font-size: 13px; display: inline-block; }
    .btn-edit:hover { background: #d8dade; }
    .badge-active { background: #067d62; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600; }
    .text-muted { color: #565959; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Amazon Seller Central • Manage All Inventory</h1>
    <span class="badge-active">Mock Test Environment</span>
  </div>
  <div class="card">
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search SKU or title..." value="${escapedSearch}" />
      <button id="search-button" onclick="doSearch()">Search</button>
      <button id="btn-refresh" style="background:#fff;" onclick="window.location.href='/'">Show All</button>
    </div>
    <table id="inventory-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>ASIN</th>
          <th>Product Title</th>
          <th>Price</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#777;">No products match search criteria</td></tr>'}
      </tbody>
    </table>
  </div>
  <script>
    function doSearch() {
      const q = document.getElementById('search-input').value;
      window.location.href = '/?q=' + encodeURIComponent(q);
    }
    document.getElementById('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  </script>
</body>
</html>`;
  }

  private renderEditPage(listing: MockSellerListing): string {
    const escapedSku = escapeHtml(listing.sku);
    const escapedAsin = escapeHtml(listing.asin);
    const escapedTitle = escapeHtml(listing.title);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Edit Listing - ${escapedSku} • Seller Central</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; color: #111; }
    .header { background: #232f3e; color: #fff; padding: 15px 25px; border-radius: 6px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .card { background: #fff; border: 1px solid #d5dbdb; border-radius: 6px; padding: 25px; max-width: 700px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .form-group { margin-bottom: 18px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; color: #0f1111; }
    input[type="text"], input[type="number"] { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #888c8c; border-radius: 4px; font-size: 14px; }
    input:focus { outline: none; border-color: #e77600; box-shadow: 0 0 3px 2px rgba(228,121,17,0.5); }
    .hint { font-size: 12px; color: #565959; margin-top: 4px; }
    .actions { display: flex; gap: 12px; margin-top: 25px; }
    .btn-save { background: #ffd814; border: 1px solid #fcd200; border-radius: 6px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-save:hover { background: #f7ca00; }
    .btn-cancel { background: #fff; border: 1px solid #d5dbdb; border-radius: 6px; padding: 10px 20px; text-decoration: none; color: #111; font-size: 14px; }
    .alert-success { background: #dff0d8; border: 1px solid #d6e9c6; color: #3c763d; padding: 12px; border-radius: 4px; margin-top: 20px; font-size: 14px; font-weight: 500; }
    .alert-error { background: #f2dede; border: 1px solid #ebccd1; color: #a94442; padding: 12px; border-radius: 4px; margin-top: 20px; font-size: 14px; font-weight: 500; }
    .sku-badge { background: #eaeded; padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Edit Product Listing Details</h1>
    <a href="/" style="color:#ffd814;text-decoration:none;font-size:14px;">← Back to Manage Inventory</a>
  </div>
  <div class="card">
    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <span style="color:#555;font-size:13px;">SKU:</span> <span class="sku-badge" id="display-sku">${escapedSku}</span> &nbsp;•&nbsp;
      <span style="color:#555;font-size:13px;">ASIN:</span> <span class="sku-badge" id="display-asin">${escapedAsin}</span>
    </div>

    <form id="listing-form" onsubmit="return false;">
      <input type="hidden" id="listing-sku" value="${escapedSku}" />

      <div class="form-group">
        <label for="listing-title">Item Name (Product Title)</label>
        <input type="text" id="listing-title" name="title" value="${escapedTitle}" />
        <div class="hint">Recommended length: 80 - 150 characters.</div>
      </div>

      <div class="form-group">
        <label for="listing-price">Standard Price (USD)</label>
        <input type="number" id="listing-price" name="price" step="0.01" value="${listing.price}" />
        <div class="hint">The retail offer price presented to buyers.</div>
      </div>

      <div class="actions">
        <button type="button" class="btn-save" id="btn-save" onclick="submitListing()">Save and finish</button>
        <a href="/" class="btn-cancel" id="btn-cancel">Cancel</a>
      </div>
    </form>

    <div id="save-status" style="display:none;"></div>
  </div>

  <script>
    async function submitListing() {
      const sku = document.getElementById('listing-sku').value;
      const title = document.getElementById('listing-title').value;
      const price = parseFloat(document.getElementById('listing-price').value);
      const statusBox = document.getElementById('save-status');

      statusBox.style.display = 'block';
      statusBox.className = '';
      statusBox.innerHTML = 'Saving listing...';

      try {
        const res = await fetch('/api/listings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, title, price })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          statusBox.className = 'alert-success';
          statusBox.innerHTML = '✓ Listing updated successfully. Changes will be live shortly.';
        } else {
          statusBox.className = 'alert-error';
          statusBox.innerHTML = '✕ Error saving listing: ' + (data.error || 'Server rejected update');
        }
      } catch (err) {
        statusBox.className = 'alert-error';
        statusBox.innerHTML = '✕ Network error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
  }
}
