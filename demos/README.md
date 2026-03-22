# Demo Materials

Everything you need to create compelling Cortex demos for social media, README GIFs, and conference talks.

---

## Quick Demo Script (2 minutes)

### Setup
1. Open terminal, split screen with Claude Code
2. Start screen recording (recommend: [Kap](https://getkap.co/) for macOS)
3. Use a clean project directory for best results

### Scene 1: The Problem (30s)
- Open Claude Code in a project
- Ask: "What's our tech stack?"
- Claude says: "I don't have context about your project"
- **Show the pain** — this is what every developer experiences

### Scene 2: Install Cortex (15s)
- Run: `npx cortex init`
- Show the success message and MCP server registration
- "That's it. One command."

### Scene 3: The Magic (30s)
- Work with Claude Code normally for a minute
- Make a decision: "Let's use Fastify instead of Express for the API"
- Run: `cortex show` — see the memory saved automatically
- **Key moment**: Cortex captured the decision without being asked

### Scene 4: Next Session (30s)
- Close Claude Code completely
- Open it again in the same project
- Ask: "What framework are we using for the API?"
- Claude answers correctly: "You decided to use Fastify instead of Express"
- **Wow moment** — persistent memory across sessions

### Scene 5: Sync (15s)
- Run: `cortex sync setup`
- Show memories appearing on a second machine
- Close with: "Your AI assistant just got persistent memory. Across sessions. Across machines."

---

## GIF Recording Guide

Record these GIFs for the README and social media. Target 10-15 seconds each.

| GIF | What to Show | Duration |
|-----|-------------|----------|
| `install.gif` | `npx cortex init` with success output | 10s |
| `memory-save.gif` | Claude saves a decision, `cortex show` displays it | 12s |
| `next-session.gif` | Claude remembers from a previous session | 12s |
| `dashboard.gif` | Dashboard overview with projects and memories | 10s |
| `sync.gif` | Sync setup and memories appearing on second machine | 12s |

### Recording Tips
- Use a **dark terminal theme** (matches GitHub dark mode)
- Set terminal to **80x24** for clean framing
- Use a **large font** (16-18pt) so text is readable as GIF
- **Remove personal info** from prompts and outputs
- Add a **2-second pause** at the end so viewers can read the final state

---

## Social Media Assets

### Twitter/X Thread Script

**Tweet 1 (Hook)**
> Claude Code forgets everything between sessions.
>
> I built Cortex to fix that.
>
> Persistent memory for your AI assistant — automatic, local-first, and open source.
>
> Thread on how it works:

**Tweet 2 (Problem)**
> The problem: Every time you start a new Claude Code session, your AI has amnesia.
>
> "What's our tech stack?" — it doesn't know.
> "What did we decide yesterday?" — gone.
>
> You end up repeating yourself. Every. Single. Session.

**Tweet 3 (Solution)**
> Cortex runs as an MCP server alongside Claude Code.
>
> It automatically captures decisions, preferences, and project context as you work.
>
> No manual notes. No copy-paste. Just work normally.

**Tweet 4 (Features)**
> What you get:
> - Automatic memory capture (7 quality rules)
> - Works offline, local-first SQLite
> - Multi-machine sync via Turso
> - Web dashboard to browse memories
> - VS Code extension
> - 30+ CLI commands
>
> One command install. MIT licensed.

**Tweet 5 (CTA)**
> Star us on GitHub if persistent AI memory matters to you.
>
> [link]
>
> Built by @kaboraiofficial at K2N2 Studio.

---

## Conference Talk Outline (5 min Lightning Talk)

1. **The Problem** (1 min) — AI assistants have amnesia
2. **Why It Matters** (1 min) — Context switching cost for developers
3. **Live Demo** (2 min) — Install, use, remember
4. **Architecture** (30s) — MCP server, SQLite, quality rules
5. **Call to Action** (30s) — Star, contribute, join the community

---

## Assets Checklist

- [ ] Record `install.gif`
- [ ] Record `memory-save.gif`
- [ ] Record `next-session.gif`
- [ ] Record `dashboard.gif`
- [ ] Record `sync.gif`
- [ ] Create 2-minute demo video
- [ ] Write Twitter/X thread
- [ ] Create HN Show post draft
- [ ] Create Reddit r/programming post draft
- [ ] Create Dev.to article draft
