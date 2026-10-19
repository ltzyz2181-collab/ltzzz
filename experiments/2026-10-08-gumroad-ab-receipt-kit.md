# LTZZZ Gumroad A/B receipt kit — draft

**State:** proposed / not launched  
**Prepared:** 2026-10-08  
**Source:** email “LTZZZ A/B receipt kit draft” (2026-10-08); project constraints in `meta.html`, `ltzzz-memory/README.md`, and `agi-co-management-protocol.md`.

> This kit is an implementation-ready draft. It does not change the live store, price, product listing, site navigation, or any video description. No exposure clock starts until an owner explicitly approves the copy and launch, and the kit is enabled.

## What the test is for

Measure the narrowest known funnel gap: owned content/site → the existing Gumroad product page. Keep one SKU, one $19 price, and one destination URL. Change only the CTA wording. Use free traffic only. Do not make health, spiritual-efficacy, or outcome guarantees.

- Existing SKU: **LTZZZ AI Agent Starter Pack**, Gumroad product slug `ugyhy`.
- Canonical destination: `https://ltzyz.gumroad.com/l/ugyhy`.
- Duration: 7 complete days from the owner-approved launch timestamp (UTC).
- Success line from the email: B has at least 5 product-page visits/clicks and exceeds A. Otherwise keep A and do not expand the offer.
- No price edits, extra storefronts, paid promotion, or additional SKU changes.

## Variants (draft copy; owner must verify claims before activation)

| Variant | Single changed element: CTA copy | `utm_content` |
|---|---|---|
| A (control) | 实验记录包 · $19 · 含当日 receipt 模板 | `a_receipt` |
| B | 身体日志和识神日志分开记的起步包 · $19 · 24h 内可下载 | `b_splitlog` |

All other page/content context, SKU, price, and destination must remain identical. In particular, verify that the actual product contains the promised receipt template and separate-log starter materials, and that delivery within 24 hours is accurate. If not verifiable, revise the copy before launch; do not imply an unverified product feature.

## Assignment and placement

- The preview implementation is `experiments/ab-receipt-kit-2026-10-08.html`.
- It uses an even client-side assignment and a first-party `localStorage` key to keep a returning browser in the same arm. The feature is **disabled by default** (`EXPERIMENT_ENABLED = false`).
- The same preview route can be linked from the site and from a video description, with `src=site` or `src=youtube` respectively. The page randomizes the CTA after arrival; it avoids treating a fixed A copy on one channel and a fixed B copy on another as a valid A/B test.
- No existing live site button or video description is changed by this PR. Owner approval is needed to enable and mount the route.

## Measurement / receipt

The `utm_content` value distinguishes A from B on the same product URL. Use Gumroad product-page traffic/referrer analytics as the primary outcome **only after a preflight confirms the UTM values survive navigation and the dashboard can report visits by variant**. Also retain the separate `src` value to distinguish site and YouTube arrivals. Do not call an unverified parameter a measured click.

If Gumroad does not expose variant-attributed product-page visits, the experiment is not measurable with this setup. Keep it proposed and select a first-party event/redirect measurement implementation before launch; do not substitute total site pageviews or sales as the click metric.

At the end of the 7-day window, fill `experiments/2026-10-08-gumroad-ab-receipt.json` with the actual start/end time, evidence source/export, visits by arm, and caveats. Do not fabricate missing data: use `null` / `not_measured`. Record any sales separately; this test is click-focused and no sales receipt is implied.

## Owner launch checklist

- [ ] Confirm this exact SKU and unchanged $19 price.
- [ ] Verify every factual claim in both CTA strings against the delivered product.
- [ ] Review and approve the A/B copy and allow the experiment to run.
- [ ] Confirm Gumroad preserves the UTM tags and reports page visits by `utm_content` (test before launch).
- [ ] Enable `EXPERIMENT_ENABLED` only after the above; publish the site route and update the two approved placements.
- [ ] Record the exact UTC start timestamp; close after 7 complete days.
- [ ] Attach the analytics evidence/export and complete the receipt JSON.
- [ ] Mark `result`, `evidence`, and `next`; keep state `proposed` until there is evidence.

## Acceptance checks

- Draft is not linked from the current site and has no live video-description change.
- Default page state says not launched; CTA is disabled while the feature flag is false.
- With the feature enabled in a local preview, A/B assignment is sticky per browser, copy is the only variable, both arms resolve to the same Gumroad slug and price, and query parameters identify arm and source.
- No API keys, store credentials, or payment actions are used.
- No deployment should be described as an experiment launch until the owner gate is completed.
