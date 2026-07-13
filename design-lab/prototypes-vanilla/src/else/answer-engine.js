import { getElseContext, getFragmentContext } from '../selectors.js';

const sourceFromFragment = (fragmentId) => {
  const context = getFragmentContext(fragmentId);
  if (!context) return null;
  return {
    fragmentId,
    label: context.fragment.evidencePreview,
    kind: context.fragment.type,
    href: '#/world/fragments',
  };
};

const sources = (...ids) => ids.map(sourceFromFragment).filter(Boolean);

export function answerElse({ route = '#/world', question = '' }) {
  const scope = getElseContext(route, {});
  const normalized = question.trim().toLowerCase();

  if (normalized.includes('老城区') || normalized.includes('菜单') || normalized.includes('哪家店')) {
    return {
      state: 'uncertain',
      scope,
      answer: '我能把街景照片和菜单放在 10 月 17 日 15:31—16:08 的同一段时间里，但还不能确认具体店名。',
      sources: sources('frag-old-town-1017-photo', 'frag-old-town-1017-menu'),
      uncertainty: '两份来源都缺少可确认的 GPS，菜单原件也尚未加入当前演示包。',
      nextAction: { label: '去处理这个地点缺口', href: '#/world/inbox' },
    };
  }

  if (normalized.includes('冲突') || normalized.includes('不一致')) {
    return {
      state: 'conflict',
      scope,
      answer: '这两组来源给出了不同方向，目前不应把它们合并为同一次到访。',
      sources: sources('frag-river-1018-photo', 'frag-river-1022-map'),
      uncertainty: '交通截图只包含 ferry 文字，没有具体码头；河岸照片则有 10 月 18 日的拍摄时间。',
      nextAction: { label: '比较两组来源', href: '#/world/connection/rel-river-1022-suggestion' },
    };
  }

  if (scope.label === 'Chao Phraya Ferry' || normalized.includes('渡船') || normalized.includes('河岸') || normalized.includes('到访')) {
    return {
      state: 'found',
      scope,
      answer: '已确认的一次河岸到访发生在 10 月 18 日傍晚：17:42 的渡船票根与 17:59 的河岸照片相隔 17 分钟，并共同靠近 Chao Phraya Ferry。',
      sources: sources('frag-river-1018-ticket', 'frag-river-1018-photo', 'frag-river-1022-map'),
      uncertainty: '10 月 22 日的交通截图仍只有 ferry 文字，具体码头尚未确认，因此没有计入已确认到访。',
      nextAction: { label: '查看这条 17 分钟连接', href: '#/world/connection/rel-river-ticket-photo' },
    };
  }

  if (normalized.includes('ari') || normalized.includes('早晨') || normalized.includes('反复')) {
    return {
      state: 'found',
      scope,
      answer: '10 月 12 日、16 日与 19 日的来源都落在上午，并共同指向 Common Grounds。你把这段重复出现的地点命名为“等雨停的早晨”。',
      sources: sources('frag-ari-1012-photo', 'frag-ari-1016-receipt', 'frag-ari-1016-photo', 'frag-ari-1019-visit'),
      uncertainty: '这个结论只说明时间与地点重复出现，不代表三次到访的感受相同。',
      nextAction: { label: '看发现如何长出来', href: '#/discover/disc-ari-mornings' },
    };
  }

  return {
    state: 'uncertain',
    scope,
    answer: '我找到了一些靠近的问题线索，但当前问题还没有足够来源形成明确回答。',
    sources: sources('frag-old-town-1017-photo'),
    uncertainty: '缺少能把问题与具体时间、地点或原件稳定连接起来的来源。',
    nextAction: { label: '查看待安放碎片', href: '#/world/fragments' },
  };
}
