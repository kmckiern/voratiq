# Voratiq Product

## Market Context

- Teams are moving from single copilots to orchestrated, auditable agent platforms.
- 84% of developers now use or plan to use AI coding tools, yet 46% still do not fully trust AI-generated code.
- The top frustration is "almost right" suggestions (66%), which add debugging and review overhead.

## Core Thesis

Voratiq delivers measurable engineering gains by launching parallel AI coding runs against the same task, capturing their work in isolated workspaces, and letting human reviewers pick the strongest outcome. Competition plus review tooling yields better quality, faster merges, auditable trails.

## Product Snapshot

- Parallel agents work in isolated workspaces; evaluators score outputs and log evidence automatically.
- Engineers operate at staff level—define intent, pick rosters, adjudicate outcomes—instead of writing code line by line.
- The review console is the main console; version control stays the durable source of truth.

## Customer Workflow

1. Capture a spec or ticket and start a run workspace.
2. Launch one or more agent line-ups (frontier APIs, open-source, in-house models).
3. Review evaluator summaries, diffs, and agent traces inside Voratiq.
4. Pick the winning implementation, queue follow-up tests, export to VCS/CI.
5. Evidence—artifacts, reviewer notes, timing—persists for audits and tuning.

## Packaging & Pricing

- **Open Core Runner**: Orchestration engine, evaluator framework, CLI, self-hosted isolation. Free, transparent, community extensible.
- **Voratiq Cloud**: Managed isolation, hosted evaluator pools, secure evidence retention, historical dashboards, integrations maintained by Voratiq.
- **Add-Ons**: Compliance retention SLAs, advanced evaluator bundles, integration packs (CI pipelines, IDE extensions).
- **Monetization Levers**: Reviewer seats (workflow access + history), metered agent runs (spend matches outcomes), compliance add-ons, free starter tier (1 reviewer, limited runs).

## Commercial Motion

- **Onboarding**: Self-serve install of the Voratiq GitHub/GitLab app, guided sandbox project, quick-start docs.
- **Expansion**: Product-qualified nudges triggered by reviewer concurrency, run volume, automation (nightly runs, regression sweeps).
- **Storytelling**: Nail the "interactive engineering" narrative—engineers orchestrate, agents implement—via benchmarks, evaluator deep dives, community showcases.

## Evidence & Trust

- **Metrics We Prove**: Cycle time delta (baseline vs Voratiq), reviewer minutes saved, rollback/change-failure rate.
- **Telemetry**: Opt-in module for OSS deployments; hosted cloud consoles anonymized benchmarks and agent rankings.
- **Open Source Phases**:
  - Phase 1 (Months 1–12): Open orchestration engine, baseline agents, connectors, starter evaluators. Target 1k stars, 100 trialing companies.
  - Phase 2+: Hosted convenience at $29+/reviewer, premium agents/evaluators, enterprise controls, optional services.
- **Transparency Commitments**: Open evaluator specs, public data schemas, local evaluator execution with hosted auto-updates.

## North Star: Interactive Engineering

Voratiq's long-term ambition is an "interactive engineering" environment where planning, execution, review live in one loop. Engineers stay at staff level—framing problems, selecting agents, steering trade-offs, adjudicating outcomes—while agents implement. Runs become collaborative sessions: evaluators enforce guardrails, promotion happens inside Voratiq. GitHub and other VCS remain durable storage; Voratiq is where engineering happens.

## Differentiation Pillars

- Competition-first workflow: multiple agents head-to-head, strongest implementation consoled fast.
- Evidence-native: execution traces, evaluator scores, reviewer notes, promotion history captured automatically.
- Open agent mix: frontier APIs, open-source models, domain-tuned agents compete inside the same run.
- Reviewer-first UX proves net time savings and elevates engineers to staff-level orchestration.

## Target Customer

- **High-velocity product teams** already experimenting with AI coding tools but frustrated by "almost right" suggestions.
- **Engineering orgs with compliance needs** craving audit trails without heavyweight enterprise sales motions.
- **AI-forward builders** eager to mix and benchmark agents instead of betting on one vendor.
