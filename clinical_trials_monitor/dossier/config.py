"""Static configuration and tunables for the dossier pipeline."""

import os

# SEC requires a descriptive User-Agent that includes a contact address.
# Override via env so deployers can put their own contact in.
SEC_CONTACT = os.environ.get(
    "DOSSIER_SEC_CONTACT", "Clinical Trials Monitor dossier-bot (contact@example.com)"
)
USER_AGENT = SEC_CONTACT

# Endpoints
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"
EUROPEPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
EUROPEPMC_FULLTEXT = (
    "https://www.ebi.ac.uk/europepmc/webservices/rest/{source}/{pmcid}/fullTextXML"
)
CTGOV_STUDIES = "https://clinicaltrials.gov/api/v2/studies"

# Filing form types we consider material for an "up to speed" dossier.
FILING_FORMS = [
    "10-K", "10-K/A", "10-Q", "10-Q/A",
    "8-K", "8-K/A",
    "S-1", "S-1/A", "F-1", "F-1/A",
    "424B3", "424B4", "424B5",
    "DEF 14A", "DEFA14A",
    "20-F", "40-F", "6-K",
    "10", "10-12B", "10-12G",  # Form 10 registration (spin-offs)
    "SC 13D", "SC 13G",
]

# How many of each filing form to actually download (most recent first).
MAX_PER_FORM = int(os.environ.get("DOSSIER_MAX_PER_FORM", "4"))
# Hard ceiling on total filings downloaded.
MAX_FILINGS = int(os.environ.get("DOSSIER_MAX_FILINGS", "30"))
# Number of literature records to pull.
MAX_LITERATURE = int(os.environ.get("DOSSIER_MAX_LITERATURE", "25"))
# Max presentation/poster documents to download from the IR site.
MAX_PRESENTATIONS = int(os.environ.get("DOSSIER_MAX_PRESENTATIONS", "30"))

# Politeness: SEC tolerates <= 10 req/s; we stay well under.
REQUEST_DELAY_SEC = float(os.environ.get("DOSSIER_REQUEST_DELAY", "0.3"))
HTTP_TIMEOUT = int(os.environ.get("DOSSIER_HTTP_TIMEOUT", "30"))
HTTP_RETRIES = int(os.environ.get("DOSSIER_HTTP_RETRIES", "4"))

# Bundled ticker->CIK fallback shipped with the Node server.
BUNDLED_TICKERS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "server", "sec_tickers.json",
)

# Keywords that mark a link on an IR site as a deck / poster / scientific doc.
PRESENTATION_HINTS = [
    "presentation", "poster", "slide", "deck", "investor", "corporate",
    "scientific", "publication", "webcast", "fact sheet", "factsheet",
    "jpm", "asco", "ash", "aacr", "esmo", "data", "rd-day", "r&d",
]
IR_PATH_HINTS = [
    "investor", "investors", "ir", "news", "events", "presentations",
    "publications", "science", "pipeline", "media", "press",
]
