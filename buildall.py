"""Build and install Store Invoice Tracker in one step.

    python buildall.py              build with uv, install into ./.venv, verify
    python buildall.py --system     install into the Python running this script instead of a venv
    python buildall.py --run        ...and start the app afterwards

Steps: check Python -> get uv -> uv build (wheel + sdist into dist/) -> create venv
-> install the wheel and its dependencies -> smoke test -> check Tesseract (OCR).
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
PACKAGE = "store-invoice-tracker"
MIN_PY = (3, 9)
TESSERACT_WINDOWS = (r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                     r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe")

SMOKE_TEST = r"""
import os, sys, tempfile
os.environ["STORE_INVOICE_DB"] = os.path.join(tempfile.mkdtemp(), "smoke.db")
import store_invoice
from store_invoice.app import app
c = app.test_client()
assert c.get("/").status_code == 200, "index page"
assert c.get("/static/app.js").status_code == 200, "static files packaged"
assert c.get("/api/meta").status_code == 200, "api"
r = c.post("/api/invoices", json={"invoice_date": "2026-10-01", "invoice_no": "T1", "vendor_name": "V",
           "items": [{"particulars": "A", "rate": 10, "quantity": 2, "gst": 5}]})
assert r.status_code == 201 and r.json["totals"]["amount"] == 21.0, "save invoice"
assert c.get("/api/template").status_code == 200, "excel template"
assert c.get("/api/export").status_code == 200, "excel export"
print("smoke test passed - version", store_invoice.__version__)
"""


def step(msg):
    print("\n=== %s" % msg, flush=True)


def run(cmd, **kw):
    shown = ["<script>" if "\n" in c else ('"%s"' % c if " " in c else c) for c in cmd]
    print("  > " + " ".join(shown), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def fail(msg):
    print("\nERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def find_uv():
    exe = shutil.which("uv")
    if exe:
        return [exe]
    try:
        subprocess.run([sys.executable, "-m", "uv", "--version"], check=True, capture_output=True)
        return [sys.executable, "-m", "uv"]
    except (subprocess.CalledProcessError, OSError):
        pass
    print("  uv not found - installing it with pip ...")
    run([sys.executable, "-m", "pip", "install", "--quiet", "uv"])
    return [sys.executable, "-m", "uv"]


def venv_python(venv):
    if os.name == "nt":
        return os.path.join(venv, "Scripts", "python.exe")
    return os.path.join(venv, "bin", "python")


def venv_command(venv):
    if os.name == "nt":
        return os.path.join(venv, "Scripts", "store-invoice.exe")
    return os.path.join(venv, "bin", "store-invoice")


def find_tesseract():
    cmd = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if cmd and os.path.exists(cmd):
        return cmd
    if os.name == "nt":
        return next((p for p in TESSERACT_WINDOWS if os.path.exists(p)), None)
    return None


def main():
    ap = argparse.ArgumentParser(description="Build (uv build) and install Store Invoice Tracker.")
    ap.add_argument("--venv", default=os.path.join(HERE, ".venv"), help="virtual environment folder (default ./.venv)")
    ap.add_argument("--system", action="store_true", help="install into the current Python instead of a venv")
    ap.add_argument("--skip-build", action="store_true", help="install the existing wheel in dist/ without rebuilding")
    ap.add_argument("--no-test", action="store_true", help="skip the smoke test")
    ap.add_argument("--run", action="store_true", help="start the application after installing")
    args = ap.parse_args()
    os.chdir(HERE)

    step("1/6 Checking Python")
    print("  Python %s (%s)" % (sys.version.split()[0], sys.executable))
    if sys.version_info < MIN_PY:
        fail("Python %d.%d or newer is required." % MIN_PY)

    step("2/6 Checking uv")
    uv = find_uv()
    run(uv + ["--version"])

    if args.skip_build:
        step("3/6 Build skipped (--skip-build)")
    else:
        step("3/6 Building wheel and sdist (uv build)")
        shutil.rmtree(DIST, ignore_errors=True)
        run(uv + ["build", "--out-dir", DIST])
    wheels = sorted(glob.glob(os.path.join(DIST, "store_invoice_tracker-*.whl")), key=os.path.getmtime)
    if not wheels:
        fail("No wheel found in dist/. Run without --skip-build.")
    wheel = wheels[-1]
    print("  Built: " + os.path.relpath(wheel, HERE))
    for f in sorted(glob.glob(os.path.join(DIST, "*.tar.gz"))):
        print("  Built: " + os.path.relpath(f, HERE))

    if args.system:
        step("4/6 Installing into the current Python (--system)")
        python = sys.executable
    else:
        step("4/6 Preparing virtual environment " + args.venv)
        python = venv_python(args.venv)
        if os.path.exists(python):
            print("  Using existing virtual environment.")
        else:
            run(uv + ["venv", args.venv, "--python", sys.executable])

    step("5/6 Installing %s and dependencies" % PACKAGE)
    run(uv + ["pip", "install", "--python", python, "--reinstall-package", PACKAGE, wheel])

    if args.no_test:
        step("6/6 Smoke test skipped (--no-test)")
    else:
        step("6/6 Smoke test of the installed package")
        with tempfile.TemporaryDirectory() as tmp:  # run outside the source folder
            run([python, "-c", SMOKE_TEST], cwd=tmp)

    tess = find_tesseract()
    command = shutil.which("store-invoice") if args.system else venv_command(args.venv)
    activate = (os.path.join(args.venv, "Scripts", "activate") if os.name == "nt"
                else "source " + os.path.join(args.venv, "bin", "activate"))

    print("\n" + "=" * 64)
    print("BUILD AND INSTALL COMPLETE")
    print("=" * 64)
    print("Wheel     : %s" % os.path.relpath(wheel, HERE))
    print("            install on another PC with:  pip install %s" % os.path.basename(wheel))
    print("Start app : %s" % (command or "store-invoice"))
    if not args.system:
        print("            or activate the venv (%s) and run: store-invoice" % activate)
    print("Options   : store-invoice --port 5000 --db D:\\Data\\store_invoice.db --no-browser")
    if tess:
        print("OCR       : Tesseract found at %s" % tess)
    else:
        print("OCR       : Tesseract NOT found - Scan Invoice will not read photos until it is installed.")
        print("            Windows: https://github.com/UB-Mannheim/tesseract/wiki  (or set TESSERACT_CMD)")

    if args.run:
        print("\nStarting the application ... (Ctrl+C to stop)")
        try:
            subprocess.run([python, "-m", "store_invoice"])
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        fail("command failed with exit code %s: %s" % (e.returncode, " ".join(map(str, e.cmd))))
    except KeyboardInterrupt:
        fail("cancelled.")
