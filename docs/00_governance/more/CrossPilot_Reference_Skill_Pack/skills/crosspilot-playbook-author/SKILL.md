---
name: crosspilot-playbook-author
description: Convert a recurring cross-border ecommerce operating procedure into a CrossPilot Playbook/Skill without bypassing existing Tools, Workflows, Evidence, Risk or Action layers. Use when a user says a task should be repeatable, standardized, automated, or turned into a skill.
---
# CrossPilot Playbook Author

## Six business questions — required before authoring
1. Business objective: what decision or outcome is this for?
2. Manual baseline: how is it done today?
3. Steps: exact order and branches.
4. Judgment: thresholds, evidence requirements, exceptions and stop conditions.
5. Trigger: when should this playbook run?
6. Deliverable: what artifact/state means done?

## Engineering questions
- Which existing Tools can be reused?
- Which existing Workflow should execute it?
- What evidence is mandatory?
- Business risk level bounds (`riskLevel`: low / medium / high)?
- Maximum allowed automation permission level (`maxAutomationLevel`: L0~L3; L4 prohibited for high risk)?
- What must remain manual?
- What happens on missing data/API failure?

## Eval requirement
Create 2-5 representative cases. Run new playbook versus baseline/old version. Define objective assertions where possible; record failures, latency and token/tool-call cost.

## Rule
A Skill describes business SOP. It does not implement a second adapter, approval system, evidence store, or checkpoint engine.
