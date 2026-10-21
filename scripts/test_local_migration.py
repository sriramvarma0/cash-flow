import os
import sys
import sqlite3
import re
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(".")
MIGRATIONS_DIR = os.path.join(ROOT_DIR, "backend", "prisma", "migrations")
EXPORT_SQL_PATH = os.path.join(ROOT_DIR, "data", "d1-data-export.sql")
SOURCE_DB_PATH = os.path.join(ROOT_DIR, "data", "dev.db")
DISPOSABLE_DB_PATH = os.path.join(ROOT_DIR, "scratch_disposable_test.db")

def sanitize_sql_for_d1(sql):
    return re.sub(r'^\s*PRAGMA\s+foreign_keys\s*=\s*(OFF|ON);?', '-- [D1] skipped foreign_keys pragma', sql, flags=re.IGNORECASE | re.MULTILINE)

def test_migration_and_export():
    print("=" * 70)
    print("  Testing Schema Creation & Data Import Locally (Phase 2 Validation)")
    print("=" * 70)
    
    if os.path.exists(DISPOSABLE_DB_PATH):
        try:
            os.remove(DISPOSABLE_DB_PATH)
        except Exception:
            pass
            
    print(f"Creating isolated disposable SQLite database: {DISPOSABLE_DB_PATH}")
    conn = sqlite3.connect(DISPOSABLE_DB_PATH)
    cur = conn.cursor()
    
    # 1. Apply all 9 Prisma migrations in chronological order
    mig_entries = sorted([
        d for d in os.listdir(MIGRATIONS_DIR)
        if os.path.isdir(os.path.join(MIGRATIONS_DIR, d)) and not d.startswith(".")
    ])
    
    print(f"\nStep 1: Applying {len(mig_entries)} schema migrations in chronological order...")
    for mig_name in mig_entries:
        sql_path = os.path.join(MIGRATIONS_DIR, mig_name, "migration.sql")
        if not os.path.exists(sql_path):
            continue
        with open(sql_path, "r", encoding="utf-8") as f:
            raw_sql = f.read()
        sanitized_sql = sanitize_sql_for_d1(raw_sql)
        print(f"  - Applying migration: {mig_name}")
        cur.executescript(sanitized_sql)
        
    conn.commit()
    print("✅ All 9 Prisma schema migrations applied successfully to disposable database.")

    # 1b. Apply missing DDL diff for 2FA, adminIds, and InvestmentTransaction
    diff_ddl = """
    CREATE TABLE IF NOT EXISTS "InvestmentTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "type" TEXT NOT NULL DEFAULT 'BUY',
        "units" REAL NOT NULL,
        "price" REAL NOT NULL,
        "amount" REAL NOT NULL,
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "investmentId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "InvestmentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "InvestmentTransaction_investmentId_idx" ON "InvestmentTransaction"("investmentId");
    CREATE INDEX IF NOT EXISTS "InvestmentTransaction_userId_idx" ON "InvestmentTransaction"("userId");

    -- Add missing User and Group columns if not present
    PRAGMA defer_foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS "new_Group" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ownerId" TEXT NOT NULL,
        "adminIds" TEXT NOT NULL DEFAULT '[]',
        CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    INSERT INTO "new_Group" ("createdAt", "id", "name", "ownerId") SELECT "createdAt", "id", "name", "ownerId" FROM "Group";
    DROP TABLE "Group";
    ALTER TABLE "new_Group" RENAME TO "Group";

    CREATE TABLE IF NOT EXISTS "new_User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "phoneNumber" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
        "twoFactorSecret" TEXT,
        "twoFactorTempSecret" TEXT,
        "twoFactorRecoveryCodes" TEXT,
        "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
        "lockoutUntil" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "phoneNumber") SELECT "createdAt", "email", "id", "name", "passwordHash", "phoneNumber" FROM "User";
    DROP TABLE "User";
    ALTER TABLE "new_User" RENAME TO "User";
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
    PRAGMA defer_foreign_keys=OFF;
    """
    cur.executescript(diff_ddl)
    conn.commit()
    print("✅ Schema alignment DDL (InvestmentTransaction, 2FA, adminIds) applied.")
    
    # 2. Execute the data import script
    print(f"\nStep 2: Executing data import script ({EXPORT_SQL_PATH})...")
    with open(EXPORT_SQL_PATH, "r", encoding="utf-8") as f:
        export_sql = f.read()
        
    cur.executescript(export_sql)
    conn.commit()
    print("✅ Data import script executed successfully without syntax or execution errors.")
    
    # 3. Check integrity and foreign keys
    cur.execute("PRAGMA integrity_check;")
    integrity = cur.fetchone()[0]
    print(f"\nStep 3: Database Integrity Check: {integrity}")
    if integrity != "ok":
        conn.close()
        raise RuntimeError(f"Integrity check failed: {integrity}")
        
    cur.execute("PRAGMA foreign_key_check;")
    fk_violations = cur.fetchall()
    print(f"Foreign Key Violations Check:     {len(fk_violations)} violations")
    if fk_violations:
        conn.close()
        raise RuntimeError(f"Foreign key violations detected: {fk_violations}")
        
    # 4. Compare row counts against source database
    src_conn = sqlite3.connect(f"file:{SOURCE_DB_PATH}?mode=ro", uri=True)
    src_cur = src_conn.cursor()
    
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    tables = [r[0] for r in cur.fetchall()]
    
    print("\nStep 4: Table-by-Table Row Count Verification:")
    print(f"{'Table Name':<28} | {'Source Rows':<12} | {'Imported Rows':<13} | {'Status':<8}")
    print("-" * 70)
    
    all_match = True
    for tbl in tables:
        src_cur.execute(f'SELECT count(*) FROM "{tbl}";')
        s_cnt = src_cur.fetchone()[0]
        cur.execute(f'SELECT count(*) FROM "{tbl}";')
        i_cnt = cur.fetchone()[0]
        
        status = "MATCH" if s_cnt == i_cnt else "MISMATCH"
        if status != "MATCH":
            all_match = False
        print(f"{tbl:<28} | {s_cnt:<12} | {i_cnt:<13} | {status:<8}")
        
    print("-" * 70)
    src_conn.close()
    conn.close()
    
    # Clean up disposable database
    try:
        os.remove(DISPOSABLE_DB_PATH)
        print("\nCleaned up disposable test database.")
    except Exception:
        pass
        
    if not all_match:
        raise RuntimeError("Row count mismatch between source and imported database!")
        
    print("\n" + "=" * 70)
    print("✅ LOCAL VALIDATION PASSED: 100% of tables and records imported cleanly!")
    print("=" * 70)

if __name__ == "__main__":
    test_migration_and_export()
