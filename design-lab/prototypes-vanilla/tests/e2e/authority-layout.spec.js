import { test, expect } from '@playwright/test';

const routes = [
  ['capsule', '/#/world/city/bangkok/capsule'],
  ['time', '/#/world/city/bangkok/explore?view=time'],
  ['place', '/#/world/city/bangkok/explore?view=place'],
  ['connection', '/#/world/city/bangkok/explore?view=connection'],
  ['scene-detail', '/#/world/scene/scene-river-evening'],
  ['place-detail', '/#/world/place/place-common-grounds'],
  ['connection-detail', '/#/world/connection/rel-river-ticket-photo'],
];

async function waitForStable(page) {
  await page.waitForFunction(() => window.__ELSEWHERE_VISUAL_READY__ === true);
  await page.waitForFunction(() => Boolean(window.__ELSEWHERE_DEBUG__?.snapshot));
}

for (const [name, route] of routes) {
  test(`${name} keeps its authority layout inside the mobile canvas`, async ({ page }, testInfo) => {
    await page.goto(route);
    await waitForStable(page);
    const result = await page.evaluate(() => {
      const layer = document.querySelector('#page-content-layer');
      const main = document.querySelector('main');
      const viewportWidth = document.querySelector('.app-viewport').clientWidth;
      const boxes = [...document.querySelectorAll('h1, h2, .primary-action, .text-action, [data-authority-evidence], .capsule-spread')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== 'none' && box.width > 0 && box.height > 0;
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.className, left: box.left, right: box.right };
        });
      return {
        layerOverflow: layer.scrollWidth - layer.clientWidth,
        mainWidth: main.getBoundingClientRect().width,
        viewportWidth,
        clipped: boxes.filter(({ left, right }) => left < -1 || right > viewportWidth + 1),
        authorityHeading: Number.parseFloat(getComputedStyle(document.querySelector('.authority-header h1') || document.querySelector('.explore-header h1') || document.querySelector('.capsule-cover h1')).fontSize),
      };
    });
    expect(result.layerOverflow).toBeLessThanOrEqual(1);
    expect(result.mainWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
    expect(result.clipped).toEqual([]);
    expect(result.authorityHeading).toBeLessThanOrEqual(name === 'capsule' ? 72 : 48);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false });
  });
}

test('adversarial seven-node explore layouts place every data node with generated coordinates', async ({ page }) => {
  await page.goto('/?__scenario=dense#/world');
  await waitForStable(page);
  await page.evaluate(async () => {
    const [{ createDevScenarioSnapshot }, { hydrateLiveCollections }] = await Promise.all([
      import('/src/data/dev-scenarios.js'),
      import('/src/data/live-hydrator.js'),
    ]);
    const snapshot = createDevScenarioSnapshot('dense');
    const city = snapshot.cities[0];
    const members = snapshot.fragments.filter(({ cityId }) => city.id);
    const places = Array.from({ length: 7 }, (_, index) => {
      const assigned = members.filter((_, fragmentIndex) => fragmentIndex % 7 === index);
      const id = `place-stress-${index}`;
      for (const fragment of assigned) {
        fragment.placeId = id;
        fragment.placeName = `Bangkok Stress ${index + 1}`;
      }
      return {
        id,
        name: `Bangkok Stress ${index + 1}`,
        area: 'Bangkok',
        lat: city.lat + index * 0.003,
        lng: city.lng + ((index * 3) % 7) * 0.002,
        cityId: city.id,
        fragmentCount: assigned.length,
        sourceIds: assigned.map(({ id: fragmentId }) => fragmentId),
      };
    });
    snapshot.places = [...places, ...snapshot.places.filter(({ cityId }) => cityId !== city.id)];
    snapshot.visits = [
      ...places.map((place, index) => ({
        id: `visit-stress-${index}`,
        placeId: place.id,
        placeName: place.name,
        startedAt: members[index]?.capturedAt,
        endedAt: members[index + 7]?.capturedAt || members[index]?.capturedAt,
        fragmentCount: place.sourceIds.length,
        sourceIds: place.sourceIds,
      })),
      ...snapshot.visits.filter(({ sourceIds }) => !sourceIds.some((id) => members.some((fragment) => fragment.id === id))),
    ];
    snapshot.connections = [
      ...places.map((place, index) => ({
        id: `connection-stress-${index}`,
        type: index % 2 ? 'same_visit' : 'repeated_place',
        placeId: place.id,
        sourceIds: place.sourceIds.slice(0, 2),
      })),
      ...snapshot.connections.filter(({ sourceIds }) => !sourceIds.some((id) => members.some((fragment) => fragment.id === id))),
    ];
    city.placeCount = places.length;
    hydrateLiveCollections(snapshot);
  });

  for (const view of ['time', 'place', 'connection']) {
    await page.evaluate((nextView) => { location.hash = `#/world/city/bangkok/explore?view=${nextView}`; }, view);
    await page.waitForSelector(`[data-page-id="world-explore"].explore-page--${view}`);
    await waitForStable(page);
    const nodes = page.locator({ time: '.time-moment', place: '.map-place', connection: '.relation-node' }[view]);
    expect(await nodes.count()).toBe(7);
    const styles = await nodes.evaluateAll((elements) => elements.map((element) => element.getAttribute('style') || ''));
    expect(styles.every((style) => style.includes(`--${view === 'time' ? 'moment' : view === 'place' ? 'place' : 'relation'}-x:`))).toBe(true);
    expect(new Set(styles).size).toBe(7);
    const particleScene = await page.evaluate(() => window.__ELSEWHERE_DEBUG__.snapshot());
    expect(particleScene.anchorCount).toBe(7);
  }
});
