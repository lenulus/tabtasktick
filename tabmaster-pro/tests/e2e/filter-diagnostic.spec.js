import { test, expect } from './fixtures/extension.js';

test('DIAGNOSTIC: Check filter system state', async ({ page, extensionId }) => {
  // Create test collection
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Create collections with isActive property
  await page.evaluate(async () => {
    const dbName = 'TabTaskTickDB';
    const request = indexedDB.open(dbName);
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(['collections'], 'readwrite');
        const store = tx.objectStore('collections');

        store.add({
          id: 'test-active',
          name: 'Active Collection',
          isActive: true,
          windowId: 1,
          tags: ['work'],
          createdAt: Date.now(),
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        store.add({
          id: 'test-saved',
          name: 'Saved Collection',
          isActive: false,
          windowId: null,
          tags: ['personal'],
          createdAt: Date.now(),
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        tx.oncomplete = () => resolve();
      };
    });
  });

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  console.log('=== STEP 1: Check initial state ===');
  const initialCount = await page.locator('.collection-card').count();
  console.log(`Initial collections visible: ${initialCount}`);

  console.log('\n=== STEP 2: Toggle filters panel ===');
  await page.click('#toggle-filters-btn');
  await page.waitForTimeout(500);

  const panelHidden = await page.locator('#filters-panel').getAttribute('class');
  console.log(`Filters panel classes: ${panelHidden}`);

  const containerHidden = await page.locator('#collections-filters').getAttribute('class');
  console.log(`Collections filters classes: ${containerHidden}`);

  console.log('\n=== STEP 3: Check filter buttons exist ===');
  const allBtn = page.locator('[data-filter="state"][data-value="all"]');
  const activeBtn = page.locator('[data-filter="state"][data-value="active"]');
  const savedBtn = page.locator('[data-filter="state"][data-value="saved"]');

  console.log(`All button visible: ${await allBtn.isVisible()}`);
  console.log(`Active button visible: ${await activeBtn.isVisible()}`);
  console.log(`Saved button visible: ${await savedBtn.isVisible()}`);

  console.log('\n=== STEP 4: Click Active filter ===');
  await activeBtn.click();
  await page.waitForTimeout(500);

  const afterFilterCount = await page.locator('.collection-card').count();
  console.log(`Collections after Active filter: ${afterFilterCount}`);

  console.log('\n=== STEP 5: Check what panel.js sees ===');
  const panelState = await page.evaluate(() => {
    const controller = window.sidePanelController;
    return {
      hasController: !!controller,
      hasSearchFilter: !!controller?.searchFilter,
      collectionsData: controller?.collectionsData?.length || 0,
      currentView: controller?.currentView,
      filtersVisible: controller?.filtersVisible,
      filters: controller?.searchFilter?.getCollectionsFilters?.()
    };
  });
  console.log('Panel state:', JSON.stringify(panelState, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'filter-diagnostic.png' });
});
