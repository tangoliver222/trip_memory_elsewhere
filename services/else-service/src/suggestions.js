/**
 * 建议问题：确定性生成（不调模型，总架构 §18.1 成本纪律）。
 * 数据驱动的槽位来自 fixtures 真实对象，换数据源后自动跟随。
 */
import { getWorldData } from './datasource.js';

export function suggestionsFor(scope = {}) {
  const data = getWorldData();
  const topPlace = [...data.places].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))[0];
  const busyScene = [...data.scenes].sort((a, b) => b.fragmentIds.length - a.fragmentIds.length)[0];

  const bank = {
    world: [
      '我的世界里有几座城市，各有多少碎片？',
      '最近一次入库给世界带来了什么变化？',
      '现在有哪些内容需要我判断？',
    ],
    city: [
      `我去过几次 ${topPlace.name}？`,
      `${busyScene.label}是怎么被确认的？`,
      '这段旅程里哪些碎片还没有确定地点？',
    ],
    fragments: [
      '哪些碎片还没有安放到地点？',
      `和 ${topPlace.name} 相关的碎片有哪些？`,
      '有哪些跨媒介的连接？',
    ],
    fragment: [
      '这张碎片属于哪一次到访？',
      '它和哪些碎片建立了连接？',
      '它的时间和地点来源可靠吗？',
    ],
    scene: ['这次事件有哪些原件支持？', '它的前后发生了什么？'],
    place: ['我在这里出现过几次，间隔多久？', '这里有哪些媒介的原件？'],
    connection: ['这条连接的证据够吗？', '拒绝这条连接会影响什么？'],
    discovery: ['为什么会显影这条发现？', '支撑证据里还有什么缺口？', '我可以怎么命名它？'],
    discover: ['最近有什么值得重新看的发现？', '有哪些发现还未决？'],
    inbox: ['这两张碎片为什么被认为相关？', '还有哪些内容正在整理？'],
    receipt: ['这批碎片进入了哪些地点？', '这批里有哪些需要我判断？'],
  };
  return bank[scope.type] || bank.world;
}
