# Children's Data and Safeguarding

> **DRAFT — not legally reviewed. The controls below are mostly NOT IMPLEMENTED.**
> See [README.md](README.md).

AIDemic is a revision product for GCSE, A-Level, CBSE, ICSE/ISC, IB and Indian
entrance-exam students. **Its users are overwhelmingly children.** That is not an
edge case to handle later; it is the core user base, and it changes what the
product is obliged to do.

## The two regimes are not the same

| | UK | India |
|---|---|---|
| Framework | UK GDPR + DPA 2018 + ICO *Age Appropriate Design Code* | DPDP Act 2023 |
| A "child" is | Under 13 for consent to information society services | **Under 18** |
| Parental consent | Required under 13 | Required for **everyone under 18**, and must be **verifiable** |
| Behavioural monitoring / targeted ads at children | Restricted | **Prohibited** |

The Indian bar is the binding one. A 16-year-old CBSE student is a child under the
DPDP Act, and the current signup flow captures no consent at all.

## What the code does today

- **No date of birth is collected.** Nothing distinguishes a 12-year-old from a
  teacher.
- **No age gate, anywhere.**
- **No parental consent capture.** `parent_links` is a *visibility* feature — a
  parent watching a child's progress, which the student accepts or declines. It is
  **not** consent to processing, and must not be presented as if it were.
- **No content moderation** on free-text fields (blurts, answers, notes).
- **No safeguarding disclosure route** for a child who writes something concerning.

## Required before launch to under-18s

1. **Neutral age screen at signup.** Collect date of birth without nudging toward
   an older age. Store the age band, not just the raw date.
2. **Branch on age and country.** Under 13 (UK) or under 18 (India) → parental
   consent before the account becomes usable.
3. **Verifiable parental consent.** A checkbox is not verification. Options: a
   confirmation email to a parent address with a token, a nominal card
   authorisation, or — for school deployments — the school acting as controller
   under its own lawful basis.
4. **High-privacy defaults.** The Children's Code requires the most protective
   settings by default: no unnecessary data collection, no nudging toward weaker
   privacy, profiling off unless there is a compelling reason.
5. **Child-facing privacy information.** A short, plain-language version a
   12-year-old can actually read, alongside the full policy.
6. **DPIA.** Almost certainly required. Complete it before launch.
7. **Moderation and escalation** for free-text fields — see below.

## Profiling — the part that needs a decision

AIDemic profiles students by design: `student_subtopic_mastery`, `mastery_events`,
`misconceptions`, `topic_confidence` and predicted grades together form a detailed
picture of a child's academic ability and weaknesses.

Under the Children's Code, profiling should be **off by default** unless there is a
compelling reason in the child's interests and there are protections against
harmful effects. The defensible position is that this profiling *is* the service —
a revision coach that cannot tell what you are weak at is not a revision coach —
and that it is in the child's interest.

That argument has to be **written down in the DPIA**, and it has limits:

- It justifies profiling **for the student's own learning**. It does not
  automatically justify surfacing the same profile to a parent or a teacher.
- Predicted grades are sensitive. A predicted grade shown to a parent can cause
  real harm at home. Consider whether parents should see grade *predictions* or
  only *effort and completion*.
- It never justifies using the profile for advertising or commercial targeting,
  which the DPDP Act prohibits outright for children.

## Safeguarding

**AIDemic is not a safeguarding system and must not be presented as one.** It has
no duty of care that substitutes for a school's, and no monitoring capability.

But children write free text into blurts, notes and answers, and some of it will
disclose harm — self-harm, abuse, suicidal ideation. This needs a defined route
before launch, not after the first incident:

1. **Decide whether to scan.** Scanning children's free text is itself intrusive
   and needs its own justification. Not scanning means disclosures pass unseen. It
   is a genuine trade-off and the decision belongs in the DPIA either way.
2. **If a disclosure is seen** — by a teacher using the product, or by staff during
   support — route it to the **school's Designated Safeguarding Lead**, who owns
   the response. For direct-to-consumer accounts with no school, there is no DSL,
   which is a strong argument for launching school-first.
3. **Never** let a support conversation become the child's only disclosure route.
4. **Publish signposting** in-app: Childline (0800 1111), Samaritans (116 123),
   and Indian equivalents (**[TELEMANAS 14416 / KIRAN 1800-599-0019 — confirm]**).
5. **Train anyone with data access** on recognising and escalating a disclosure,
   and record that training.

## Schools

When a school deploys AIDemic, the school is the **controller** and AIDemic the
**processor**. That requires, before any pupil data is processed:

- A written **data processing agreement** (UK GDPR Art. 28).
- A **privacy notice** the school issues to parents — schools generally rely on
  public task rather than consent, which is why the school must be the controller.
- Clear statements on **sub-processors** (especially the AI provider), **retention**,
  **deletion on contract end**, and **breach notification timelines**.
- Answers to the DfE's expectations for edtech suppliers.
- A completed supplier security questionnaire — expect to be asked.

**Do not onboard a school before the account deletion workflow in
[data-retention-and-deletion.md](data-retention-and-deletion.md) exists.** "Delete
our pupils' data at contract end" is a standard clause, and there is currently no
way to honour it.
