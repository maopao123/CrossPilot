# CrossPilot V9.2

# Commerce Intelligence & Playbook Architecture Specification

## 1. V9.2 Goal

V9.1 + Epic 4 provide:

-   Agent Runtime
-   Workflow Engine
-   Tool Center
-   Provider Framework
-   Amazon Store Data Foundation
-   Workspace Isolation
-   HITL
-   Checkpoint

The remaining gap is:

Real Commerce Data → Business Understanding → Decision → Recommendation
→ Action

V9.2 upgrades CrossPilot from an AI tool platform into a Commerce
Intelligence Platform.

------------------------------------------------------------------------

# 2. Overall Architecture

    User
     |
    Scenario Router
     |
    Playbook Engine
     |
    Workflow Runtime
     |
    Tool Center
     |
    Provider Layer


    Data Layer:

    Amazon / Shopify / TikTok
     |
    Commerce Domain Model
     |
    Fact Layer
     |
    Evidence Layer
     |
    Recommendation Layer

------------------------------------------------------------------------

# 3. Core New Modules

## Playbook Framework

Purpose:

Convert ecommerce SOP into machine-readable business workflows.

Relationship:

    Scenario
       ↓
    Playbook
       ↓
    Workflow
       ↓
    Tool

Playbook is not:

-   Prompt
-   Agent
-   Workflow

It is a business execution definition.

------------------------------------------------------------------------

## Fact Layer

Goal:

Do not let LLM directly reason from raw data.

Flow:

    Raw Data
     ↓
    Fact Extraction
     ↓
    Structured Facts
     ↓
    Decision

Example:

``` json
{
 "fact_id":"FACT_PRICE_MEDIAN",
 "metric":"competitor_price_median",
 "value":29.99,
 "source":"amazon_listing"
}
```

------------------------------------------------------------------------

## Evidence Layer

All important conclusions require evidence.

Bad:

    This product has opportunity.

Good:

    Decision:
    ENTER_MARKET

    Evidence:
    FACT_PRICE_MEDIAN
    FACT_REVIEW_GAP
    FACT_KEYWORD_GROWTH

------------------------------------------------------------------------

# 4. First Business Loop

Do not build dozens of skills.

First build:

## Amazon Product Research Playbook

Flow:

    Keyword / Category
     ↓
    Market Analysis
     ↓
    Competitor Analysis
     ↓
    Price Analysis
     ↓
    Keyword Analysis
     ↓
    VOC Analysis
     ↓
    Opportunity Decision
     ↓
    Listing Brief

------------------------------------------------------------------------

# 5. VOC Intelligence

Input:

-   Amazon Reviews
-   Listing Data
-   Customer Feedback

Process:

    Cleaning
     ↓
    Classification
     ↓
    Topic Extraction
     ↓
    Pain Point Analysis
     ↓
    Fact Generation

Output:

-   Product Improvement
-   Listing Improvement
-   Creative Brief
-   Customer Service Knowledge

------------------------------------------------------------------------

# 6. V9.2 Phases

## Phase 1

Playbook Framework

## Phase 2

Fact / Evidence Engine

## Phase 3

Amazon Product Research

## Phase 4

VOC Intelligence

## Phase 5

Recommendation Center

------------------------------------------------------------------------

# 7. Explicitly Not Doing

V9.2 does not include:

-   Amazon Write API
-   Auto price changes
-   Auto listing updates
-   Auto advertising optimization
-   Complex RPA execution

First establish:

Data → Intelligence → Decision

Then:

Decision → Action
