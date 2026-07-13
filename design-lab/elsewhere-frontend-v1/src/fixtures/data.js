/**
 * Elsewhere Unified Mock Data Fixtures
 * Matches the canonical structures of PRD v3.0 and visual reference guides.
 */

export const cities = [
  {
    id: "bangkok",
    name: "Bangkok",
    localizedName: "曼谷",
    coordinates: { lat: 13.7563, lng: 100.5018 },
    period: "2024 秋",
    placeCount: 11,
    fragmentCount: 63,
    status: ["current", "has_new_discovery"],
    representativeAsset: "../../assets/bangkok-photo-01-ari-morning.jpg",
    narrative: "离开曼谷以后，你最常想起的是河上的风。"
  },
  {
    id: "chiang-mai",
    name: "Chiang Mai",
    localizedName: "清迈",
    coordinates: { lat: 18.7883, lng: 98.9853 },
    period: "2024 夏",
    placeCount: 7,
    fragmentCount: 28,
    status: ["formed"],
    representativeAsset: null,
    requiredAsset: "chiang-mai-photo-01.webp",
    narrative: "雨季里的轻盈停留。"
  },
  {
    id: "tokyo",
    name: "Tokyo",
    localizedName: "东京",
    coordinates: { lat: 35.6762, lng: 139.6503 },
    period: "2023 冬",
    placeCount: 14,
    fragmentCount: 81,
    status: ["formed"],
    representativeAsset: null,
    requiredAsset: "tokyo-photo-01.webp",
    narrative: "走得很远，也走得很慢。"
  }
];

export const fragments = [
  {
    id: "frag-ari-1012-photo",
    type: "photo",
    capturedAt: "2024-10-12T08:42:00+07:00",
    asset: "../../assets/bangkok-photo-04-ari-coffee.png",
    placeCandidate: "Common Grounds · Ari",
    status: "confirmed",
    displayRole: "primary-original",
    ocrText: "ARIDY COFFEE - ARI DISTRICT - 12 OCT - MERCH ID 8872"
  },
  {
    id: "frag-ari-1016-receipt",
    type: "receipt",
    capturedAt: "2024-10-16T08:47:00+07:00",
    asset: null,
    requiredAsset: "receipt-01.webp",
    evidencePreview: "COMMON GROUNDS · 16 OCT · 124 THB",
    placeCandidate: "Common Grounds · Ari",
    status: "confirmed",
    displayRole: "time-and-place-anchor",
    ocrText: "COMMON GROUNDS ARI\n16 OCT 2024 08:47\n1 ICE LATTE - 124.00 THB\nTHANK YOU"
  },
  {
    id: "frag-ari-1016-photo",
    type: "photo",
    capturedAt: "2024-10-16T08:56:00+07:00",
    asset: "../../assets/bangkok-photo-01-ari-morning.jpg",
    placeCandidate: "Common Grounds · Ari",
    status: "confirmed",
    displayRole: "supporting-original",
    ocrText: "EXIF: F/1.8, 1/120s, ISO 80, iPhone 15 Pro"
  },
  {
    id: "frag-ari-1019-visit",
    type: "receipt",
    capturedAt: "2024-10-19T09:03:00+07:00",
    asset: null,
    requiredAsset: "receipt-02.webp",
    evidencePreview: "COMMON GROUNDS · 19 OCT · 09:03",
    placeCandidate: "Common Grounds · Ari",
    status: "confirmed",
    displayRole: "time-and-place-anchor",
    ocrText: "COMMON GROUNDS ARI\n19 OCT 2024 09:03\n1 FILTER COFFEE - 150.00 THB\nCASH SALE"
  },
  {
    id: "frag-river-1018-ticket",
    type: "ticket",
    capturedAt: "2024-10-18T17:42:00+07:00",
    asset: null,
    requiredAsset: "ferry-ticket.webp",
    evidencePreview: "CHAO PHRAYA FERRY · 18 OCT · 17:42",
    placeCandidate: "Chao Phraya Ferry · Riverside",
    status: "confirmed",
    displayRole: "time-and-place-anchor",
    ocrText: "CHAO PHRAYA RIVER CROSSING\nTICKET NO: 44091\nDATE: 18-10-24 17:42\nFARE: 5.00 THB"
  },
  {
    id: "frag-river-1018-photo",
    type: "photo",
    capturedAt: "2024-10-18T17:59:00+07:00",
    asset: "../../assets/bangkok-photo-02-riverside.jpg",
    placeCandidate: "Chao Phraya Ferry · Riverside",
    status: "confirmed",
    displayRole: "primary-original",
    ocrText: "EXIF: F/2.4, 1/60s, ISO 400,傍晚渡轮"
  },
  {
    id: "frag-old-town-1017-photo",
    type: "photo",
    capturedAt: "2024-10-17T15:31:00+07:00",
    asset: "../../assets/bangkok-photo-03-old-town.jpg",
    placeCandidate: "Old Town Walk",
    locationConfidence: "low",
    status: "unresolved",
    displayRole: "unplaced-edge",
    ocrText: "EXIF: No GPS. 15:31 老街红巴士"
  },
  {
    id: "frag-old-town-1017-menu",
    type: "menu",
    capturedAt: "2024-10-17T16:08:00+07:00",
    asset: null,
    requiredAsset: "menu.webp",
    evidencePreview: "外文菜单 · 无 GPS · 与街景时间接近",
    placeCandidate: "Old Town Walk",
    status: "unresolved",
    displayRole: "unplaced-edge",
    ocrText: "MENU: PAD THAI - TOM YUM GOONG - MANGO STICKY RICE"
  },
  {
    id: "frag-river-1022-map",
    type: "screenshot",
    capturedAt: "2024-10-22T18:04:00+07:00",
    asset: null,
    requiredAsset: "map-screenshot.webp",
    evidencePreview: "ferry · 码头附近 · 具体地点待确认",
    placeCandidate: "Chao Phraya Ferry · Riverside",
    status: "unresolved",
    displayRole: "unplaced-edge",
    ocrText: "SCREENSHOT: GOOGLE MAPS SHOWING WATER WAY NEAR WHARF 18:04"
  },
  {
    id: "frag-chiang-mai-101",
    type: "photo",
    capturedAt: "2024-08-12T09:24:00+07:00",
    asset: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60",
    placeCandidate: "Graph Cafe · Chiang Mai",
    status: "confirmed",
    displayRole: "primary-original",
    ocrText: "EXIF: F/1.8, 1/150s, ISO 64, Chiang Mai"
  },
  {
    id: "frag-chiang-mai-102",
    type: "receipt",
    capturedAt: "2024-08-12T09:15:00+07:00",
    asset: null,
    requiredAsset: "receipt-chiangmai.webp",
    evidencePreview: "GRAPH CAFE · 12 AUG · 95 THB",
    placeCandidate: "Graph Cafe · Chiang Mai",
    status: "confirmed",
    displayRole: "time-and-place-anchor",
    ocrText: "GRAPH CAFE CO.\n12 AUG 2024 09:15\n1 ESPRESSO - 95.00 THB"
  },
  {
    id: "frag-chiang-mai-201",
    type: "photo",
    capturedAt: "2024-08-14T14:00:00+07:00",
    asset: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=500&auto=format&fit=crop&q=60",
    placeCandidate: "Wat Pha Lat · Suthep Hill",
    status: "confirmed",
    displayRole: "supporting-original",
    ocrText: "EXIF: Wat Pha Lat Forrest Temple"
  },
  {
    id: "frag-tokyo-101",
    type: "receipt",
    capturedAt: "2023-12-05T21:30:00+09:00",
    asset: null,
    requiredAsset: "receipt-tokyo.webp",
    evidencePreview: "BEN FIDDICH · 5 DEC · 4400 JPY",
    placeCandidate: "Bar Ben Fiddich · Shinjuku",
    status: "confirmed",
    displayRole: "time-and-place-anchor",
    ocrText: "BAR BEN FIDDICH SHINJUKU\n05 DEC 2023 21:30\n2 COCKTAILS - 4400 JPY"
  },
  {
    id: "frag-tokyo-102",
    type: "photo",
    capturedAt: "2023-12-05T21:42:00+09:00",
    asset: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60",
    placeCandidate: "Bar Ben Fiddich · Shinjuku",
    status: "confirmed",
    displayRole: "primary-original",
    ocrText: "EXIF: F/1.4, 1/40s, Shinjuku bar"
  },
  {
    id: "frag-tokyo-201",
    type: "photo",
    capturedAt: "2023-12-08T10:15:00+09:00",
    asset: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&auto=format&fit=crop&q=60",
    placeCandidate: "Daikanyama T-Site · Shibuya",
    status: "confirmed",
    displayRole: "primary-original",
    ocrText: "EXIF: Daikanyama Bookstore Morning"
  }
];

export const importBatches = [
  {
    id: "batch-bangkok-backfill",
    createdAt: "2024-10-23T10:00:00+07:00",
    itemCount: 28,
    types: { photo: 18, screenshot: 5, receipt: 3, ticket: 2 },
    journeyCandidate: "journey-bangkok-2024-autumn",
    result: { saved: 28, cities: 1, places: 4, connections: 2, needsReview: 2, duplicates: 0, failed: 0 },
    status: "completed"
  }
];

export const places = [
  {
    id: "place-common-grounds",
    name: "Common Grounds",
    area: "Ari · 咖啡馆",
    coordinates: { lat: 13.7791, lng: 100.5443 },
    visitCount: 3,
    dateRange: "12—19 OCT 2024",
    status: "confirmed",
    representativeAsset: "../../assets/bangkok-photo-01-ari-morning.jpg",
    fact: "三次确认到访均发生在上午 10:15 以前；其中两次由小票确认。"
  },
  {
    id: "place-chao-phraya-ferry",
    name: "Chao Phraya Ferry",
    area: "Riverside · 渡口",
    coordinates: { lat: 13.7331, lng: 100.5101 },
    visitCount: 3,
    fragmentCount: 5,
    dateRange: "14—22 OCT 2024",
    status: "supported",
    representativeAsset: "../../assets/bangkok-photo-02-riverside.jpg",
    fact: "已确认的河岸碎片均在 17:30 以后；10 月 22 日的截图仍待确认。"
  },
  {
    id: "place-old-town",
    name: "Old Town Walk",
    area: "Phra Nakhon · 街区",
    coordinates: { lat: 13.7567, lng: 100.4977 },
    visitCount: 1,
    fragmentCount: 3,
    dateRange: "17 OCT 2024",
    status: "unresolved",
    representativeAsset: "../../assets/bangkok-photo-03-old-town.jpg",
    fact: "街景与菜单在同一下午靠近，但缺少 GPS，地点仍是候选。"
  },
  {
    id: "place-khlong-toei-market",
    name: "Khlong Toei Market",
    area: "Khlong Toei · 市场",
    coordinates: { lat: 13.7182, lng: 100.5622 },
    visitCount: null,
    fragmentCount: 2,
    dateRange: "20 OCT 2024",
    status: "suggested",
    representativeAsset: null,
    requiredAsset: "market-photo-01.webp",
    fact: "两张照片可能属于一次绕路，等待用户确认。"
  },
  {
    id: "place-chiang-mai-graph",
    name: "Graph Cafe · Chiang Mai",
    area: "Chiang Mai · 咖啡馆",
    coordinates: { lat: 18.7889, lng: 98.9912 },
    visitCount: 2,
    dateRange: "12—15 AUG 2024",
    status: "confirmed",
    representativeAsset: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60",
    fact: "古城内著名的小众咖啡馆，以特调黑咖啡闻名，两次到访均对齐。"
  },
  {
    id: "place-chiang-mai-temple",
    name: "Wat Pha Lat · Suthep Hill",
    area: "Suthep Hill · 寺庙",
    coordinates: { lat: 18.7992, lng: 98.9325 },
    visitCount: 1,
    dateRange: "14 AUG 2024",
    status: "confirmed",
    representativeAsset: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=500&auto=format&fit=crop&q=60",
    fact: "隐藏在山林中的兰纳风格古寺，极为宁静，有两张原始照片关联支撑。"
  },
  {
    id: "place-tokyo-ben-fiddich",
    name: "Bar Ben Fiddich · Shinjuku",
    area: "Shinjuku · 酒吧",
    coordinates: { lat: 35.6905, lng: 139.6975 },
    visitCount: 1,
    dateRange: "05 DEC 2023",
    status: "confirmed",
    representativeAsset: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60",
    fact: "新宿高层楼宇内的无菜单药草酒吧，调酒师自种药草，一张纸质收据证实。"
  },
  {
    id: "place-tokyo-daikanyama",
    name: "Daikanyama T-Site · Shibuya",
    area: "Shibuya · 书店",
    coordinates: { lat: 35.6485, lng: 139.7003 },
    visitCount: 2,
    dateRange: "07—08 DEC 2023",
    status: "confirmed",
    representativeAsset: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&auto=format&fit=crop&q=60",
    fact: "被誉为最美书店的代官山茑屋书店，由 3 个影像证据支撑多次探访。"
  }
];

export const scenes = [
  {
    id: "scene-common-grounds-morning",
    date: "2024-10-12",
    label: "Ari 的第一个早晨",
    timeRange: "08:42—10:03",
    placeId: "place-common-grounds",
    fragmentIds: ["frag-ari-1012-photo", "frag-ari-1016-receipt", "frag-ari-1016-photo", "frag-ari-1019-visit"],
    status: "confirmed",
    primaryAsset: "../../assets/bangkok-photo-01-ari-morning.jpg",
    observation: "三份可确认的时间与地点证据在 Ari 相遇，拼凑出你坐在玻璃窗前看雨停的那个清晨。"
  },
  {
    id: "scene-river-evening",
    date: "2024-10-18",
    label: "河岸候船",
    timeRange: "17:42—18:26",
    placeId: "place-chao-phraya-ferry",
    fragmentIds: ["frag-river-1018-ticket", "frag-river-1018-photo"],
    status: "supported",
    primaryAsset: "../../assets/bangkok-photo-02-riverside.jpg",
    observation: "船票时间 17:42，河岸余晖照片 17:59，这 17 分钟的黑场，是你在河岸等候夜色合拢的过程。"
  },
  {
    id: "scene-old-town-walk",
    date: "2024-10-17",
    label: "还没有完整落点的步行",
    timeRange: "15:31—17:06",
    placeId: "place-old-town",
    fragmentIds: ["frag-old-town-1017-photo", "frag-old-town-1017-menu"],
    status: "unresolved",
    primaryAsset: "../../assets/bangkok-photo-03-old-town.jpg",
    observation: "老街的红色巴士与手写菜单在半小时内发生，但因照片丢失了 GPS 坐标，这段漫步依然漂浮在老城上方。"
  },
  {
    id: "scene-chiang-mai-graph",
    date: "2024-08-12",
    label: "古城清晨慢饮",
    timeRange: "09:15—10:30",
    placeId: "place-chiang-mai-graph",
    fragmentIds: ["frag-chiang-mai-101", "frag-chiang-mai-102"],
    status: "confirmed",
    primaryAsset: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60",
    observation: "咖啡香气伴随清晨的暖风，账单与照片相差不到十分钟，完美对齐了你在古城的第一杯特调。"
  },
  {
    id: "scene-chiang-mai-temple",
    date: "2024-08-14",
    label: "素贴山古刹探秘",
    timeRange: "14:00—15:30",
    placeId: "place-chiang-mai-temple",
    fragmentIds: ["frag-chiang-mai-201"],
    status: "confirmed",
    primaryAsset: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=500&auto=format&fit=crop&q=60",
    observation: "山林古刹中的雨棚、滴水和青苔。这些影像记录证实了你在这个潮湿而静谧的下午独自等雨的场景。"
  },
  {
    id: "scene-tokyo-ben-fiddich",
    date: "2023-12-05",
    label: "新宿微醺药草香",
    timeRange: "21:30—23:00",
    placeId: "place-tokyo-ben-fiddich",
    fragmentIds: ["frag-tokyo-101", "frag-tokyo-102"],
    status: "confirmed",
    primaryAsset: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60",
    observation: "新宿高架旁的暖色光影。收据上的下单时间与调酒师切开冰块的照片，重组了那杯带有泥煤与迷迭香余温的酒。"
  },
  {
    id: "scene-tokyo-daikanyama",
    date: "2023-12-08",
    label: "代官山书香冬日",
    timeRange: "10:15—12:00",
    placeId: "place-tokyo-daikanyama",
    fragmentIds: ["frag-tokyo-201"],
    status: "confirmed",
    primaryAsset: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&auto=format&fit=crop&q=60",
    observation: "光线穿过茑屋书店的玻璃幕墙，落在翻开的摄影集上。虽然只是单张照片，但清透的冬日晨光已被时间戳永久保留。"
  }
];

export const connections = [
  {
    id: "rel-ari-1016-same-visit",
    type: "same_visit",
    from: "frag-ari-1016-receipt",
    to: "frag-ari-1016-photo",
    status: "confirmed",
    evidence: ["merchant match: Common Grounds", "time distance: 9 minutes"],
    visualRule: "stable fine line; no moving particles"
  },
  {
    id: "rel-ari-repeat-mornings",
    type: "repeated_place",
    from: ["frag-ari-1012-photo", "frag-ari-1016-receipt", "frag-ari-1016-photo"],
    toEntity: "Common Grounds · Ari",
    status: "confirmed",
    evidence: ["three morning timestamps", "merchant and place confirmation"],
    visualRule: "three date nodes converge toward one place entity"
  },
  {
    id: "rel-river-ticket-photo",
    type: "same_visit",
    from: "frag-river-1018-ticket",
    to: "frag-river-1018-photo",
    status: "confirmed",
    evidence: ["time distance: 17 minutes", "ferry and riverside context"],
    visualRule: "stable line with ticket as time anchor and photo as primary original"
  },
  {
    id: "rel-river-1022-suggestion",
    type: "temporal_and_textual_near",
    from: "frag-river-1022-map",
    toEntity: "Chao Phraya Ferry · Riverside",
    status: "suggested",
    evidence: ["screenshot text: ferry", "near known ferry dates"],
    uncertainty: "cannot confirm the exact pier or visit",
    visualRule: "broken path; particles do not reach the destination"
  },
  {
    id: "rel-old-town-unplaced",
    type: "place_candidate",
    from: "frag-old-town-1017-photo",
    toEntity: "Old Town Walk",
    status: "unresolved",
    evidence: ["visual context only"],
    uncertainty: "GPS is absent",
    visualRule: "no completed relation; keep fragment on the field edge"
  },
  {
    id: "rel-chiang-mai-receipt-photo",
    type: "same_visit",
    from: "frag-chiang-mai-102",
    to: "frag-chiang-mai-101",
    status: "confirmed",
    evidence: ["time distance: 9 minutes", "Graph Cafe location alignment"],
    visualRule: "stable fine line; no moving particles"
  },
  {
    id: "rel-tokyo-bar-slip-photo",
    type: "same_visit",
    from: "frag-tokyo-101",
    to: "frag-tokyo-102",
    status: "confirmed",
    evidence: ["time distance: 12 minutes", "Bar Ben Fiddich context alignment"],
    visualRule: "stable fine line; no moving particles"
  }
];

export const discoveries = [
  {
    id: "disc-ari-mornings",
    type: "repeated_place",
    status: "new",
    title: "三个早晨都从 Ari 开始",
    timeRange: "12—19 OCT 2024",
    supportingFragments: ["frag-ari-1012-photo", "frag-ari-1016-receipt", "frag-ari-1016-photo"],
    sharedEntity: "Common Grounds · Ari",
    observation: "三份可确认的时间与地点证据在 Ari 相遇，提示你在这里找到了某种生活的重复频率。",
    uncertainty: null,
    primaryAction: "在地点中查看"
  },
  {
    id: "disc-river-evidence",
    type: "cross_media_visit",
    status: "supported",
    title: "票据和河岸照片靠近同一个傍晚",
    timeRange: "18 OCT 2024 · 17:42—17:59",
    supportingFragments: ["frag-river-1018-ticket", "frag-river-1018-photo"],
    sharedEntity: "Chao Phraya Ferry · Riverside",
    observation: "纸质船票的购票时刻与你拍下波光的相机时刻完美对齐，间隔仅 17 分钟，在黑夜前它们在水上交织。",
    uncertainty: null,
    primaryAction: "查看连接依据"
  },
  {
    id: "disc-river-open-thread",
    type: "open_thread",
    status: "unresolved",
    title: "一张交通截图仍在河边之外",
    timeRange: "22 OCT 2024",
    supportingFragments: ["frag-river-1022-map"],
    sharedEntity: "Chao Phraya Ferry · Riverside",
    observation: "你保存的地图路线显示了河道，时间也靠近几日前候船的夕阳。但没有小票或坐标，这个碎片只能停在关系网的岸边。",
    uncertainty: "需要用户确认具体码头或保留未安放。",
    primaryAction: "帮助确认"
  }
];

export const userNotes = [
  {
    id: "writing-city-reflection",
    type: "city_reflection",
    createdAt: "2024-10-22",
    text: "离开 Bangkok 以后，我最常想起的是河上的风。",
    related: ["journey-bangkok-2024-autumn"],
    status: "private"
  },
  {
    id: "writing-ari-name",
    type: "user_name",
    createdAt: "2024-10-19",
    text: "等雨停的早晨",
    related: ["place-common-grounds", "rel-ari-repeat-mornings"],
    status: "private"
  },
  {
    id: "writing-ari-scene-note",
    type: "scene_note",
    createdAt: "2024-10-16",
    text: "那天其实只是为了找一个能坐很久的位置，雨下得太大了，咖啡馆里的音乐很低。",
    related: ["scene-common-grounds-morning"],
    status: "private"
  },
  {
    id: "writing-future-letter",
    type: "future_letter",
    createdAt: null,
    text: "下次回来，不用急着把所有地方重新走一遍。就去那两处坐下，等等风，听听渡船。",
    related: ["journey-bangkok-2024-autumn"],
    status: "draft"
  }
];

export const settings = {
  sensitiveBlur: true,
  highAccuracyGPS: true,
  elseScope: "current",
  aiTone: "fact", // 'fact' | 'balanced' | 'poetic'
  backupEnabled: true,
  appLock: false,
  notifEnabled: true
};
