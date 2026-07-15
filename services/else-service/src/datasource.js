/**
 * 数据源封装。v1 只读复用前端 fixtures（与 demo 单一真相源）；
 * 换 Firestore 时只替换本文件，保持 getWorldData() 形状不变。
 */
import { data } from '../../../design-lab/prototypes-vanilla/src/fixtures/data.js';

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

const indexes = {
  fragments: byId(data.fragments),
  scenes: byId(data.scenes),
  places: byId(data.places),
  connections: byId(data.connections),
  discoveries: byId(data.discoveries),
  batches: byId(data.importBatches),
  citiesBySlug: Object.fromEntries(data.cities.map((city) => [city.slug, city])),
};

export function getWorldData() {
  return { ...data, indexes };
}
