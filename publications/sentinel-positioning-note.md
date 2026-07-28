# Sentinel — A Methods & Positioning Note

**Christopher I. V. Farmer, LL.M. (University of Worcester) · Independent Researcher · civfarmer@gmail.com**

*Positioning note. Version 1.0, July 2026. Companion to the Sentinel readiness assessor. Law stated as-of July 2026. Decision-support, not legal advice.*

> **Scope note.** This note explains what Sentinel is, how it reaches its conclusions, and — just as importantly — what it is *not*. Sentinel is an offline decision-support instrument, not a legal adviser and not an official export-control authority. Every position it takes is dated and labelled; none of it should be relied upon without confirming the current primary sources.

---

## The problem: two legal questions, answered in one pass

Any serious AI or autonomous-system programme has to satisfy two distinct bodies of law that are almost never assessed together. The first asks whether it is **lawful to build and use** the system — its risk tier under the EU AI Act (Regulation (EU) 2024/1689) and the obligations that tier triggers. The second asks whether it is **lawful to move** the system, its source, its model weights, or its underlying compute across a border — the EU Dual-Use Regulation (Regulation (EU) 2021/821) and the Wassenaar Arrangement control lists it implements, with US EAR/ITAR exposure layered on top.

In practice these are handled by different teams, different advisers, and different timelines, and the seam between them is exactly where a compliant-looking product becomes an unlawful export — or where an export-cleared item quietly breaches a prohibited-practice rule. Sentinel's premise is that the two questions draw on almost identical inputs — what the system does, its data and autonomy, its sectors, and the jurisdictions of build and use — and can therefore be answered together, in a single structured pass, early enough to change the design.

## The method: a deterministic rules engine

Sentinel is not a model and makes no probabilistic prediction. It is a **deterministic rules engine** — a set of pure functions that map a structured description of a deployment onto the applicable legal categories, byte-for-byte reproducibly and entirely offline, with no network calls. The AI Act classifier walks Article 5 (prohibited practices), Annex III and Annex I (high-risk), and Article 50 (limited-risk transparency), returning exactly one of four tiers — *prohibited*, *high-risk*, *limited-risk*, *minimal-risk* — together with the specific article or annex that fired. A parallel export screen tests the same facts against the Dual-Use Regulation's Article 4 general catch-all and Article 5 cyber-surveillance catch-all, the Annex I control-list categories, and the Wassenaar Category 3/4/5 controls, with an honest, unresolved flag wherever US EAR or ITAR could bite extraterritorially. The two results are combined into a single verdict — *deployable*, *deployable with controls*, *blocked*, or *more information needed* — plus an exportable, audit-ready control record.

### Every line is tagged — and dated

The engine's defining discipline is that **no assertion is left unlabelled**. Every reason it emits carries one of four tags, so the reader can always see where the law ends and the reasoning begins:

| Tag | What it means |
|---|---|
| **Legal fact** | A statement of what the instrument actually says — the article, annex, or control-list entry. |
| **Reasoned assessment** | An application of that law to the described facts — the author's judgement, not black-letter law. |
| **Verify** | A point the user must confirm against current sources before relying on it: a moving date, a US-law overlay, or a fact only the user knows. |
| **Action** | A concrete step — screen the end-user, classify the item, obtain the licence, keep the record. |

Every position is dated to **July 2026** and pinned to the **2025–26 Digital Omnibus** — the amending package adopted by the European Parliament on 16 June and the Council on 29 June 2026 and signed on 8 July 2026, which moves the Annex III high-risk obligations to 2 December 2027 and adds a new Article 5 prohibition (AI generating non-consensual intimate imagery or CSAM) from 2 December 2026. Because that package was, as of writing, *adopted but not yet in force* — awaiting Official-Journal publication — the lines that depend on it are tagged **verify**, not **legal fact**. That is the whole point of the tagging: the tool refuses to launder a pending date into a settled rule.

## The thesis: regulated by design

Sentinel's normative claim is that governance is not a disclaimer appended to a finished product but a **design layer built into it** — *regulated by design*. The same engine that classifies the system also names the controls that make the answer defensible: **meaningful human authority** (a real override, pause, and stop authority proportionate to the system's autonomy — Art 14 / Art 26); **immutable auditability** (tamper-evident event logs, decision provenance, and, where triggered, a Fundamental Rights Impact Assessment under Art 27 or a GDPR DPIA under Art 35); and **export screening wired into the control layer** rather than bolted on at the loading dock. A system built this way is not merely compliant on the day it ships — it can *prove* it was governed, which is the question a regulator or a court actually asks after the fact.

## Scope and limits

Sentinel is **decision-support, not legal advice**, and nothing it returns is an **official control classification**. It creates no lawyer–client relationship, binds no authority, and does not substitute for a formal export-control ruling (BIS / BAFA / ECJU) or a qualified legal opinion. Its outputs are only as good as the description entered; the law moves; and the **verify**-tagged lines mark exactly where the user must consult a primary source or a competent adviser before relying on the result. It is offered as a structured first pass — a way to see both legal questions at once, while the design can still be changed — not as the last word on either.

---

— *Christopher I. V. Farmer, LL.M. (University of Worcester) · Independent Researcher · civfarmer@gmail.com*
