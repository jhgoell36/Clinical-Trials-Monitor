# Materialising the held files for TRAX

This dossier was generated in a network-restricted container where
`data.sec.gov`, EuropePMC, ClinicalTrials.gov, and company websites are
blocked (HTTP 403). The narrative, catalogues, and `sources.md` URLs are
real; only the binary downloads (`filings/`, `presentations/`,
`literature/`) were deferred.

To download the actual filing/poster/literature files into this folder,
run the generator where those hosts are reachable (your machine, or a
network-enabled environment):

```bash
cd clinical_trials_monitor
pip install -r dossier/requirements.txt
python -m dossier TRAX --cik 2091349 --ir https://www.firsttracksbio.com
```

Or from the running web app: open the **Dossier** tab, enter `TRAX`,
expand **Advanced**, set CIK `2091349` and IR URL
`https://www.firsttracksbio.com`, then **Build Dossier**. The
`--cik` override is needed only because TRAX is a brand-new (April 2026)
registrant that may not yet be in the bundled `server/sec_tickers.json`
snapshot; once SEC's live `company_tickers.json` lists it, the bare
`python -m dossier TRAX` works without overrides.

Each run overwrites this ticker's folder. SEC requires a contact in the
User-Agent — set `DOSSIER_SEC_CONTACT="you@example.com"` before running.
