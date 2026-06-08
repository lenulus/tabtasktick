/**
 * Seeding helpers for store screenshots.
 *
 * IndexedDB (collections/folders/tabs/tasks) is written from a real extension
 * page via dynamic import() of the services — safe on a normal page, NEVER in
 * the service worker. Rules go through the background message handler so the
 * SW in-memory state stays in sync.
 *
 * All page.evaluate callbacks are self-contained (they cannot close over
 * Node-side imports), so content is passed as a plain serializable argument.
 */

/**
 * Clears all IndexedDB data and seeds the collection/folder/tabs/tasks for one
 * locale's content set. Must be called on an extension page (test-page.html).
 *
 * @param {import('@playwright/test').Page} seedPage
 * @param {object} content  one locale's entry from fixtures.CONTENT
 */
export async function seedIndexedDB(seedPage, content) {
  return seedPage.evaluate(async (data) => {
    const { clearAllData, withTransaction, putInStore } = await import('./services/utils/db.js');
    await clearAllData();

    const CollectionService = await import('./services/execution/CollectionService.js');
    const FolderService = await import('./services/execution/FolderService.js');
    const TabService = await import('./services/execution/TabService.js');
    const TaskService = await import('./services/execution/TaskService.js');

    // Collection
    const collection = await CollectionService.createCollection({
      name: data.collection.name,
      description: data.collection.description,
      icon: data.collection.icon,
      color: data.collection.color,
      tags: data.collection.tags || [],
    });

    // The collection-details modal formats `collection.createdAt` (top-level),
    // but createCollection only stores it under `metadata.createdAt` — so the
    // modal shows "Created: Unknown". Mirror the timestamp to the top-level
    // field the modal reads. This is a seed-side data fix (no product change):
    // we just add the field the UI looks for to the stored record.
    collection.createdAt = collection.metadata.createdAt;
    await withTransaction('collections', 'readwrite', (tx) =>
      putInStore(tx.objectStore('collections'), collection)
    );

    // Folder
    const folder = await FolderService.createFolder({
      collectionId: collection.id,
      name: data.folder.name,
      color: data.folder.color,
      position: 0,
      collapsed: false,
    });

    // Tabs (with notes). collectionId is REQUIRED.
    const tabIds = [];
    for (let i = 0; i < data.tabs.length; i++) {
      const t = data.tabs[i];
      const tab = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder.id,
        url: t.url,
        title: t.title,
        position: i,
        note: t.note,
      });
      tabIds.push(tab.id);
    }

    // Tasks across all four Kanban statuses.
    const taskIds = [];
    for (const tk of data.tasks) {
      const task = await TaskService.createTask({
        summary: tk.summary,
        status: tk.status,
        priority: tk.priority,
        notes: tk.notes,
        collectionId: collection.id,
      });
      taskIds.push(task.id);
    }

    return {
      collectionId: collection.id,
      folderId: folder.id,
      tabCount: tabIds.length,
      taskCount: taskIds.length,
    };
  }, content);
}

/**
 * Seeds one auto-grouping rule via the background message handler (keeps the
 * SW in-memory rules state in sync — a raw storage.local.set would desync).
 *
 * @param {import('@playwright/test').Page} seedPage
 * @param {object} ruleContent  { name, description }
 */
export async function seedRule(seedPage, ruleContent) {
  return seedPage.evaluate(async (rc) => {
    // Shape mirrors what the dashboard rules view renders (rules.js sample_3):
    // when.all[] items are {subject, operator, value}; then[] items are
    // {type, group_by}. The engine-DSL {gte:[...]}/{action:...} shape used by
    // test-mode rule-builder is NOT parsed by the dashboard card.
    const rule = {
      name: rc.name,
      description: rc.description,
      enabled: true,
      when: { all: [{ subject: 'domainCount', operator: 'gte', value: 3 }] },
      then: [{ type: 'group', group_by: 'domain' }],
      trigger: { type: 'immediate' },
      priority: 1,
    };
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: 'addRule', rule }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }, ruleContent);
}

/**
 * Opens `count` lightweight real tabs via data: URLs, driven from the service
 * worker so they are real browser tabs counted by chrome.tabs.query.
 *
 * Returns the new total tab count.
 *
 * @param {import('@playwright/test').Worker} serviceWorker
 * @param {number} count  how many data: tabs to create
 */
export async function openDataTabs(serviceWorker, count) {
  return serviceWorker.evaluate(async (n) => {
    const titles = [
      'Docs', 'Inbox', 'Calendar', 'Jira', 'Slack', 'GitHub', 'Figma',
      'Notion', 'Drive', 'Analytics', 'Sentry', 'Linear', 'Confluence',
      'Stack Overflow', 'MDN', 'Pull Request', 'Design Review', 'Roadmap',
    ];
    for (let i = 0; i < n; i++) {
      const title = titles[i % titles.length] + ' ' + (Math.floor(i / titles.length) + 1);
      const url = 'data:text/html,' + encodeURIComponent(
        `<title>${title}</title><body style="font-family:sans-serif;padding:2rem;color:#444">${title}</body>`
      );
      await chrome.tabs.create({ url, active: false });
    }
    const all = await chrome.tabs.query({});
    return all.length;
  }, count);
}

/**
 * Opens `count` tabs across a rotating set of well-known https domains with
 * varied paths, so the Overview's "Top Domains" donut shows believable real
 * domain names (extractDomain reads tab.url directly from chrome.tabs.query —
 * no page load needed). Tabs are created fire-and-forget: chrome.tabs.create
 * resolves on tab *creation* (the URL/hostname is known immediately), not on
 * page load, so pages never need to finish loading for the stat to be correct.
 *
 * Returns the new total tab count.
 *
 * @param {import('@playwright/test').Worker} serviceWorker
 * @param {number} count  how many real-domain tabs to create
 */
export async function openRealTabs(serviceWorker, count) {
  return serviceWorker.evaluate(async (n) => {
    // ~12 well-known domains with varied paths. Rotating across them gives the
    // Top Domains donut a realistic spread of real hostnames.
    const urls = [
      'https://github.com/acme/launch-site/pull/482',
      'https://stackoverflow.com/questions/12345678/async-await-ordering',
      'https://www.figma.com/file/abc123/Launch-Hero-Mockups',
      'https://www.notion.so/Press-Kit-and-Messaging-9f2',
      'https://linear.app/acme/issue/ENG-204/onboarding-qa',
      'https://www.google.com/search?q=mixpanel+funnel+setup',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.reddit.com/r/programming/comments/abc/launch',
      'https://docs.google.com/document/d/launch-checklist/edit',
      'https://news.ycombinator.com/item?id=39876543',
      'https://en.wikipedia.org/wiki/Product_launch',
      'https://www.amazon.com/dp/B09XYZ1234',
    ];
    const paths = ['', '/', '#section', '?ref=ttt', '/page/2', '#top'];
    for (let i = 0; i < n; i++) {
      const base = urls[i % urls.length];
      const suffix = paths[Math.floor(i / urls.length) % paths.length];
      const url = base + (suffix && !base.includes(suffix) ? suffix : '');
      // Fire-and-forget: do not await page load. create() resolves on creation;
      // we still await it so the subsequent count query is deterministic.
      await chrome.tabs.create({ url, active: false });
    }
    return (await chrome.tabs.query({})).length;
  }, count);
}

/**
 * Ensures the total open tab count equals `target` by creating just enough
 * real-domain tabs to reach it (the overview stat counts EVERY open tab,
 * including the dashboard itself). Creates the difference; never overshoots.
 *
 * Tops up with `openRealTabs` (not `openDataTabs`) so the Top Domains donut
 * shows real hostnames. The few titled data: tabs from shot #4 persist but,
 * with ~190 real tabs across 12 domains, rank well below the top-5 donut.
 *
 * @param {import('@playwright/test').Worker} serviceWorker
 * @param {number} target  desired chrome.tabs.query({}) length
 */
export async function ensureTabCount(serviceWorker, target) {
  const current = await serviceWorker.evaluate(async () => {
    const all = await chrome.tabs.query({});
    return all.length;
  });
  if (current < target) {
    await openRealTabs(serviceWorker, target - current);
  }
  return serviceWorker.evaluate(async () => (await chrome.tabs.query({})).length);
}
