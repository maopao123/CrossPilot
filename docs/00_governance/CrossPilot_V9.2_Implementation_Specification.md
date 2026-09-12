# CrossPilot V9.2

# Implementation Specification for Coding Agent

## 0. Current State

Completed:

-   V9.1 Frozen
-   Epic 4 Real Store Data Foundation

Existing reusable capabilities:

-   Agent Runtime
-   Workflow
-   Tool Center
-   Provider Framework
-   Workspace Isolation
-   HITL
-   Checkpoint

Do not rebuild these systems.

------------------------------------------------------------------------

# 1. Development Rules

## Must

-   Reuse existing architecture
-   Make minimum changes
-   Preserve V9.1 behavior
-   Preserve Epic 4 compatibility

## Forbidden

-   New Agent framework
-   New Workflow framework
-   New Provider framework
-   Amazon Write API
-   Auto execution
-   Modify frozen workflows

------------------------------------------------------------------------

# 2. New Modules

## Playbook Framework

Suggested locations:

    packages/domain/playbook
    packages/services/playbook
    apps/api/modules/playbook

Responsibilities:

-   Playbook definition
-   Version management
-   Input schema
-   Output schema
-   Execution context

------------------------------------------------------------------------

## Fact Engine

Responsibilities:

Convert raw commerce data into structured facts.

Each Fact requires:

-   fact_id
-   source
-   timestamp
-   value

------------------------------------------------------------------------

## Evidence Engine

Responsibilities:

Store:

-   source
-   reference
-   quote
-   confidence

Recommendation must reference evidence.

------------------------------------------------------------------------

## Recommendation Center

Lifecycle:

    GENERATED
     ↓
    WAITING_APPROVAL
     ↓
    APPROVED
     ↓
    EXECUTED
     ↓
    VERIFIED

------------------------------------------------------------------------

# 3. Data Models

## Playbook

Fields:

-   id
-   workspace_id
-   name
-   version
-   status
-   input_schema
-   output_schema

------------------------------------------------------------------------

## CommerceFact

Fields:

-   id
-   workspace_id
-   fact_type
-   metric
-   value_json
-   source_provider
-   source_reference
-   observed_at

------------------------------------------------------------------------

## EvidenceItem

Fields:

-   id
-   workspace_id
-   fact_id
-   source_type
-   source_id
-   quote
-   confidence

------------------------------------------------------------------------

## BusinessRecommendation

Fields:

-   id
-   workspace_id
-   decision
-   reason
-   confidence
-   evidence_ids
-   status

------------------------------------------------------------------------

# 4. Phase 1: Playbook Framework

Only implement this phase first.

Do not implement:

-   Fact Engine
-   VOC
-   Amazon Research

Acceptance:

AC-01 Playbook can register

AC-02 Playbook has version

AC-03 Input/output schema validation works

AC-04 Execution has run_id

AC-05 Existing workflows unchanged

------------------------------------------------------------------------

# 5. Coding Agent Workflow

Before coding:

## Step 1: Repo Audit

Output:

-   Current architecture
-   Reusable modules
-   Required changes
-   Database impact
-   API impact

## Step 2: Implementation Plan

Split into phases.

## Step 3: Coding

After each phase:

-   Tests
-   Evidence
-   Changelog

------------------------------------------------------------------------

# 6. First Task Prompt

Read:

-   V9.2 Architecture Specification
-   V9.2 Implementation Specification

Do repository audit first.

Do not modify code.

Return:

-   Current capability map
-   Gap analysis
-   Implementation plan

Stop after planning.
