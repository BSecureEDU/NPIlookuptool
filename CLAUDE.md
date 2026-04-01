# NPI Lookup Tool — Project Folder

This folder contains the NPI Lookup Tool, a desktop application built to query National Provider Identifier (NPI) records from the federal NPPES registry.

---

## WHAT IS AN NPI?

An NPI (National Provider Identifier) is a unique 10-digit ID number assigned to every healthcare provider in the United States. It's issued by CMS (Centers for Medicare & Medicaid Services) through a system called NPPES (National Plan and Provider Enumeration System). Providers include doctors, nurses, hospitals, clinics, and other entities that bill for healthcare services.

The NPPES registry is publicly searchable — any NPI can be looked up to retrieve the provider's name, address, specialty, taxonomy code, and other details.

---

## WHAT'S IN THIS FOLDER

| File | Description |
|------|-------------|
| `NPI Lookupv V2.4.exe` | Desktop application (Windows executable), version 2.4 — queries NPI records from the NPPES API |

---

## MEMORY SYSTEM

This folder has its own MEMORY.md, isolated from the parent Work hub. Use it for project-specific notes — version history, known issues, feature requests, or usage context.

**Memory is user-triggered only.** Only write to MEMORY.md when Justin explicitly asks.

---

## CONTEXT & USAGE

- This tool queries the public NPPES NPI Registry API (`https://npiregistry.cms.hhs.gov/api/`)
- Useful for verifying provider credentials, billing lookups, or any healthcare-adjacent work
- v2.4 indicates this has been through at least a few iterations — check MEMORY.md for version notes if any have been logged

---

## WORKSPACE GUIDELINES

- Always explain the reasoning behind any code or logic decisions — Justin wants to understand the *why*
- If modifying or extending this tool, note version changes in MEMORY.md
- Output files from this tool should follow the naming convention: `npi-lookup-[date]-[description].ext`
