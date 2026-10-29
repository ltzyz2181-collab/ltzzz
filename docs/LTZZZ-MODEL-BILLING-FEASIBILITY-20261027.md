# LTZZZ wallet → model service billing: feasibility, no payment

Parent task: `PLAN-PATCHGATE-ESCROW-20261023`. Recorded 2026-10-27 UTC.
GPT/OpenAI research; this is not a purchase, approval, wallet action or a claim of
OpenAI/Anthropic account eligibility. No credentials, card details or wallet keys
were read. No native paid GPT/Claude API was called or scheduled.

## Official payment facts read this round

- [OpenAI API prepaid billing](https://help.openai.com/en/articles/8264644-how-can-i-set-up-prepaid-billing): minimum initial purchase $5; API credits and account limits are separate. Auto-reload may be on by default during setup; this project has not enabled it.
- [OpenAI card declines](https://help.openai.com/en/articles/7232916-why-was-my-credit-card-declined): API credits require an ordinary credit/debit card; prepaid cards are not supported for that purchase. Supported service location and card-issuance country matter; balance alone cannot establish eligibility.
- [Claude API billing](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage): Console prepaid credits and billing-role access. Some organizations have invoiced arrangements. Subscription benefits and API credit eligibility must be checked for the actual plan; a subscription is not automatically an API payment receipt.
- [Claude payment methods](https://support.claude.com/en/articles/9402418-why-was-my-card-declined): credit/debit cards; ACH for specified invoiced/self-serve Enterprise accounts. Real billing address and supported origin/location matter.

These inspected checkout descriptions do **not establish a direct USDC deposit
rail** for either original provider. Do not send funds to an address advertised
as an unofficial “GPT/Claude recharge.” No such recipient has been verified.

Regional references: [OpenAI API countries](https://developers.openai.com/api/docs/supported-countries),
[Anthropic supported regions](https://www.anthropic.com/supported-countries).
The retrieved lists did not list mainland China. The latter page also returned a
published-date metadata value of 2026-11-12, later than this task date, so it is
not evidence for dating a policy change on 2026-10-27. Actual operator/company
eligibility needs official confirmation before spending. A foreign card or billing
address does not by itself establish eligibility. No region or identity was changed.

## A possible legitimate funding chain, conditional on eligibility

1. Confirm the actual LTZZZ operator/entity can use the chosen original service and
   owns the relevant organization/billing role. If not established, keep funding blocked.
2. If eligible, project wallet funds could be converted through a lawful supported
   off-ramp into the entity's controlled bank balance. Conversion is a separate,
   currently unexecuted financial operation, with its own fees and accounting.
3. Use an officially accepted ordinary card or applicable invoice/bank-transfer
   method to purchase the intended API credits. A prepaid/crypto card must not be
   presumed acceptable merely because it has a Visa/Mastercard number.
4. Match the provider invoice, exact organization and balance increase before
   recording funded status. An API health response is not a billing receipt.
5. Keep provider keys in the approved cloud service. Credit purchase, native model
   call, independent response attestation and payment-role signing admission remain
   distinct facts. An external Claude planning PR can continue without paid API.

Initial consideration could be a one-time $5 OpenAI credit purchase if the actual
checkout and eligibility permit it; choose Claude's amount only from its actual
checkout. This is a proposal, not authority to add a payee, move funds or enable
auto-reload. Existing narrower financial limits, purpose/payee allowlists and exact
currency/fee accounting still apply. The project's new small-payment rail remains
off; a USDC payment policy cannot authorize a card charge by pretending it is the
same payment rail.

Current outcome: funding path identified only in principle. No card/payee or
off-ramp was validated, no amount was converted or charged, no API balance was
credited, and no funds/signature/control setting changed. `paid=false`, `tx_hash=null`.
