"""Run from the source folder without installing:  python app.py

Keeps the database next to this file (store_invoice.db) unless STORE_INVOICE_DB is set.
After `pip install`, use the `store-invoice` command instead.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("STORE_INVOICE_DB", os.path.join(HERE, "store_invoice.db"))
sys.path.insert(0, HERE)

from store_invoice.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
