import type { Page } from 'playwright';

export interface ListingFormData {
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
   */
  async searchAndOpenEdit(sku: string, timeoutMs = 15000): Promise<void> {
    const searchInput = this.page.locator('#search-input');
    await searchInput.fill(sku);

    const searchButton = this.page.locator('#search-button');
    await searchButton.click();

    const editButton = this.page.locator(`#edit-${sku}`);
    await editButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await editButton.click();

    await this.page.waitForSelector('#listing-title', { timeout: timeoutMs });
  }

  /**
   * Reads current Title and Price from the listing edit form.
   */
  async getListingDetails(): Promise<ListingFormData> {
    const titleInput = this.page.locator('#listing-title');
    const priceInput = this.page.locator('#listing-price');

    const title = (await titleInput.inputValue()).trim();
    const priceRaw = (await priceInput.inputValue()).trim();
    const price = parseFloat(priceRaw) || 0;

    return { title, price };
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
