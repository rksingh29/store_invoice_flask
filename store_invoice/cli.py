"""Command line entry point:  store-invoice [--port 5000] [--db PATH] ..."""

import argparse
import os
import threading
import webbrowser

from . import __version__


def main(argv=None):
    parser = argparse.ArgumentParser(prog="store-invoice",
                                     description="Store Invoice & Purchase Order Tracker")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"),
                        help="address to listen on (default 127.0.0.1; use 0.0.0.0 for other devices)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5000")),
                        help="port (default 5000)")
    parser.add_argument("--db", help="SQLite database file (default: STORE_INVOICE_DB or the user data folder)")
    parser.add_argument("--no-browser", action="store_true", help="do not open the web browser")
    parser.add_argument("--debug", action="store_true", help="Flask debug mode (development only)")
    parser.add_argument("--version", action="version", version="%(prog)s " + __version__)
    args = parser.parse_args(argv)

    if args.db:
        os.environ["STORE_INVOICE_DB"] = args.db

    # Imported here so --db is applied before the database is opened.
    from .app import DB_PATH, app

    url = "http://%s:%d" % ("127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host, args.port)
    print("Store Invoice Tracker %s" % __version__)
    print("  Database : %s" % DB_PATH)
    print("  Open     : %s" % url)
    print("  Stop     : press Ctrl+C")
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    app.run(host=args.host, port=args.port, debug=args.debug, use_reloader=False)


if __name__ == "__main__":
    main()
