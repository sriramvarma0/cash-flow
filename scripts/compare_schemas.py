import sqlite3
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(".")
MIGRATIONS_DIR = os.path.join(ROOT_DIR, "backend", "prisma", "migrations")
SOURCE_DB = os.path.join(ROOT_DIR, "data", "dev.db")

mem_conn = sqlite3.connect(":memory:")
mem_cur = mem_conn.cursor()

mig_dirs = sorted([d for d in os.listdir(MIGRATIONS_DIR) if os.path.isdir(os.path.join(MIGRATIONS_DIR, d)) and not d.startswith(".")])
for m in mig_dirs:
    sql_path = os.path.join(MIGRATIONS_DIR, m, "migration.sql")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
    sanitized = re.sub(r'^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|ON);?', '-- pragma', sql, flags=re.I|re.M)
    mem_cur.executescript(sanitized)

mem_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
mem_tables = set(r[0] for r in mem_cur.fetchall())

src_conn = sqlite3.connect(f"file:{SOURCE_DB}?mode=ro", uri=True)
src_cur = src_conn.cursor()
src_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
src_tables = set(r[0] for r in src_cur.fetchall())

print("=" * 70)
print("=== SCHEMA COMPARISON: Migrations vs data/dev.db ===")
print("=" * 70)

all_tables = sorted(mem_tables.union(src_tables))
drift_detected = False

for t in all_tables:
    mem_cols = {}
    if t in mem_tables:
        mem_cur.execute(f'PRAGMA table_info("{t}");')
        mem_cols = {c[1]: c[2] for c in mem_cur.fetchall()}
    src_cols = {}
    if t in src_tables:
        src_cur.execute(f'PRAGMA table_info("{t}");')
        src_cols = {c[1]: c[2] for c in src_cur.fetchall()}
    
    missing_in_migrations = set(src_cols.keys()) - set(mem_cols.keys())
    missing_in_source = set(mem_cols.keys()) - set(src_cols.keys())
    
    if missing_in_migrations or missing_in_source:
        drift_detected = True
        print(f"\nTable: {t}")
        if missing_in_migrations:
            print(f"  ❌ Columns missing in Migrations (present in dev.db):")
            for col in sorted(missing_in_migrations):
                print(f"     - {col} ({src_cols[col]})")
        if missing_in_source:
            print(f"  ❌ Columns missing in dev.db (present in Migrations):")
            for col in sorted(missing_in_source):
                print(f"     - {col} ({mem_cols[col]})")
    else:
        print(f"Table: {t:<25} -> 100% Column Match ({len(mem_cols)} columns)")

if not drift_detected:
    print("\n✅ Perfect Schema Match! Zero drift between migrations and dev.db.")
else:
    print("\n⚠️ SCHEMA DRIFT DETECTED!")
