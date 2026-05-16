"""Company research dossier generator.

Given a stock ticker, this package pulls together:
  * Financial filings directly from SEC EDGAR
  * Investor presentations and scientific posters from the company website
  * The most relevant scientific literature (EuropePMC + ClinicalTrials.gov)

and assembles a deep-research-style ~10-page Markdown summary that references
every file it downloaded into a self-contained per-ticker folder.
"""

__version__ = "1.0.0"
