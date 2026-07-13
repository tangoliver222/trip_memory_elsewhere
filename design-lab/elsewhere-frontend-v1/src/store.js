/**
 * Elsewhere Global Reactive State Store
 */
import {
  cities,
  fragments,
  importBatches,
  places,
  scenes,
  connections,
  discoveries,
  userNotes,
  settings
} from "./fixtures/data.js";

class GlobalStore {
  constructor() {
    this.state = {
      // Mock databases
      cities: [...cities],
      fragments: [...fragments],
      importBatches: [...importBatches],
      places: [...places],
      scenes: [...scenes],
      connections: [...connections],
      discoveries: [...discoveries],
      userNotes: [...userNotes],
      settings: { ...settings },

      // Navigation & Routing State
      currentRoute: window.location.hash || "#/world",
      historyStack: [],

      // UI Active Entity States
      selectedCity: "bangkok",
      selectedFragment: null,
      selectedScene: "scene-common-grounds-morning",
      selectedPlace: "place-common-grounds",
      selectedConnection: "rel-river-ticket-photo",
      selectedDiscovery: "disc-ari-mornings",
      selectedWriting: "writing-city-reflection",

      // Overlays Open States
      overlays: {
        fragmentLens: false,
        originalViewer: false,
        elseSheet: false,
        filters: false,
        editMetadata: false,
        mergeSplit: false,
        conflict: false,
        deleteImpact: false,
        duplicate: false,
        sharePreview: false,
        permission: false
      },

      // Filter settings
      filterType: "all", // 'all' | 'photo' | 'receipt' | 'ticket' | 'unplaced'
      searchQuery: "",
      elseState: "idle", // 'idle' | 'quick-sheet' | 'answer' | 'uncertain' | 'source'
      elseAnswerText: "",
      elseQuery: "",
      elseAnswerSources: []
    };

    this.listeners = [];

    // Sync browser back/forward buttons with router state
    window.addEventListener("hashchange", () => {
      this.setRoute(window.location.hash);
    });
  }

  // State Management Actions
  setRoute(route) {
    if (!route || route === "") route = "#/world";
    
    // Add to history
    if (this.state.currentRoute !== route) {
      this.state.historyStack.push(this.state.currentRoute);
      this.state.currentRoute = route;
      this.notify();
    }
  }

  goBack() {
    const prev = this.state.historyStack.pop();
    if (prev) {
      window.location.hash = prev;
    } else {
      window.location.hash = "#/world";
    }
  }

  // Entities
  selectCity(id) {
    this.state.selectedCity = id;
    this.notify();
  }

  selectFragment(id) {
    this.state.selectedFragment = id;
    this.notify();
  }

  selectScene(id) {
    this.state.selectedScene = id;
    this.notify();
  }

  selectPlace(id) {
    this.state.selectedPlace = id;
    this.notify();
  }

  selectConnection(id) {
    this.state.selectedConnection = id;
    this.notify();
  }

  selectDiscovery(id) {
    this.state.selectedDiscovery = id;
    this.notify();
  }

  selectWriting(id) {
    this.state.selectedWriting = id;
    this.notify();
  }

  // Overlays
  setOverlay(overlayName, isOpen) {
    this.state.overlays[overlayName] = isOpen;
    this.notify();
  }

  closeAllOverlays() {
    for (let key in this.state.overlays) {
      this.state.overlays[key] = false;
    }
    this.state.elseState = "idle";
    this.notify();
  }

  // Else Orb Interactions
  triggerElse(state = "quick-sheet", query = "") {
    this.state.elseState = state;
    if (state === "quick-sheet") {
      this.state.overlays.elseSheet = true;
    } else if (state === "answer") {
      this.state.elseQuery = query;
      this.generateElseAnswer(query);
    }
    this.notify();
  }

  generateElseAnswer(query) {
    this.state.elseState = "answer";
    if (query.includes("Ari") || query.includes("早晨")) {
      this.state.elseAnswerText = "你在 Ari 区一共有 3 个早晨被记录在 Common Grounds 咖啡馆。通过 10 月 12 日、16 日及 19 日的账单，可确定你当时是在早晨 08:42 至 09:15 间到访。你在日记中写过，那是一系列「等雨停的早晨」。";
      this.state.elseAnswerSources = ["frag-ari-1012-photo", "frag-ari-1016-receipt", "frag-ari-1019-visit"];
    } else if (query.includes("渡船") || query.includes("河") || query.includes("船")) {
      this.state.elseAnswerText = "在 10 月 18 日傍晚 17:42，你购买了一张 5 THB 的昭披耶河渡轮船票。17 分钟后（17:59），在 Chao Phraya Ferry 渡口，你拍下了波光粼粼的河面照片。这段 17 分钟的间隔是你的候船痕迹。";
      this.state.elseAnswerSources = ["frag-river-1018-ticket", "frag-river-1018-photo"];
    } else {
      this.state.elseAnswerText = `关于 \"${query}\"，我在你的旅行中找到了一些可能的线索，但缺少确凿的时空小票等直接证据来闭合。你可以看看老城区那些没有 GPS 的未决碎片。`;
      this.state.elseAnswerSources = ["frag-old-town-1017-photo", "frag-old-town-1017-menu"];
      this.state.elseState = "uncertain";
    }
    this.notify();
  }

  // Settings
  updateSetting(key, val) {
    this.state.settings[key] = val;
    this.notify();
  }

  // Import Action Simulator
  addNote(text, relatedIds = []) {
    const newNote = {
      id: "writing-" + Date.now(),
      type: "scene_note",
      createdAt: new Date().toISOString().split("T")[0],
      text: text,
      related: relatedIds,
      status: "private"
    };
    this.state.userNotes.unshift(newNote);
    this.notify();
  }

  updateNote(id, text) {
    const note = this.state.userNotes.find(n => n.id === id);
    if (note) {
      note.text = text;
      this.notify();
    }
  }

  // Publish/Subscribe
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

export const store = new GlobalStore();
