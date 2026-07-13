/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen w-full bg-[#030303] text-stone-200 flex flex-col justify-between p-8 md:p-16 relative font-sans overflow-x-hidden">
      {/* Ambient starry glow backdrop */}
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1.2px,transparent_1.2px)] [background-size:24px_24px] pointer-events-none"></div>
      
      {/* Top header */}
      <header className="flex justify-between items-center z-10 w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
          <span className="text-xs font-mono tracking-[0.2em] text-stone-200 uppercase">Elsewhere Project</span>
        </div>
        <div className="text-xs font-mono text-stone-500">
          STABLE ARCHIVE V3.0
        </div>
      </header>

      {/* Main Introduction panel */}
      <main className="my-auto max-w-3xl mx-auto space-y-8 z-10 py-12">
        <div className="space-y-4">
          <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">Interactive Design Laboratory</span>
          <h1 className="text-4xl md:text-5xl font-display font-medium tracking-tight text-white leading-tight">
            在深夜中逐渐显影的<br/>私人旅行档案馆。
          </h1>
          <p className="text-sm md:text-base leading-relaxed text-stone-400 max-w-[580px] font-sans">
            Elsewhere 是一座安静的空间。你的真实照片、小票、船票、截图和时间，在这里慢慢靠近并由时空痕迹客观对齐，形成可追溯的记忆纽带。
          </p>
        </div>

        {/* 4 Prototypes Quick Navigator */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <a href="/design-lab/?prototype=world-home" 
             className="p-5 rounded-2xl bg-stone-900/40 hover:bg-stone-900 border border-stone-850 hover:border-amber-500/20 transition-all flex flex-col justify-between group h-[140px]">
            <div>
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">Prototype 1</span>
              <h3 className="text-lg font-medium text-white group-hover:text-amber-500 transition-colors mt-1">1. World Home (世界主页)</h3>
              <p className="text-xs text-stone-400 mt-1">包含时空地球、焦点城市、异构碎片群落及底部安全区</p>
            </div>
            <span className="text-xs font-mono text-amber-500/80 mt-auto">进入实验室原型 →</span>
          </a>

          <a href="/design-lab/?prototype=city-fragment-field" 
             className="p-5 rounded-2xl bg-stone-900/40 hover:bg-stone-900 border border-stone-850 hover:border-amber-500/20 transition-all flex flex-col justify-between group h-[140px]">
            <div>
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">Prototype 2</span>
              <h3 className="text-lg font-medium text-white group-hover:text-amber-500 transition-colors mt-1">2. City Fragment Field (数据驱动碎片场)</h3>
              <p className="text-xs text-stone-400 mt-1">自适应屏幕、多层级节点粒子、真实 Tap 激活及 Lens 焦距调校</p>
            </div>
            <span className="text-xs font-mono text-amber-500/80 mt-auto">进入实验室原型 →</span>
          </a>

          <a href="/design-lab/?prototype=fragment-field" 
             className="p-5 rounded-2xl bg-stone-900/40 hover:bg-stone-900 border border-stone-850 hover:border-amber-500/20 transition-all flex flex-col justify-between group h-[140px]">
            <div>
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">Prototype 3</span>
              <h3 className="text-lg font-medium text-white group-hover:text-amber-500 transition-colors mt-1">3. Fragment Field (时空拓扑无界场)</h3>
              <p className="text-xs text-stone-400 mt-1">宏观多级时空收敛（城市群→时间地点群→粒子群），支持多维搜索聚焦</p>
            </div>
            <span className="text-xs font-mono text-amber-500/80 mt-auto">进入实验室原型 →</span>
          </a>

          <a href="/design-lab/?prototype=discovery-detail" 
             className="p-5 rounded-2xl bg-stone-900/40 hover:bg-stone-900 border border-stone-850 hover:border-amber-500/20 transition-all flex flex-col justify-between group h-[140px]">
            <div>
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">Prototype 4</span>
              <h3 className="text-lg font-medium text-white group-hover:text-amber-500 transition-colors mt-1">4. Discovery Clue (证据显影时空轨)</h3>
              <p className="text-xs text-stone-400 mt-1">完全重构：原件支撑关系连线、多级共同实体分析、深度时空笔谈</p>
            </div>
            <span className="text-xs font-mono text-amber-500/80 mt-auto">进入实验室原型 →</span>
          </a>
        </div>

        <div className="flex justify-center pt-4">
          <a href="/design-lab/" 
             className="px-8 py-4 rounded-xl bg-stone-200 text-stone-950 font-sans font-medium text-sm hover:bg-white transition-all shadow-xl block text-center">
            打开完整交互设计实验室
          </a>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="w-full max-w-5xl mx-auto z-10 border-t border-stone-900 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-stone-500 gap-4">
        <p>Elsewhere 交互框架已安全部署，符合 Vanilla 零污染约束与极速空间拓扑显影标准。</p>
        <div className="flex gap-4">
          <span>Phase 6.1-6.3 (Refined Prototypes & Visuals) ✅</span>
        </div>
      </footer>
    </div>
  );
}
