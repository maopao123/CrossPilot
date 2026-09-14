import * as http from 'http';
import type { AddressInfo } from 'net';
import type {
  ErpCreateCommand,
  ErpInventoryItem,
  ErpPurchaseOrder,
  ErpReceiptCommand,
  ErpReceiptRecord,
} from '@crosspilot/shared';

export interface ErpServerOptions {
  port?: number;
}

export class ErpHttpServerFixture {
  private server: http.Server | null = null;
  private port: number = 0;
  private orders: Map<string, ErpPurchaseOrder> = new Map();
  private operationIndex: Map<string, string> = new Map();
  private idempotencyIndex: Map<string, string> = new Map();
  private inventories: Map<string, ErpInventoryItem> = new Map();
  private receipts: Map<string, ErpReceiptRecord> = new Map();
  public requestCount: number = 0;

  constructor(options: ErpServerOptions = {}) {
    this.port = options.port ?? 0;
    this.inventories.set('SKU-001', {
      skuId: 'SKU-001',
      available: 30,
      inbound: 0,
      reserved: 5,
      updatedAt: new Date().toISOString(),
    });
  }

  setInventory(item: ErpInventoryItem) {
    this.inventories.set(item.skuId, item);
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.requestCount++;
        const fault = req.headers['x-inject-fault'];

        if (fault === '401') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: invalid credentials' }));
          return;
        }

        if (fault === '429') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Too many requests' }));
          return;
        }

        if (fault === 'timeout') {
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'OK' }));
            }
          }, 2000);
          return;
        }

        if (fault === 'malformed_200') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'PENDING', message: 'Job accepted but no externalId created' }));
          return;
        }

        if (fault === 'invalid_json_200') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('<html><body>Bad Gateway</body></html>');
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        let bodyBuffer = '';
        req.on('data', (chunk) => {
          bodyBuffer += chunk;
        });

        req.on('end', () => {
          let body: any = null;
          if (bodyBuffer) {
            try {
              body = JSON.parse(bodyBuffer);
            } catch {
              body = null;
            }
          }

          if (req.method === 'POST' && pathname === '/erp/purchase-orders') {
            const cmd = body as ErpCreateCommand;
            if (!cmd || !cmd.supplierId || !Array.isArray(cmd.lines) || cmd.lines.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Validation error: invalid lines or supplier' }));
              return;
            }

            if (cmd.operationId && this.operationIndex.has(cmd.operationId)) {
              const existingId = this.operationIndex.get(cmd.operationId)!;
              const existingOrder = this.orders.get(existingId)!;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(existingOrder));
              return;
            }

            if (cmd.idempotencyKey && this.idempotencyIndex.has(cmd.idempotencyKey)) {
              const existingId = this.idempotencyIndex.get(cmd.idempotencyKey)!;
              const existingOrder = this.orders.get(existingId)!;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(existingOrder));
              return;
            }

            const externalId = `ERP-PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const totalAmountMinor = cmd.lines.reduce(
              (acc, l) => acc + l.quantity * l.unitCostMinor,
              0,
            );

            const order: ErpPurchaseOrder = {
              externalId,
              operationId: cmd.operationId,
              idempotencyKey: cmd.idempotencyKey,
              supplierId: cmd.supplierId,
              warehouseId: cmd.warehouseId,
              status: 'CONFIRMED',
              lines: cmd.lines,
              totalAmountMinor,
              currency: cmd.currency || 'USD',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            this.orders.set(externalId, order);
            if (cmd.operationId) this.operationIndex.set(cmd.operationId, externalId);
            if (cmd.idempotencyKey) this.idempotencyIndex.set(cmd.idempotencyKey, externalId);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(order));
            return;
          }

          if (req.method === 'GET' && pathname.startsWith('/erp/purchase-orders/by-operation/')) {
            const operationId = decodeURIComponent(pathname.replace('/erp/purchase-orders/by-operation/', ''));
            const externalId = this.operationIndex.get(operationId);
            if (!externalId || !this.orders.has(externalId)) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Order not found for operation' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.orders.get(externalId)));
            return;
          }

          if (req.method === 'GET' && pathname.startsWith('/erp/purchase-orders/')) {
            const externalId = decodeURIComponent(pathname.replace('/erp/purchase-orders/', ''));
            const order = this.orders.get(externalId);
            if (!order) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Order not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(order));
            return;
          }

          if (req.method === 'GET' && pathname.startsWith('/erp/inventory/')) {
            const skuId = decodeURIComponent(pathname.replace('/erp/inventory/', ''));
            const inv = this.inventories.get(skuId);
            if (!inv) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Inventory not found for SKU' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(inv));
            return;
          }

          if (req.method === 'POST' && pathname.includes('/receipts')) {
            const cmd = body as ErpReceiptCommand;
            if (!cmd || !cmd.externalReceiptId || !cmd.purchaseOrderId || !Array.isArray(cmd.lines)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid receipt payload' }));
              return;
            }

            if (this.receipts.has(cmd.externalReceiptId)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(this.receipts.get(cmd.externalReceiptId)));
              return;
            }

            const record: ErpReceiptRecord = {
              externalReceiptId: cmd.externalReceiptId,
              purchaseOrderId: cmd.purchaseOrderId,
              lines: cmd.lines,
              receivedAt: cmd.receivedAt || new Date().toISOString(),
            };
            this.receipts.set(cmd.externalReceiptId, record);

            const order = this.orders.get(cmd.purchaseOrderId);
            if (order) {
              order.status = 'PARTIALLY_RECEIVED';
            }

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(record));
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof (this.server as any).closeAllConnections === 'function') {
          (this.server as any).closeAllConnections();
        }
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
