# Legal and safeguarding documents

**Status: DRAFTS. None of these has been reviewed by a lawyer, and none is published.**

They were written from what the codebase actually does — the tables in
`supabase/migrations/`, the processors in `src/lib/`, and the AI calls in
`src/app/api/ai/` — rather than from a template, so the factual content should be
close. The legal conclusions are not mine to make.

| Document | Covers |
|---|---|
| [privacy-policy.md](privacy-policy.md) | What is collected, why, who it is shared with, what rights people have |
| [terms-of-service.md](terms-of-service.md) | The agreement with the user, acceptable use, AI-output disclaimer, liability |
| [data-retention-and-deletion.md](data-retention-and-deletion.md) | How long each category is kept, and the deletion workflow |
| [children-and-safeguarding.md](children-and-safeguarding.md) | Age limits, parental consent, the Children's Code, safeguarding escalation |

## Every `[SQUARE BRACKET]` is a fact only you can supply

Company name, registered address, ICO registration number, DPO or contact address,
governing law, and the choice of Supabase/AI region. They are deliberately left
blank rather than guessed — a privacy policy naming the wrong legal entity is worse
than no privacy policy.

## Before any of this goes near a school

These are the gaps the documents describe but the code does not yet implement.
Writing the policy does not make them true:

1. **No account deletion exists.** `data-retention-and-deletion.md` specifies the
   workflow; nothing in the app performs it. A user cannot currently delete their
   account or export their data, which UK GDPR Articles 17 and 20 require.
2. **No age gate exists.** Nothing at signup collects or checks a date of birth,
   so nothing distinguishes a 12-year-old from a teacher.
3. **No parental-consent flow for under-13s.** `parent_links` is a *visibility*
   feature — a parent watching a child's progress. It is not consent capture, and
   the two should not be confused.
4. **Retention is unbounded.** Nothing expires. Every row written since launch is
   still there, which contradicts any retention schedule that gets published.
5. **Student free text reaches a third-party LLM.** Blurts, answers, and uploaded
   source material are sent to the configured AI provider (`src/lib/ai/config.ts`,
   default `api.openai.com`). This needs a data-processing agreement with that
   provider and a clear disclosure, and it is the single biggest thing a school's
   DPO will ask about.
6. **No DPIA.** Processing children's data at scale for a public-facing education
   service is very likely to require a Data Protection Impact Assessment before
   launch, not after.

## Jurisdictions

The product targets the UK and India, which are not one regime:

- **UK** — UK GDPR + Data Protection Act 2018, and the ICO's *Age Appropriate
  Design Code* (the "Children's Code"), which applies to any service likely to be
  accessed by children. Schools are typically the **data controller** and AIDemic
  the **processor**, which changes who owes what.
- **India** — the Digital Personal Data Protection Act 2023 treats **anyone under
  18** as a child and requires *verifiable* parental consent, and it prohibits
  behavioural monitoring and targeted advertising directed at children. This is a
  materially higher bar than the UK's 13, and the current signup flow meets
  neither.
