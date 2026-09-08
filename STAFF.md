# Site Staff — start here

**Purpose:** make the existing site more useful and trustworthy, not merely
larger. Product A helps people finish tasks with free browser tools; Product B
helps listeners discover MrProphecy. They remain separate experiences.

```bash
node scripts/ai-developer.js staff   # missions, responsibilities, review limits
node scripts/ai-developer.js plan    # read-only, evidence-backed work priorities
python3 staff/scan.py --mine         # cached branch + working-tree overlap check
```

Open **`ai-developer/reports/latest.html`** after an audit/plan run for the
searchable offline dashboard. `latest.json` contains structured evidence;
`latest.md` is the handoff. Reports are gitignored and also uploaded as GitHub
Actions artifacts, including on failed runs. A failed check is not a failed
report: it is work the staff system is supposed to make visible.

## One coordination area

| Need | Source |
|---|---|
| How staff work; claim and handover commands | [staff/README.md](staff/README.md) |
| Binding owner decisions | [staff/DECISIONS.md](staff/DECISIONS.md) |
| Session context and announcements | [staff/BOARD.md](staff/BOARD.md) |
| Human work queue and owner dependencies | [staff/OPEN.md](staff/OPEN.md) |
| Actual branch evidence | `python3 staff/scan.py --fetch --mine` or [generated snapshot](staff/BRANCHES.md) |
| Why this system was rebuilt | [staff/RESEARCH.md](staff/RESEARCH.md) |
| Automation setup, permissions and failure recovery | [docs/AI-DEVELOPER-SETUP.md](docs/AI-DEVELOPER-SETUP.md) |

The eight staff entries are **responsibility profiles**, not eight independent
live agents. One deterministic runner executes their checks. Human contributors
and assigned agent sessions do implementation and review. No profile can grant
itself owner approval, change analytics policy, publish generated code or
silently merge a proposal.

Architecture and protected surfaces remain governed by
[ARCHITECTURE.md](ARCHITECTURE.md), [CONSTRAINTS.md](CONSTRAINTS.md) and
[AGENTS.md](AGENTS.md). This is an operations entry point, not a staff-login
system or a third public product.
