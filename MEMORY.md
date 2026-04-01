# NPI Lookup Tool — Memory

_Last updated: 2026-04-01_

## Version History
<!-- Track notable changes between versions here. -->

- **v2.4** — Desktop `.exe`, added 2026-03-11. No Humana check in this version.
- **v2.5** — HTML app (`index.html` + `NPI Lookup V2.5.html`). Added Humana FHIR badge. Used `Practitioner?identifier=NPI` — queried the wrong resource, returned 0 for all providers.
- **v2.6** — Fixed Humana check (2026-04-01). Switched to two-step FHIR lookup: (1) `Practitioner?identifier=NPI` → get internal Humana FHIR ID, (2) `PractitionerRole?practitioner=Practitioner/{id}` → get network list, filter for Medicare. Badge text updated to "Humana Medicare". Round-trip ~380ms. Confirmed working with NPI 1245332972 (Dr. Laura Laffineuse).

## Notes

- Humana FHIR endpoint: `https://fhir.humana.com/api/` (proxied via Cloudflare Worker at `humana-fhir-proxy.npilookuptool.workers.dev`)
- Humana's FHIR Practitioner directory has ~1.2M providers — not all in-network providers are indexed. Providers not in the FHIR directory will not show a badge (data gap on Humana's side, not a code bug).
- NPI 1861650590 (Dr. Marcus Babaoff) confirmed absent from Humana FHIR directory as of 2026-04-01 despite being in-network per Justin. Likely a Humana data gap.
- `PractitionerRole?practitioner.identifier` chained search scans 23M records and always times out (>30s). Never use it. Two-step approach is the correct method.
- **Upcoming features** (discussed 2026-04-01): search history (persistent across sessions), clickable doctor cards showing full Humana plan participation detail.
