import os
import sys
import hashlib
import sqlite3
import json
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

SOURCE_PATH = os.path.abspath(r"data/dev.db")
BACKUPS_DIR = os.path.abspath(r"data/backups")

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def create_and_verify_backup():
    print("=" * 70)
    print("  CashFlow Database Backup & Verification (Phase 1)")
    print("=" * 70)
    
    if not os.path.exists(SOURCE_PATH):
        print(f"❌ Error: Source database not found at {SOURCE_PATH}")
        sys.exit(1)
        
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    
    # Generate unique timestamp
    now = datetime.now(timezone.utc)
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    backup_filename = f"dev.db.bak_pre_d1_migration_{timestamp_str}"
    backup_path = os.path.join(BACKUPS_DIR, backup_filename)
    
    print(f"Source Database: {SOURCE_PATH}")
    print(f"Backup Target:   {backup_path}")
    
    # 1. Inspect source database state
    source_stat = os.stat(SOURCE_PATH)
    source_sha256 = compute_sha256(SOURCE_PATH)
    print(f"Source Size:     {source_stat.st_size} bytes")
    print(f"Source SHA256:   {source_sha256}")
    
    # 2. Perform online SQLite backup using SQLite's native C backup API
    # Connect to source in read-only mode to prevent any writes to source
    source_uri = f"file:{SOURCE_PATH}?mode=ro"
    source_conn = sqlite3.connect(source_uri, uri=True)
    dest_conn = sqlite3.connect(backup_path)
    
    print("Executing safe online SQLite backup API (pages copy)...")
    source_conn.backup(dest_conn)
    dest_conn.close()
    source_conn.close()
    print("✅ Online backup completed successfully.")
    
    # 3. Inspect backup file
    backup_stat = os.stat(backup_path)
    backup_sha256 = compute_sha256(backup_path)
    print(f"Backup Size:     {backup_stat.st_size} bytes")
    print(f"Backup SHA256:   {backup_sha256}")
    
    # 4. Verify integrity of both source and backup
    src_conn = sqlite3.connect(f"file:{SOURCE_PATH}?mode=ro", uri=True)
    bak_conn = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
    
    src_cur = src_conn.cursor()
    bak_cur = bak_conn.cursor()
    
    src_cur.execute("PRAGMA integrity_check;")
    src_integrity = src_cur.fetchone()[0]
    
    bak_cur.execute("PRAGMA integrity_check;")
    bak_integrity = bak_cur.fetchone()[0]
    
    print(f"Source Integrity: {src_integrity}")
    print(f"Backup Integrity: {bak_integrity}")
    
    if bak_integrity != "ok":
        print(f"❌ FATAL: Backup integrity check failed: {bak_integrity}")
        sys.exit(1)
        
    # 5. Compare tables and row counts
    src_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    src_tables = [r[0] for r in src_cur.fetchall()]
    
    bak_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    bak_tables = [r[0] for r in bak_cur.fetchall()]
    
    if src_tables != bak_tables:
        print(f"❌ FATAL: Table list mismatch! Source: {src_tables}, Backup: {bak_tables}")
        sys.exit(1)
        
    print("\nTable-by-Table Row Count Comparison:")
    print(f"{'Table Name':<28} | {'Source Rows':<12} | {'Backup Rows':<12} | {'Status':<8}")
    print("-" * 68)
    
    total_src_rows = 0
    total_bak_rows = 0
    mismatch_found = False
    
    comparison_data = {}
    
    for tbl in src_tables:
        src_cur.execute(f'SELECT count(*) FROM "{tbl}";')
        src_cnt = src_cur.fetchone()[0]
        
        bak_cur.execute(f'SELECT count(*) FROM "{tbl}";')
        bak_cnt = bak_cur.fetchone()[0]
        
        total_src_rows += src_cnt
        total_bak_rows += bak_cnt
        
        status = "MATCH" if src_cnt == bak_cnt else "MISMATCH"
        if status != "MATCH":
            mismatch_found = True
            
        print(f"{tbl:<28} | {src_cnt:<12} | {bak_cnt:<12} | {status:<8}")
        comparison_data[tbl] = {
            "source_rows": src_cnt,
            "backup_rows": bak_cnt,
            "match": src_cnt == bak_cnt
        }
        
    print("-" * 68)
    print(f"{'TOTAL ROWS':<28} | {total_src_rows:<12} | {total_bak_rows:<12} | {'MATCH' if not mismatch_found else 'MISMATCH'}")
    
    # 6. Compare migration history
    src_cur.execute("SELECT migration_name, checksum FROM _prisma_migrations ORDER BY started_at;")
    src_migs = src_cur.fetchall()
    
    bak_cur.execute("SELECT migration_name, checksum FROM _prisma_migrations ORDER BY started_at;")
    bak_migs = bak_cur.fetchall()
    
    if src_migs != bak_migs:
        print("❌ FATAL: Migration history mismatch between source and backup!")
        sys.exit(1)
        
    print(f"\nMigration History: All {len(src_migs)} Prisma migrations match exactly.")
    
    src_conn.close()
    bak_conn.close()
    
    # Write verification report JSON alongside backup
    report_path = backup_path + ".verification.json"
    report_data = {
        "timestamp_utc": now.isoformat(),
        "source": {
            "path": SOURCE_PATH,
            "size_bytes": source_stat.st_size,
            "sha256": source_sha256,
            "integrity": src_integrity
        },
        "backup": {
            "path": backup_path,
            "size_bytes": backup_stat.st_size,
            "sha256": backup_sha256,
            "integrity": bak_integrity,
            "checksum_match": source_sha256 == backup_sha256
        },
        "tables": comparison_data,
        "total_source_rows": total_src_rows,
        "total_backup_rows": total_bak_rows,
        "migration_count": len(src_migs)
    }
    
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)
        
    print(f"\nWrote verification manifest to: {report_path}")
    print("=" * 70)
    print("✅ PHASE 1 COMPLETE: Fresh, verified backup successfully created.")
    print("=" * 70)

if __name__ == "__main__":
    create_and_verify_backup()
