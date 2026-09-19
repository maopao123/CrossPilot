import type { Page } from 'playwright';

export interface ListingFormData {
  sku?: string;
  title: string;
  price: number;
}

/**
 * Page Object Model encapsulating Amazon Seller Central (and Mock Seller Central) UI interactions.
 * Isolates selector queries, waiting logic, and input handling from workflow logic.
 */
export class SellerCentralPage {
  constructor(private readonly page: Page) {}

  /**
   * Navigates to Seller Central Inventory Dashboard.
   */
  async gotoDashboard(baseUrl: string, timeoutMs = 15000): Promise<void> {
    await this.page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await this.page.waitForSelector('#search-input', { timeout: timeoutMs });
  }

  /**
   * Directly navigates to the listing edit page for a given SKU.
   */
  async gotoEditPage(baseUrl: string, sku: string, timeoutMs = 15000): Promise<void> {
    const editUrl = `${baseUrl.replace(/\/$/, '')}/edit?sku=${encodeURIComponent(sku)}`;
    await this.page.goto(editUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await this.page.waitForSelector('#listing-title', { timeout: timeoutMs });
  }

  /**
   * Searches for a SKU on the dashboard and opens its Edit Listing page.
   * Strictly matches the exact SKU row and rejects substring collisions.
   */
  async searchAndOpenEdit(sku: string, timeoutMs = 15000): Promise<void> {
    const searchInput = this.page.locator('#search-input');
    await searchInput.fill(sku);

    const searchButton = this.page.locator('#search-button');
    await searchButton.click();

    const escapedSkuAttr = sku.replace(/["\\]/g, '\\$&');
    const exactRow = this.page.locator(`tr[data-sku="${escapedSkuAttr}"]`);
    let editButton = exactRow.locator('.btn-edit').first();

    if ((await exactRow.count()) > 0) {
      // Validate that the row's edit link (if an anchor) targets the requested SKU
      const href = await editButton.getAttribute('href');
      if (href) {
        try {
          const parsed = new URL(href, 'http://localhost');
          const linkSku = parsed.searchParams.get('sku');
          if (linkSku && linkSku !== sku) {
            throw new Error(
              `LOCATE_FAILED: TARGET_MISMATCH: Row edit link targets SKU "${linkSku}" but requested "${sku}"`,
            );
          }
        } catch (err: any) {
          if (err.message.includes('LOCATE_FAILED')) throw err;
        }
      }
    } else {
      // Strict fallback: if no tr[data-sku="..."] attribute is rendered, inspect
      // anchor elements and match the parsed URL query parameter "sku" exactly.
      const candidates = this.page.locator('a.btn-edit');
      const count = await candidates.count();
      for (let i = 0; i < count; i++) {
        const candidate = candidates.nth(i);
        const href = await candidate.getAttribute('href');
        if (href) {
          try {
            const parsed = new URL(href, 'http://localhost');
            if (parsed.searchParams.get('sku') === sku) {
              editButton = candidate;
              break;
            }
          } catch {
            // ignore invalid URLs
          }
        }
      }
    }

    await editButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await editButton.click();

    await this.page.waitForSelector('#listing-title', { timeout: timeoutMs });
  }

  /**
   * Reads current SKU, Title, and Price from the listing edit form.
   * Extracts SKU from standard DOM inputs, text badges, data-sku attributes, or validated page URL.
   */
  async getListingDetails(): Promise<ListingFormData> {
    const titleInput = this.page.locator('#listing-title');
    const priceInput = this.page.locator('#listing-price');
    const skuInput = this.page.locator('#listing-sku, input[name="sku"], [data-testid="listing-sku"]');
    const displaySku = this.page.locator('#display-sku, .sku-badge, [data-testid="display-sku"]');

    let sku: string | undefined;
    if ((await skuInput.count()) > 0) {
      const val = (await skuInput.first().inputValue()).trim();
      if (val) sku = val;
    }
    if (!sku && (await displaySku.count()) > 0) {
      const val = (await displaySku.first().textContent() || '').trim();
      if (val) sku = val;
    }

    // Additional DOM fallback: element with data-sku
    if (!sku) {
      const dataSkuEl = this.page.locator('[data-sku]');
      if ((await dataSkuEl.count()) > 0) {
        const val = await dataSkuEl.first().getAttribute('data-sku');
        if (val) sku = val.trim();
      }
    }

    // Fallback: extract SKU from current page URL query parameters (e.g. /edit?sku=...)
    if (!sku) {
      try {
        const currentUrl = new URL(this.page.url());
        const paramSku = currentUrl.searchParams.get('sku');
        if (paramSku) {
          sku = decodeURIComponent(paramSku).trim();
        }
      } catch {
        // ignore invalid URL
      }
    }

    const title = (await titleInput.inputValue()).trim();
    const priceRaw = (await priceInput.inputValue()).trim();
    const price = parseFloat(priceRaw) || 0;

    return { sku, title, price };
  }

  /**
   * Fills updated values into the listing edit form.
   */
  async fillListing(patch: { title?: string; price?: number }): Promise<void> {
    if (patch.title != null) {
      const titleInput = this.page.locator('#listing-title');
      await titleInput.fill('');
      await titleInput.fill(patch.title);
    }
    if (patch.price != null) {
      const priceInput = this.page.locator('#listing-price');
      await priceInput.fill('');
      await priceInput.fill(patch.price.toFixed(2));
    }
  }

  /**
   * Clicks 'Save and finish' and waits for confirmation alert or detects save error.
   */
  async saveAndWaitForConfirmation(timeoutMs = 10000): Promise<void> {
    const saveButton = this.page.locator('#btn-save');
    await saveButton.click();

    const statusAlert = this.page.locator('#save-status.alert-success, #save-status.alert-error');
    await statusAlert.waitFor({ state: 'visible', timeout: timeoutMs });

    const isError = await this.page.locator('#save-status.alert-error').isVisible();
    if (isError) {
      const errText = await this.page.locator('#save-status.alert-error').textContent();
      throw new Error(`SAVE_FAILED: ${errText || 'Seller Central save rejected'}`);
    }
  }

  /**
   * Reloads the page and reads back persisted form values.
   */
  async reloadAndVerify(): Promise<ListingFormData> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.page.waitForSelector('#listing-title');
    return this.getListingDetails();
  }
}
