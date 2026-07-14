# Elsewhere Visual Repair Document v5.0
**For Codex / implementation agent**  
**Status:** Mandatory visual reset and rebuild guidance  
**Priority:** Highest  
**Tech baseline:** **vanilla JS + Three.js + GSAP only**. Do **not** migrate to React / Motion / R3F / Rive in this round.  
**Inputs to use together:**  
1. current latest screenshot package `mobile-390(1).zip`  
2. the latest PRD / visual design markdowns  
3. the previously approved reference images provided by the user  
4. this document

---

# 0. Executive conclusion

The current version is **not** failing because of “minor polish issues”. It is failing because the implementation still does **not** embody the approved product language:

> **particle-driven memory space + flowing evidence + restrained black/white/silver atmosphere + real travel fragments as primary matter**

Instead, the current implementation still often reads as:

> **dark cards + decorative star background + ordinary mobile layout + occasional pretty typography**

That is **not acceptable**.

This round must be treated as a **visual reset with structural discipline**, not as a patch.

## Non-negotiable goal

The final product must immediately communicate all of the following:

- this is a **memory universe**, not a generic note app
- fragments are **alive inside a spatial system**
- particles are **structural**, not decorative
- pages are connected by **one continuous memory world**
- discoveries are formed by **evidence flowing into meaning**
- visual quality is a **core product requirement**, not optional polish

If the result does not feel immersive, controlled, and visually memorable, then the task is **not finished** even if every page technically exists.

---

# 1. Non-negotiable design law

## 1.1 Visual importance must be treated as first-class product logic

The agent must assume:

- visual atmosphere is **not decoration**
- particle behavior is **not enhancement**
- layout rhythm is **not secondary**
- transitions are **not optional**
- “it works functionally” is **not sufficient**

The product sells one core feeling:

> **You throw in messy fragments, and a calm intelligence slowly helps hidden structure emerge.**

Therefore all visual decisions must serve:
- accumulation
- ambiguity
- emergence
- connection
- slow clarity
- memory flow

If a page looks like a dashboard, settings app, standard gallery, or ordinary CMS, it has failed.

---

## 1.2 Approved aesthetic direction

### Must feel like:
- restrained
- immersive
- dark and quiet
- spatial
- high-end but not luxurious
- poetic but not dreamy/soft
- technological but not cyberpunk
- intelligent but not flashy
- alive but not noisy

### Must **not** feel like:
- gold luxury brand UI
- sci-fi poster
- random starfield wallpaper
- fintech dashboard
- productivity app
- scrapbook craft app
- glassmorphism showcase
- chaotic moodboard
- verbose editorial layout

---

## 1.3 Particle + flow are the main visual language

Particles are the primary visual metaphor of the system.

They must represent:
- unresolved memory matter
- incoming fragment batches
- city aggregation
- place density
- time recurrence
- relationship paths
- discovery formation
- Else attention/focus

Particles must **never** be just a repeating background sprinkled across all pages.

---

# 2. Global visual system reset

Before page-by-page polishing, the agent must reset the global system.

## 2.1 Color system

The visual system must stay in a **black / charcoal / silver / warm-gray** palette.

### Core palette
```css
--bg-0: #040506;
--bg-1: #07090b;
--bg-2: #0c1013;
--surface-0: rgba(10, 13, 15, 0.78);
--surface-1: rgba(17, 20, 24, 0.82);
--surface-2: rgba(26, 30, 34, 0.88);

--text-0: #eef0ed;
--text-1: #cdd2cf;
--text-2: #959b9f;
--text-3: #62696e;

--line-0: rgba(230, 234, 231, 0.12);
--line-1: rgba(230, 234, 231, 0.22);
--line-2: rgba(230, 234, 231, 0.42);

--particle-0: #f2f3ef;
--particle-1: #cdd2cf;
--particle-2: #848d92;

--warm-note: #b8ad9b;
--warm-note-soft: rgba(184, 173, 155, 0.20);
--danger-soft: #9c7b6d;
```

### Hard restrictions
- no gold as theme color
- no saturated blue glow as dominant style
- no rainbow shader colors
- no bright accent except very sparse warm-gray moments
- no heavy gradient cards unless they are extremely subtle

---

## 2.2 Typography

Typography must be expressive but disciplined.

### Rules
- serif is allowed only for major poetic or world-scale headings
- utility / metadata text must be clean sans
- giant titles must be limited to immersive pages only
- functional pages must not be posterized

### Size guide
| context | size |
|---|---:|
| immersive hero title | 42–54px |
| city/discovery title | 34–42px |
| functional title | 26–32px |
| body | 15–17px |
| metadata | 12–13px |
| labels | 11–12px |

### Forbidden
- blurry hero text in final renders
- overlong giant title blocks on inbox/settings/storage
- repeated oversized headings on every page

---

## 2.3 Surface system

The current implementation still overuses plain rectangular dark cards. This must change.

### Use three surface types only
1. **space surface**  
   no visible card boundary, content lives directly in space

2. **soft data slab**  
   subtle translucent panel, used for utility groupings

3. **artifact card**  
   real fragment container, should feel like an object, not a UI card

### Hard rule
If everything becomes a rectangular panel, the entire product immediately loses the memory-world quality.

---

## 2.4 Spacing rhythm

The product needs breathing rhythm.

### Required spacing behavior
- dense where evidence clusters
- open where memory is still unresolved
- medium rhythm in functional sections
- generous negative space around particles and major objects
- avoid equal card stacks

### Forbidden
- uniform vertical dashboard spacing
- repeated section blocks with identical heights
- cramped text under giant empty headers

---

# 3. Core technical rule

## 3.1 This round must stay on current stack

**Use current vanilla architecture.**

Allowed:
- vanilla JS
- Three.js
- GSAP
- CSS
- SVG
- canvas as needed

Not allowed in this round:
- React rewrite
- Motion
- React Three Fiber
- Rive migration
- heavy dependency expansion

The visual ambition stays high, but implementation must remain practical.

---

## 3.2 Single world model

All immersive pages must feel like they belong to the **same spatial memory engine**.

The Three.js layer must support target modes:

```js
globe
cityCluster
fragmentField
timeline
placeConstellation
connectionMap
discoveryFormation
inboxDecision
elseOrb
batchImport
```

Pages should **rearrange the same world language**, not invent a new one per screen.

---

## 3.3 Particle semantics are mandatory

Every particle mode must have meaning:

| mode | meaning |
|---|---|
| free drift | unresolved / ungrouped memory |
| clustered orbit | city or event grouping |
| stream | fragment flow / ingestion |
| anchored glow | confirmed node |
| split / broken stream | conflict / unresolved relation |
| converging cloud | discovery forming |
| orbiting orb | Else reading / thinking |

If a particle cluster has no meaning, delete it.

---

## 3.4 Flow / “心流” is not metaphor only, it is interaction logic

The visual flow must manifest through:
- slow regrouping
- cross-page continuity
- evidence entering frame before conclusion
- soft camera or layout transitions
- particle drift that suggests living memory
- transitions that feel like reconfiguration rather than hard navigation

---

# 4. Required agent workflow

The implementation agent must follow this workflow exactly.

## Step 1 — Understand before editing
Before writing any UI code:
- read PRD
- read visual design md
- read this v5.0 repair doc
- inspect current screenshots
- inspect provided reference images
- write a short internal summary:
  - what each page is for
  - what visual state it should achieve
  - what is currently wrong

Do **not** jump directly into code changes.

---

## Step 2 — Build the visual foundation first
Before touching individual page content:
1. reset color tokens
2. reset typography scales
3. remove generic starfield background
4. implement base particle renderer behaviors
5. implement shared page transition timing
6. add screenshot-ready state lock

Only after this foundation is stable may the agent begin page-specific implementation.

---

## Step 3 — Rebuild the five benchmark pages first
These must be treated as the visual truth set:

1. World Home
2. World City Home
3. World Fragments
4. Discover Detail
5. World Inbox

The rest of the system should expand from these five.

---

## Step 4 — For each benchmark page, do two internal critique passes
For each benchmark page:

### pass A
- implement
- screenshot
- compare to reference
- list top 5 mismatches

### pass B
- refine composition
- refine particle logic
- refine hierarchy
- refine motion/entry
- screenshot again

The agent must not stop at “good enough”.

---

## Step 5 — Expand to secondary pages
After benchmark pages are stable:
- onboarding set
- import flow
- capsule
- explore views
- discover home
- else
- fragment lens
- writing
- me/settings/storage/privacy/export

---

## Step 6 — Final visual audit
At the end:
- verify every immersive page has particle meaning
- verify every functional page is restrained and clear
- verify no page reverts to generic dashboard style
- verify screenshots are captured after animation settles
- verify bottom nav never blocks key content

---

# 5. The five benchmark pages — exact expectations

---

## 5.1 Benchmark A — World Home

### Purpose
This is the product’s cosmic front door.

It must simultaneously communicate:
- there are multiple travel worlds
- fragments are already alive in the system
- the user can enter a city
- the user can add fragments
- the user can resolve inbox items
- the user can open the total fragment universe

### Must include all five functional layers
1. **city list / globe**
2. **recommended recent city entry**
3. **fragment placement entry**
4. **fragment inbox entry**
5. **all fragments database + Else entry**

### Required composition
```text
top bar / brand / world stats
↓
large point-cloud globe
↓
recent city entry (Bangkok)
↓
world state summary
↓
3 utility entries:
- add fragments
- inbox
- all fragments
↓
bottom nav + Else
```

### Globe requirements
- point-cloud globe, not textured stock image
- continents legible
- Bangkok / Chiang Mai / Tokyo clearly marked
- drag rotation with inertia
- very slow auto drift when idle
- subtle particle halo, not giant fog
- globe integrates into page background, not isolated in a box

### Common mistakes to avoid
- globe taking entire page and hiding everything else
- decorative page title dominating above globe
- cards below feeling like generic dashboard tiles
- no sense of continuity with other pages

### Visual standard
The page should feel like:
> “I’m looking at a living memory planet, and below it are ways to enter, feed, and question that world.”

---

## 5.2 Benchmark B — World City Home

### Purpose
This is not a generic city overview. It is the **living memory cluster of one trip**.

### Must communicate
- this trip is built from multiple fragment types
- there are distinct memory clusters inside the city
- this city can lead into capsule / explore / full fragments
- the system is still actively forming and resolving things

### Required content blocks
1. city title + date range + key stats
2. city cluster hero space
3. 1–2 short factual observations
4. “enter capsule” / “explore this trip”
5. “needs confirmation” / “view all fragments in city”

### Hero space
The hero must contain **3 spatial sub-clusters**:
- Ari mornings
- riverside evenings
- old town walk

Each cluster should include mixed media:
- photo
- ticket / receipt / screenshot / map / menu
- subtle particle structure
- relational hints

### Must not become
- a static photo collage
- a hero banner with random scattered cards
- a page where all meaning is in text underneath

---

## 5.3 Benchmark C — World Fragments

### Purpose
This is the **total database memory field**.  
It is one of the most important pages in the whole product.

### It must feel like
- a navigable fragment universe
- multiple city clusters coexisting
- spatial grouping by city / event / place / recurrence
- searchable, explorable, askable data

### Required first impression
When entering this page the user must sense:
- Bangkok cluster
- Tokyo cluster
- Chiang Mai cluster
- unresolved loose fragments
- depth, not just a 2D board

### Required levels of structure
```text
L0 city cluster
L1 city sub-cluster
L2 scene / place / event group
L3 single fragment
```

### Required interactions
- search narrows and re-gathers clusters
- clicking fragment opens fragment lens
- Else can be asked within this scope
- filtering does not turn page into a plain list

### Must not be
- masonry grid
- standard archive page
- scattered overlapping cards with no spatial meaning
- empty pending placeholders

---

## 5.4 Benchmark D — Discover Detail

### Purpose
This page must show how a discovery emerges from evidence.

### Most important rule
**Do not reveal the conclusion first.**

### Required order
1. fragment evidence appears
2. time / place linkage becomes legible
3. common node forms
4. discovery title resolves
5. explanation and actions appear

### Required visual structure
- top hero zone with evidence and relation formation
- title only becomes fully strong after structure is visible
- below that:
  - why this surfaced
  - time evidence
  - place evidence
  - source fragments
  - actions

### Must not feel like
- blog article
- giant poster headline
- text-heavy feature page
- decorative network background

### Key test
If someone glances at the top 40% of the screen, they should understand:
> “These fragments are being connected into one finding.”

---

## 5.5 Benchmark E — World Inbox

### Purpose
This is a decision surface, not a conceptual poster.

### It must communicate
- two or more pieces of evidence need user judgment
- the system already has a hypothesis
- the user can confirm / reject / defer
- this action affects memory structure

### Required layout
- clear question
- side-by-side or structurally comparable evidence
- concise evidence bullets
- action buttons fixed and visible
- relation line between compared artifacts

### Must not do
- giant poetic title consuming screen
- one evidence item off screen initially
- empty boxes
- decorative particles everywhere
- ambiguity about what user should decide

### Correct feeling
> “I am helping the memory system decide whether these fragments belong together.”

---

# 6. All other pages — required visual direction

---

## 6.1 Onboarding set (01–05)

### Purpose
Introduce the idea of messy fragments becoming structured travel memory.

### Requirements
- reduce decorative copy
- use real fragment objects
- show ingestion → regrouping → first meaning
- maintain high atmosphere
- keep CTA clear

### Per-page focus
- intro: concept of travel fragments becoming a world
- permission: calm and trustworthy, no generic OS-style stiffness
- intake: mixed input types visible together
- processing: batch cloud forming into city memory
- outcome: show clear result, not just numbers

---

## 6.2 World Import (10) and Import Outcome (11)

### Import page
Must feel like:
> “I’m dropping material into a living system.”

Required:
- strong primary path from gallery
- secondary actions for files / camera / paste text
- visible selected fragment strip or loose pile
- clear batch readiness
- not a generic upload modal

### Outcome page
Must communicate:
- what was absorbed
- where it went
- what new connections emerged
- what still needs help

It must not be just a stats screen.

---

## 6.3 World Capsule (13 / 29)

### Purpose
A poetic editorial travel capsule built from fragments and observations.

### Requirements
- cinematic but restrained
- chapters or sections
- fragment-led storytelling
- text integrated with artifacts
- stronger stillness than other pages
- lighter particle treatment, like dust / memory residue

Must not become a blog post or magazine template.

---

## 6.4 World Explore (14 / 30 / 31 / 32)

This should be a family of related views:
- time
- place
- connection

These pages should share one framework and differ mainly in arrangement logic.

### Explore Time
- vertical time skeleton
- recurring times visible
- artifacts pinned to moments
- not just list cards

### Explore Place
- simplified spatial map / constellation
- places as anchored nodes
- surrounding fragments orbit or reveal on focus
- no giant flat place pills

### Explore Connection
- actual relation topology
- clear source-target logic
- relation states visible
- no random web background

---

## 6.5 Discover Home (15 / 33)

### Purpose
A landing page for discoveries, showing the categories of surfaced meaning.

### Requirements
- discovery clusters, not just cards
- categories like:
  - just surfaced
  - cross-trip
  - unresolved
  - saved
- each discovery preview should show some evidence visually
- page should feel lighter and more curated than fragment field

Must not be a stacked feed of generic content tiles.

---

## 6.6 Else Sheet (17) and Else Answer (18)

### Else is not a full standalone page
Else is a persistent intelligence presence.

### Required visual treatment
- monochrome / pearl-like orb, not gold mascot
- orb state changes:
  - idle
  - listening
  - tracing
  - finding
  - uncertain
- sheet should feel like an overlay carved out of the same world

### Else Sheet
- scope clearly visible
- suggested questions
- concise explanation of what Else will search
- input area stable and elegant

### Else Answer
- answer first, but sourced
- visible sources underneath
- traceable reasoning through fragments / places / dates
- still visually calm

Must not feel like a generic chatbot bottom sheet.

---

## 6.7 Fragment Lens (19)

### Purpose
This is the atomic data lens.

### First screen must answer
- what is this
- where does it belong
- why does it matter

### Must show
- fragment preview
- fragment type
- date / place / trip
- related connections
- related discovery
- access to original
- deeper metadata in collapsible section

### Motion
Should open from the fragment’s real position via a smooth elevation transition.

---

## 6.8 Writing Home (20) / Writing Detail (21)

### Purpose
User-authored reflection layer.

### Requirements
- calmer, warmer visual sub-mode
- still connected to the fragment world
- visible links back to trips / places / discoveries
- “writing traces” should feel like memory annotation, not separate notes app

Must not look like a standard markdown editor.

---

## 6.9 Me Home (22)

### Purpose
Profile + system control, still within the world but less immersive.

### Requirements
- simpler layout
- low particle presence or none
- clear sections
- still elegant
- not visually dead

---

## 6.10 Privacy / Storage / Export (23 / 24 / 25)

These are utility pages.

### Rule
**No immersive particle spectacle here.**

### Requirements
- stable dark utility layout
- clear toggles / metadata / consequences
- crisp typography
- no poetic overreach

These pages should feel reliable, not magical.

---

# 7. Hard prohibitions

The agent must avoid all of the following.

## Visual prohibitions
- generic starfield across all screens
- gold-first visual theme
- arbitrary network lines with no data meaning
- large decorative blur over primary text
- dashboard cards repeated down the screen
- oversized headers on functional pages
- copy-pasted photo placeholders
- empty black placeholder panels representing missing fragments
- bottom nav covering actions or content
- indistinguishable page moods

## Product prohibitions
- world home missing its five entries
- fragment field becoming a list or grid
- discover detail becoming article-first
- inbox requiring scrolling to compare evidence
- settings pages using immersive motion theatrics
- Else behaving like a generic assistant drawer

---

# 8. Required screenshot and QA conditions

## 8.1 Screenshot readiness
All final screenshots must be taken **after animation settle**.

Implement:
```js
window.__ELSEWHERE_VISUAL_READY__ = false;

// when fonts, images, particle targets, and key GSAP entry have settled
window.__ELSEWHERE_VISUAL_READY__ = true;
```

The capture tool must wait for readiness.

---

## 8.2 Visual acceptance checklist

A page can be marked complete only if all are true:

### Immersive pages
- particle logic has semantic meaning
- page has depth
- evidence feels alive
- typography is sharp
- hierarchy is clear
- the page does not collapse into dark-card dashboard language
- transitions feel like reconfiguration

### Functional pages
- no oversized poetic theatrics
- main task visible immediately
- actions reachable without awkward scrolling
- style remains consistent with global product quality

---

## 8.3 Product-wide acceptance checklist

The whole round is complete only if:

- World Home contains all required entries
- particles are structural, not decorative
- City Home feels like a clustered living trip
- Fragments feels like a memory database universe
- Discover Detail reveals evidence before conclusion
- Inbox is usable immediately
- Else is elegant and integrated
- utility pages are clean and restrained
- benchmark pages visually align with provided reference images
- the product as a whole feels immersive and memorable

---

# 9. Final instruction to the agent

You are not being asked to “make the UI nicer”.

You are being asked to build a visually coherent **memory-space product**, where:

- **Three.js particles are the core visual language**
- **GSAP flow creates the sense of memory reconfiguration**
- **real fragments remain the actual protagonists**
- **every page belongs to one continuous system**
- **beauty and immersion are mandatory requirements**

If a page is functional but not visually compelling, it is still unfinished.  
If particles exist but do not mean anything, they are wrong.  
If layout is clear but the product no longer feels like a memory universe, it has failed.  

## Final priority statement
> **Visual effect quality is critical. Particle-driven main visual and memory-flow atmosphere must be fully realized. This is a top-level requirement, not a nice-to-have.**
