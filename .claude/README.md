# Claude Code - Project Documentation

## 📚 Documentation Files

### [PROJECT_SNAPSHOT.md](PROJECT_SNAPSHOT.md)
**Complete codebase overview** - Read this first in new chat sessions!

Contains:
- Architecture (Frontend/Backend/Indicator Service)
- Authentication flow (Discord OAuth + JWT)
- Strategy system (Flow-based visual builder)
- API endpoints reference
- Deployment setup
- Strategic roadmap with priorities
- Answered FAQs

### [PERFORMANCE_ANALYSIS.md](PERFORMANCE_ANALYSIS.md)
**Deep dive on batch backtest performance** - Critical for scaling!

Contains:
- Current bottleneck analysis
- Performance projections at scale (14k-200k combos)
- 3-phase optimization roadmap
- Complete code changes needed
- Cost estimates
- Decision framework

## 🎯 Current Priorities

### 1. **PERFORMANCE (URGENT)** 🔥
Current sequential batch processing cannot handle required scale:
- 14,000 combos = 19.4 hours ❌
- 200,000 combos = 277 hours ❌

**Solution:**
- Phase 1 (1-2 days): Parallel processing → 10-20x speedup
- Phase 2 (1 week): Worker queue architecture → 200k combos in ~3 hours

### 2. **DATABASE MIGRATION (Near-future)**
Move from JSON files to PostgreSQL:
- Support multiple users
- Persist thousands of strategies/batch jobs
- Enable job resumption on crash

### 3. **API KEY STORAGE (Later)**
Current approach (keys in headers) fine for now, will migrate when scaling

## 🚀 Quick Start for New Chats

When starting a fresh chat, tell Claude:

> "Read .claude/PROJECT_SNAPSHOT.md to understand the codebase, then help me with [your task]"

This ensures context about:
- Architecture and tech stack
- Current implementation patterns
- Known issues and priorities
- Strategic decisions already made

## 📝 Maintenance

Update these docs when:
- Major architecture changes
- New features added
- Priorities shift
- Performance characteristics change
- Questions get answered

Keep the snapshot current so future Claude sessions don't ask the same questions!
