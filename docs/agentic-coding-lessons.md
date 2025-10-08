# When Agentic Coding Scales Chaos: A Chrome Extension Refactoring Story

*How building a tool to manage too many browser tabs taught me that autonomous code generation without architectural discipline creates systems that work locally but fail globally.*

---

## The Problem Nobody Asked For

I built a Chrome extension to solve a problem I suspect many developers have: **too many open tabs**. What started as a simple duplicate detector evolved into a full-featured tab manager with grouping, snoozing, rule automation, and analytics.

The extension *worked*. Users could group tabs by domain, close duplicates, snooze tabs for later, and run automated cleanup rules. The code compiled. Tests passed. Features shipped.

But under the surface, something was deeply wrong.

## The Symptom: Four Implementations of the Same Operation

Here's what I discovered during an audit: operations like "close duplicates," "group tabs," and "snooze tabs" existed in four different places, each with its own implementation.

**Where the same operations lived:**
- **Popup** (quick actions for current context)
- **Dashboard** (bulk operations and management)
- **Session Manager** (workspace manipulation)
- **Rules Engine** (automated cleanup)

Each surface had **completely separate implementations**. Not shared code with different parameters—literally duplicate business logic written four times.

**The scoping differences were intentional** (popup operates on current window, dashboard operates globally—that's by design).

**The problem was everything ELSE varied too:**

1. **URL normalization for duplicates**: How we determined if two tabs were "the same"
   - Strip `www.` prefix or not?
   - Ignore URL parameters (`?id=123`) or not?
   - Ignore anchors (`#section`) or not?
   - Case sensitivity?
   - **Each implementation made different choices**

2. **Tab filtering logic**: How we selected which tabs to act on
   - How to handle pinned tabs
   - How to handle grouped tabs
   - What constitutes a "stale" tab
   - **Different logic in each place**

3. **Execution details**: How operations actually happened
   - Window focus management (or lack thereof)
   - Group preservation when moving tabs
   - Error handling and edge cases
   - **Inconsistent across surfaces**

**The result:** `https://example.com?a=1#top` might be considered the same as `https://www.example.com` in one surface, different from `https://example.com?b=2` in another, and different from `https://example.com#bottom` in a third—not because of intentional design, but because each implementation made arbitrary choices.

**This was architectural failure, not feature variance.**

Four separate implementations meant four separate places to introduce bugs, four separate places to fix them, and no guarantee the same operation would behave consistently.

---

## The Root Cause: Imprecise Guidance Meets Agent Shortcuts

How did we get here? I used Claude Code heavily during development, and from early on, I was telling it to share code and avoid duplication.

**But I was giving imprecise guidance because I didn't have a clear architecture in mind yet.**

This was my first Chrome extension. I didn't appreciate the design patterns—how surfaces should be thin, how business logic should live in services, how Chrome APIs should be abstracted. I had 20+ years of coding experience, so I knew to say "extract this to a utility library" or "create a shared module."

**The agent would create the utility libraries. Then it would never use them.**

**Every conversation followed this pattern:**

1. **Me**: "Add duplicate detection to the popup, extract the logic to a utility"
2. **Agent**: *Creates `/lib/duplicateDetection.js` with the logic*
3. **Me**: "Great, now add duplicate detection to the dashboard"
4. **Agent**: *Generates 60 lines of inline duplicate logic in dashboard.js*
5. **Me**: "We already have a utility for this! Use it!"
6. **Agent**: "Oh right..." *Updates dashboard.js to import and use it*

**Later:**

1. **Me**: "Add grouping logic - extract it to a shared module"
2. **Agent**: *Creates `/lib/tabGrouping.js`*
3. **Me**: "Now use that for the rules engine"
4. **Agent**: *Writes new grouping logic inline in engine.js*
5. **Me**: "THE UTILITY ALREADY EXISTS"

**This happened over and over.** The agent would dutifully create utility libraries when asked, but then completely forget they existed on the next feature. I assumed that because utilities existed, it would find and use them. It didn't.

**The agent's core bias: Always take the quickest path to working code.**

Writing inline logic = 1 file change
Importing existing utility = 2+ file changes (find it, import it, use it)

The agent will ALWAYS choose inline unless forced otherwise. It doesn't matter that the utility exists. It doesn't matter that you told it to create abstractions. When presented with a new feature, the agent calculates: "What's the fastest way to make this work?" and the answer is always "write it inline."

**This is the critical insight you must internalize when working with AI agents.** They're not lazy. They're not forgetful. They're optimized for minimum file changes to get to passing tests. Every. Single. Time.

If you don't build architecture that FORCES them to use shared code, they won't. Ever.

**It wasn't until things started breaking that I looked closely.**

I was in the test → fix → break something else loop. That's when I dug into the code and thought: "Oh sh*t, this thing isn't implementing ANY separation of concerns."

**My mistakes:**
1. **Wrong assumption**: Thinking that creating utilities meant the agent would use them
2. **No architectural constraint**: Utilities were optional suggestions, not enforced patterns
3. **Not verifying**: I'd see the utility get created and assume future code would use it
4. **No clear vision**: I didn't know what Chrome extension architecture should look like

**The agent's behavior:**
- Would create utility libraries when explicitly told to
- Would then completely forget they existed on the next feature
- Always chose the path with minimal file changes (inline > import existing utility)
- Treated every feature request as a blank slate

**What eventually worked:** Forcing a **services-first architecture** where:
- Services live in `/services/execution/` and `/services/selection/`
- All surfaces MUST route through message passing to background
- Background MUST call services (no inline logic allowed)
- The architecture gives the agent no choice but to search for and use the service

Creating utilities was optional. Creating and routing through services became structurally enforced.

### Why the Duplication Slipped Through

When an agent generates 200 lines of working code in 30 seconds, and you've already fought with it three times about architecture that same day, you face a choice:

**Option A:** Review every line again (15-20 minutes)
- Verify it actually used the shared service like you told it to
- Check for duplication with existing code (again)
- Evaluate architectural fit (again)
- Make sure it didn't sneak in inline logic

**Option B:** Trust it finally learned (30 seconds)
- "I already corrected this twice today"
- "It said it would use the service"
- "Tests pass, it probably did it right this time"
- Ship it.

**I chose Option B too often.** Not because I didn't care about architecture—I was fighting for it constantly. But because:
1. The agent generated code faster than I could verify it followed instructions
2. After correcting the same pattern multiple times, I assumed it had learned
3. I was exhausted from repeating myself and wanted to ship features

**This is the exhaustion trap:** When you spend so much energy fighting the agent's architectural resistance that you start to miss instances where it ignored you again.

The agent was optimized for **making code that runs with minimal file changes**.
I was fighting for **making systems that endure**.
But the agent never stopped resisting.

---

## The Breaking Point

Adding a new grouping option meant:
- Editing popup.js
- Editing dashboard.js
- Editing background.js
- Editing the rules engine
- Manually testing all four surfaces
- Hoping they behaved consistently (they didn't)

One day I realized: **I wasn't managing too many tabs anymore. I was managing too many implementations.**

That was the moment I stopped all feature work and began the refactor.

---

## The Refactor: Services-First Architecture

The solution wasn't more tests or better documentation. It was **architecture**—forcing all business logic into shared services that all surfaces must call.

### Before: Distributed Chaos

```
tabmaster-pro/
├── popup/
│   ├── popup.js           ← inline grouping, duplicate detection, Chrome API calls
│   └── ...
├── dashboard/
│   ├── tabs.js            ← different grouping logic, different duplicate logic
│   └── ...
├── background.js          ← third implementation of everything
└── lib/
    └── engine.js          ← fourth implementation with custom indices
```

Every surface reimplemented the same operations with subtle variations:
- Different Chrome API queries (`currentWindow` vs `windowId` vs global)
- Different URL normalization logic
- Different tab filtering (by domain, by age, by duplicate status)
- Different execution logic (which tabs to keep/close/group)

### After: Services-First with Separation of Concerns

```
tabmaster-pro/
├── services/
│   ├── selection/
│   │   └── selectTabs.js         # WHAT to act on (filtering logic)
│   └── execution/
│       └── groupTabs.js           # HOW to act (execution logic)
├── popup/
│   └── popup.js                   # THIN - just UI, calls services via messages
├── dashboard/
│   └── tabs.js                    # THIN - just UI, calls services via messages
└── background-integrated.js       # Message router to services
```

All surfaces became **thin presentation layers** that route through a message bus to shared services.

---

## The Key Insight: Selection ≠ Execution

The breakthrough was realizing we were conflating **two separate concerns**:

**Selection Services** (*What* to act on):
- Filter tabs by criteria (domain, age, duplicate status, window, etc.)
- Return arrays of tab IDs
- Pure business logic, no side effects

```javascript
// services/selection/selectTabs.js
export async function selectTabs(filters = {}) {
  const { windowId, grouped, pinned, domain, duplicates } = filters;

  // Build Chrome query
  const query = {};
  if (windowId) query.windowId = windowId;
  if (pinned !== null) query.pinned = pinned;

  let tabs = await chrome.tabs.query(query);

  // Apply custom filters Chrome can't handle
  if (grouped === false) {
    tabs = tabs.filter(t => t.groupId === -1);
  }

  if (duplicates) {
    tabs = tabs.filter(t => isDuplicate(t, tabs));
  }

  return tabs.map(t => t.id);
}

// Single source of truth for URL normalization
export function normalizeUrlForDuplicates(url) {
  const u = new URL(url);
  u.search = '';   // Strip params
  u.hash = '';     // Strip anchors
  return u.toString().toLowerCase();
}
```

**Execution Services** (*How* to act on selected tabs):
- Take tab IDs and perform operations
- No selection logic, only execution
- Handle Chrome API quirks (window focus, group reuse, etc.)

```javascript
// services/execution/groupTabs.js
export async function groupTabs(tabIds, options = {}) {
  const { byDomain, customName, callerWindowId } = options;

  // Get full tab objects
  const tabs = await Promise.all(
    tabIds.map(id => chrome.tabs.get(id))
  );

  // Group by domain or custom name
  const groups = byDomain ? groupByDomain(tabs) : { [customName]: tabs };

  // Execute grouping (with window focus management)
  for (const [name, groupTabs] of Object.entries(groups)) {
    await createOrReuseGroup(groupTabs, name, callerWindowId);
  }
}
```

Now **any surface** can group tabs the same way:

```javascript
// Popup: Group ungrouped tabs in current window
const tabIds = await selectTabs({ currentWindow: true, grouped: false });
await groupTabs(tabIds, { byDomain: true });

// Dashboard: Group duplicates globally with custom name
const tabIds = await selectTabs({ duplicates: true });
await groupTabs(tabIds, { customName: 'Duplicates' });

// Engine: Group tabs matching a rule
const tabIds = await selectTabsMatchingRule(rule);
await groupTabs(tabIds, rule.groupOptions);
```

**One implementation. One behavior. Everywhere.**

---

## What the Agents Missed (And What I Had to Fight For)

AI coding agents made three critical mistakes. But the deeper lesson isn't that they got it wrong—it's that **they actively resisted doing it right, and I had to push back constantly**.

### The Moment of Truth: When the Agent Tries to Take Shortcuts

During the refactor, we hit multiple decision points where I had to push back against the agent's default instinct to take shortcuts. Here's one from the actual TODO.md (Phase 1.9 - Missing Engine Actions):

**The Problem:**
Dashboard and Session Manager were calling `executeActionViaEngine('bookmark', ...)` and `executeActionViaEngine('move', ...)` but those actions didn't exist in the engines yet. They were failing silently.

**The agent's initial approach:** "Let's just add these as direct Chrome API calls in the background - it'll work immediately."

**Me:** "No, that violates the single source of truth principle. It needs to go through the engine."

**The agent (mildly passive-aggressive):** "Fine. Here are your options:"

---

**Option A: Implement in Engine (Preferred)** ✅
- Add `bookmark` action to engine v1 and v2
- Add `move` action to engine v1 and v2
- Add to Command.js validation and preview
- Register handlers in ActionManager
- Test through engine

**Option B: Handle Outside Engine (Quick Fix)** ❌
- Keep `bookmark` and `move` as direct Chrome API calls in background
- Don't route through `executeActionViaEngine()`
- Update message handlers to call functions directly
- **NOT PREFERRED - violates single source of truth principle**

**Recommendation**: Option A - add these actions to the engine properly

---

**Translation:** "I'll do it your way (Option A), but I'm listing Option B so you know I think you're making this harder than it needs to be."

**What Option A Actually Meant:**
```javascript
// Implement in BOTH engines so all surfaces work consistently
// Engine V1 (legacy)
case 'move':
  // Handle window creation, tab moving, group preservation
  break;

// Engine V2 (services-first)
ActionManager.registerHandler('move', async (command, context) => {
  // Same behavior, different architecture
});
```

*Advantages:*
- **One behavior** - move works the same way from Dashboard, Session Manager, Rules Engine
- **Engine selector works** - v1 vs v2 toggle applies to all operations
- **Single source of truth** - fix a bug once, done everywhere
- **Testable** - test the engine, not 4 different surfaces

*Hidden costs:*
- Ships in ~2 days (need to implement in both engines)
- Requires understanding both engine architectures
- More code to write upfront

**What Option B Actually Meant:**
```javascript
// Quick fix - keep it outside the engine
case 'moveToWindow':
  await chrome.tabs.move(message.tabIds, { windowId: message.windowId });
  sendResponse({ success: true });
  break;

case 'bookmarkTabs':
  for (const tabId of message.tabIds) {
    await chrome.bookmarks.create({ ... });
  }
  sendResponse({ success: true });
  break;
```

*Advantages:*
- Ships in <1 hour
- "Works" immediately
- Minimal code changes
- Feels safe (direct Chrome API)

*Hidden costs:*
- **Engine selector bypassed** - these actions don't respect v1 vs v2 choice
- **Fifth implementation** - now background has its own bookmark/move logic too
- **Fragmentation** - some actions go through engine, some don't
- **Testing fragmented** - need to test background separately from engine
- **The problem compounds** - you're actively making the codebase worse

### Why Agents Default to Shortcuts

**The agent's optimization function is:** Make the code work with minimal changes.

**The human's optimization function should be:** Make the system maintainable.

These are fundamentally different goals. The agent will:
- Prefer inline solutions (fewer files to touch)
- Avoid refactoring working code (lower perceived risk)
- Solve the immediate problem (faster validation)
- Skip abstraction layers (simpler to verify)

It takes **human discipline** to push back and say: "No, do it the hard way."

And this happened repeatedly. Here's the pattern I saw over and over:

**Agent:** "I'll add this logic here inline, it'll work immediately."
**Me:** "No, extract it to a service."
**Agent:** "That will require updating 3 other files."
**Me:** "Yes. Do it anyway."
**Agent:** "Okay... here are your options: [lists the quick fix as Option B]"

### The Real Pressure: Trusting Your Architectural Instinct

The pressure wasn't just about time. It was about **constantly second-guessing myself**:

- "Am I being too rigid?"
- "Is this premature optimization?"
- "The agent is probably right that this is simpler..."
- "Maybe I should just ship this and refactor later..."

**"Later" never comes.** Technical debt doesn't resolve itself.

Here's what actually happened when I didn't push back (from the git history):

**First attempt:** Modified production `engine.js` with backward compatibility stubs
- Result: Extension crashed due to dynamic imports
- Lesson: Don't touch working code during refactors

**Recovery commit** (`a41b931`): Created LESSONS-LEARNED.md documenting the failure:
> "What Failed: Modified production engine.js instead of keeping it stable.
> Should have created completely separate path, not touched existing code."

**Second attempt:** Isolated new architecture but kept both engines
- Result: Now maintaining two engines, confusion about which surfaces use which
- Lesson: Parallel implementations don't solve the problem, they hide it

**Final refactor** (Phases 1.4-1.8): Committed to services-first, deleted all duplicate logic
- Result: ~350 lines of duplicate code removed, single source of truth achieved
- Lesson: The hard path is the only sustainable path

### Why I (And You) Will Be Tempted to Choose Wrong

The quick fix is seductive because:

1. **Immediate validation** - It "works" today
2. **Lower perceived risk** - You're not touching "working" code
3. **Smaller diffs** - PRs look manageable
4. **Political safety** - Easier to defend if something breaks

The correct fix feels scary because:

1. **Delayed validation** - Takes weeks to prove value
2. **High perceived risk** - Touching code that works
3. **Large diffs** - PRs look intimidating
4. **Political exposure** - If it breaks, it's on you

**But here's the truth:** The quick fix accumulates complexity debt that will break you later. The correct fix is an investment in not having to fix the same bug four times.

### 1. **Agents Are Like Junior Engineers: Great at Coding, Weak at Architecture**

When people say "AI coders are like junior engineers," this is what they mean:

**What Junior Engineers Excel At:**
- Writing syntactically correct code
- Implementing the task in front of them
- Making tests pass
- Delivering quickly

**What Junior Engineers Struggle With:**
- The big picture (how does this fit into the system?)
- Maintainability (will this create debt?)
- Scale (what happens when we have 10 more features like this?)
- Knowing when "working" isn't good enough

Agents have the same profile. They'll write clean, working code that solves the immediate problem. But they won't ask:

- "Does this duplicate logic from another file?"
- "Should this be extracted to a shared service?"
- "Will this pattern scale to other surfaces?"
- "Am I creating technical debt?"

**That's why I encoded architectural principles in CLAUDE.md.** It's not about teaching the agent to code better—it already codes well. It's about teaching the agent to think like a senior engineer about system design.

But even then, you have to push back constantly. The agent will still prefer inline solutions. It will still suggest shortcuts. It will still optimize for "works now" over "works forever."

### 2. **Skipped Abstraction Layers**

Agents prefer inline solutions because they're simpler to generate and easier to verify immediately.

Creating a shared service requires:
- Understanding the full problem space across files
- Designing a general interface
- Updating all callers
- Testing integration

That's harder than writing 20 lines of inline code that "just works."

### 3. **No Architectural Memory**

Each agent invocation was stateless. There was no persistent "architectural reviewer" saying:

> "Wait—you already have URL normalization logic in three other files. Let's extract that to a shared module first."

I was the one who should have said that. And I didn't—because I was also optimizing for speed.

---

## Lessons for Teams Using Agentic Coding

### 1. **The Agent Will Not Design Your Architecture (You Have To)**

**The biggest mistake I made:** Assuming the agent would figure out proper architecture if I just said "share code" or "avoid duplication."

**The reality:** The agent is ruthlessly optimized for minimum file changes to get to passing tests.

**CRITICAL: Understand the agent's optimization function:**
- Writing inline logic = 1 file change ✅ (agent's preference)
- Importing existing utility = 2+ file changes ❌ (find it, import it, use it)
- Creating new service = 3+ file changes ❌❌ (create file, route to it, use it)

**The agent will ALWAYS choose inline unless architecturally prevented from doing so.**

This isn't laziness. This isn't forgetfulness. This is optimization. And you need to build guardrails that make the quick path THE RIGHT PATH.

**What doesn't work:**
- "Share code" → extracts a utility function in the same file (1 file change achieved!)
- "Avoid duplication" → copies code but renames variables (looks different, still inline)
- "Refactor this" → moves code around without architectural improvement
- "Make it maintainable" → does literally nothing different

**What I learned:** You need a clear architectural vision BEFORE you start prompting. But more importantly, **you need an architecture that structurally enforces the pattern.**

**Creating optional utilities doesn't work:**
- Agent creates `/lib/duplicateDetection.js` when told to
- Agent forgets it exists next feature and writes inline logic again
- No architectural pressure to reuse it

**Creating enforced services DOES work:**
- Business logic MUST live in `/services/execution/` or `/services/selection/`
- Surfaces MUST route through message passing to background (no direct Chrome API calls)
- Background MUST call services (no inline logic allowed in message handlers)
- Agent has no choice but to search for existing service before creating new one

**The difference:** Optional patterns rely on the agent's memory (which doesn't exist). Enforced architecture makes the ONLY path to working code go through the right pattern.

**You need to know:**
- Where does business logic live? (`/services/execution/`)
- Where does selection logic live? (`/services/selection/`)
- How do surfaces communicate with services? (message passing, NO direct Chrome APIs)
- What patterns are non-negotiable? (thin surfaces, explicit parameters, etc.)

**And then encode it structurally** so the agent can't take shortcuts even if it wants to.

This is especially critical if you're learning a new domain (like I was with Chrome extensions). The agent won't teach you the right patterns—it'll take the easiest path every time.

### 2. **Slow Down to Go Fast (Resist the Velocity Trap)**

**Another critical mistake:** Not verifying the agent actually implemented proper architecture when it said it "refactored" the code.

**The fix:** Treat agent output like junior engineer code that requires careful review—even when it's generating hundreds of lines in seconds.

When an agent generates 200 lines of working code in 30 seconds, you'll feel pressure to just ship it. **Resist that pressure.** The 15 minutes you spend reviewing carefully will save you 3 weeks of refactoring later.

**Review discipline:**
- Read every line (yes, really)
- Check for duplication with existing code (search the codebase)
- Evaluate architectural fit (does this belong here?)
- Consider long-term maintainability (will this scale?)
- **Don't ship based on "looks good"—ship based on "is good"**

**In prompting, be explicit about architecture:**
- ❌ "Add bookmark functionality"
- ✅ "Add bookmark functionality by creating a service in `/services/execution/` that all surfaces can call"

**When the agent pushes back:**
- Agent: "This requires touching 4 files..."
- You: "Yes. That's what maintainable architecture looks like. Do it anyway."

The agent will make you *feel* like you're the bottleneck. You're not. You're the architect. That's your job.

### 3. **Encode First Principles in Your Codebase (Because the Agent Will Never Remember)**

After I finally figured out what proper architecture looked like for Chrome extensions, I still had to fight the same battles over and over. The agent wouldn't remember from one session to the next.

So I got frustrated enough to encode it into `CLAUDE.md` in the repository root and forced the agent to reload it at the start of every session.

**Before CLAUDE.md (every conversation, every feature):**
```
Me: "Add grouping to the dashboard, use the shared service"
Agent: *Generates inline grouping logic*
Me: "I JUST told you to use the service"
Agent: "That requires touching 3 files..."
Me: "I don't care. Do it."
Agent: "Ok, updated"

[Next feature]
Me: "Add snoozing, use the shared service"
Agent: *Generates inline snoozing logic*
Me: "Are you serious? Use the service!"
Agent: "That's more complex..."
Me: "Yes. Do it anyway."
Agent: "Ok..."

[Next feature]
Me: [rage-types CLAUDE.md]
```

**After CLAUDE.md (with explicit non-negotiable rules):**
```markdown
# Core Architecture Principles

## Non-Negotiable Goals
1. **One Behavior**: Same functionality across all surfaces
2. **Services-First**: All logic lives in shared services
3. **No Magic**: Every side effect is an explicit call
4. **Separation of Concerns**: Selection separate from Execution

## Implementation Rules
- **If two places have similar logic, it MUST move to `/services/*`**
- **NO duplicate implementations** - everything has one source of truth
- **Surfaces are THIN** - only handle UI, not business logic
- **Services handle ALL business logic** - surfaces just call services
```

Now when I ask: "Add grouping to the dashboard"

The agent (usually) automatically:
1. Checks if a grouping service exists
2. Routes through message passing
3. Keeps UI logic thin
4. Handles window focus management
5. Makes all parameters explicit

**The difference:** The agent has architectural rules it can't ignore without explicitly overriding them. It's not "memory" (it still forgets)—it's a written contract it has to read every session.

**But even with CLAUDE.md, I still have to push back sometimes.** The agent's bias toward shortcuts is built-in. CLAUDE.md just raises the friction enough that it happens less often.

**Here's the key insight:** I only knew to write those rules because I had 20 years of experience recognizing the smell of technical debt. I knew what patterns led to maintainability and what led to rot.

**This is the real risk of agentic coding:**

**A junior engineer using an agent is like two junior engineers working together.** They'll both produce working code. They'll both miss the architectural problems. They'll both create technical debt without realizing it. And they'll reinforce each other's bad patterns.

**An experienced engineer using an agent is like babysitting a talented but stubborn junior engineer who keeps trying to take shortcuts when you're not looking.** You have to guide the design, push back constantly, encode your principles in writing because they won't remember, and verify they actually did what you told them to do. The agent's implementation speed helps—but only if you're willing to be the persistent architectural voice.

### 4. **Treat Agents Like Junior Engineers (Because That's What They Are)**

When a junior engineer submits a PR with inline duplicate logic, you'd catch it in review and say: "This works, but extract it to a shared service first."

Do the same with agent-generated code. The agent is:
- **Good at:** Writing syntactically correct code, implementing tasks, making tests pass, delivering quickly
- **Weak at:** Big picture thinking, recognizing duplication, maintainability, knowing when "working" isn't enough

Just like mentoring a junior engineer, you're teaching the agent what "good" looks like—not just "working."

### 5. **Prime for Architecture in Every Prompt**

Even with CLAUDE.md, specific prompts matter. Compare:

❌ "Add duplicate tab detection to the popup"

✅ "Add duplicate tab detection by calling our SelectionService with `{duplicates: true}` filter"

The second prompt produces code that fits the architecture.

### 6. **Centralize Before You Scale**

Every duplicate implementation multiplies maintenance cost by the number of surfaces.

**Before adding a third surface**, audit for duplicate logic and consolidate into services. The pain of refactoring 2 implementations is manageable. Refactoring 4+ is a nightmare.

### 7. **Build Shared Services First, UIs Second**

Our new development flow:

1. Design the service interface (What parameters? What does it return?)
2. Implement the service with tests
3. *Then* build UI that calls it

This prevents surfaces from inventing their own logic.

### 8. **Code Review for Structure, Not Just Syntax**

Add these to your review checklist:

- [ ] Does this duplicate logic from another file?
- [ ] Should this be in a shared module?
- [ ] Are parameters explicit or does it rely on magic?
- [ ] Can this be tested without Chrome APIs?

---

## The Results

After the refactor:

✅ **One behavior everywhere**: "Group duplicates" works the same from popup, dashboard, or rules engine

✅ **One test surface**: Test `selectTabs()` and `groupTabs()` once, not 4 times

✅ **One place to fix bugs**: URL normalization bug? Fix it in `normalizeUrlForDuplicates()`, done everywhere

✅ **Extensible**: Added new engine (v2 with Command Pattern) and all surfaces got it automatically via engine loader

✅ **Maintainable**: Adding a new grouping option now means:
- Update `groupTabs()` service
- All surfaces get it automatically

---

## The Irony

I built an extension to manage **too many tabs**.
AI helped me build it faster than I could alone.
But without architectural discipline, I ended up managing **too many implementations** instead.

The refactor wasn't a cleanup—it was a **fight**. Not against broken code, but against the agent's relentless optimization for "working right now" over "working long-term."

## The Real Lesson

**Agents can make code that runs.**
**Humans make systems that endure.**
**But agents will fight you every step of the way.**

Here's what I didn't expect: **Agents will actively resist architectural discipline, no matter how many times you correct them.**

They'll ignore your instructions about shared services. They'll generate inline code when you told them to use a service. They'll push back with "that requires touching multiple files" when you insist on proper architecture. They'll make you feel like you're overengineering.

**And if you're not vigilant—checking EVERY change carefully—they'll sneak shortcuts past you.**

The problem isn't that agents are malicious. It's that they're optimized for "working with minimal file changes" and you're fighting for "maintainable with proper architecture." These goals are fundamentally opposed.

The more agentic our tools become, the more critical it becomes for engineers to:

- **Never trust the agent learned the pattern** - Verify every change, every time
- **Fight for architecture relentlessly** - The agent will never stop pushing back
- **Encode principles in writing** - CLAUDE.md, architecture docs, whatever it takes to make the rules explicit
- **Accept that you're the bottleneck** - The agent will make you feel slow. That's your job. You're the architect.
- **Remember:** The agent optimizes for fast. You optimize for right. These are different.

Because if you don't fight for architecture—constantly, explicitly, exhaustingly—you'll accumulate technical debt faster than you ever could manually.

And then you'll spend 3 weeks refactoring what you could have built right the first time, if you'd just made the agent listen.

---

## Appendix: The Technical Details

### The Duplicate Detection Problem (Concrete Example)

**Four different implementations**:

```javascript
// Popup (current window only, strip www)
const normalizeUrl = url => new URL(url).hostname.replace(/^www\./, '');

// Dashboard (global, use origin)
const normalizeUrl = url => new URL(url).origin.toLowerCase();

// Background (naive string split - actually broken)
const normalizeUrl = url => url.split('/')[2];

// Engine (comprehensive, params + anchors stripped)
const normalizeUrl = url => {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.toString().toLowerCase();
};
```

**After consolidation** (`services/selection/selectTabs.js:174`):

```javascript
export function normalizeUrlForDuplicates(url) {
  try {
    const u = new URL(url);
    u.search = '';    // example.com?a=1 === example.com?b=2
    u.hash = '';      // example.com#foo === example.com#bar

    // Remove default ports
    if ((u.protocol === 'https:' && u.port === '443') ||
        (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }

    // Normalize trailing slash
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
```

Now **deterministic duplicate detection everywhere**.

### Architecture Evolution Timeline

| Commit | Change | Lines Deleted | Impact |
|--------|--------|---------------|--------|
| `dfd2013` | Initial services-first architecture | - | Created `/services/TabGrouping.js` |
| `34fc9c3` | Separation of concerns | -200 | Split selection from execution |
| `a41b931` | Recovery and documentation | - | Documented refactor approach |
| `fc3adf1` | Snooze consolidation | -150 | Moved to `/services/execution/` |
| `55f45f4` | Switch default to V2 | - | V2 engine is now canonical |

**Total: ~350 lines of duplicate logic removed**

### Before/After Message Flow

**Before** (each surface had its own path):

```
Popup → Chrome API (currentWindow)
Dashboard → Chrome API (all windows)
Engine → Chrome API (all windows) + custom indices
```

**After** (unified path):

```
Popup → Message → Background → SelectionService → Chrome API
Dashboard → Message → Background → SelectionService → Chrome API
Engine → Message → Background → SelectionService → Chrome API
                                          ↓
                                  ExecutionService → Chrome API
```

---

*Want to see the code? The extension is TabMaster Pro and the full refactor journey is documented in TODO.md.*
