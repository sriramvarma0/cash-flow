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
OUTPUT_SQL_PATH = os.path.abspath(r"data/d1-data-export.sql")
OUTPUT_MANIFEST_PATH = os.path.abspath(r"data/d1-data-export-manifest.json")

# Strict dependency order for foreign keys
TABLE_ORDER = [
    "User",
    "Tag",
    "Group",
    "_GroupMembers",
    "Invitation",
    "Expense",
    "_ExpenseToTag",
    "Investment",
    "InvestmentTransaction",
    "_prisma_migrations"
]

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def format_sql_value(val, col_name="", col_type=""):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    # Format DateTime integer millisecond timestamps as ISO-8601 strings for Cloudflare D1 / @prisma/adapter-d1
    is_date_col = (
        col_type.upper() == "DATETIME" or
        col_name.lower() in ("createdat", "updatedat", "lockoutuntil", "date", "started_at", "finished_at", "rolled_back_at")
    )
    if is_date_col and isinstance(val, (int, float)) and val > 100000000000:
        dt = datetime.fromtimestamp(val / 1000.0, tz=timezone.utc)
        iso_str = dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        return f"'{iso_str}'"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, bytes):
        return f"X'{val.hex()}'"
    # String formatting
    s = str(val)
    # SQLite single-quote escaping: replace ' with ''
    escaped = s.replace("'", "''")
    return f"'{escaped}'"

def export_data():
    print("=" * 70)
    print("  CashFlow SQLite -> Cloudflare D1 Data Exporter (Phase 2)")
    print("=" * 70)
    
    if not os.path.exists(SOURCE_PATH):
        raise FileNotFoundError(f"Source database not found at {SOURCE_PATH}")
        
    source_uri = f"file:{SOURCE_PATH}?mode=ro"
    conn = sqlite3.connect(source_uri, uri=True)
    cur = conn.cursor()
    
    # 1. Verify integrity of source before export
    cur.execute("PRAGMA integrity_check;")
    integrity = cur.fetchone()[0]
    if integrity != "ok":
        conn.close()
        raise RuntimeError(f"Source database failed integrity check: {integrity}")
        
    # 2. Discover all tables in source database
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    existing_tables = set(r[0] for r in cur.fetchall())
    
    # Verify every required table exists
    for tbl in TABLE_ORDER:
        if tbl not in existing_tables:
            conn.close()
            raise RuntimeError(f"Required table '{tbl}' does not exist in source database!")
            
    source_sha256 = compute_sha256(SOURCE_PATH)
    now_utc = datetime.now(timezone.utc).isoformat()
    
    lines = [
        "-- ============================================================================",
        "-- CashFlow Cloudflare D1 Data Export",
        f"-- Generated At:  {now_utc}",
        f"-- Source File:   data/dev.db",
        f"-- Source SHA256: {source_sha256}",
        "-- ============================================================================",
        "",
        "-- Cloudflare D1 enforces foreign keys by default.",
        "-- Defer foreign key validation until the transaction commit boundary.",
        "PRAGMA defer_foreign_keys = ON;",
        ""
    ]
    
    manifest_tables = {}
    total_exported_rows = 0
    
    for tbl in TABLE_ORDER:
        # Introspect column info
        cur.execute(f'PRAGMA table_info("{tbl}");')
        cols_info = cur.fetchall()
        col_names = [c[1] for c in cols_info]
        col_types = {c[1]: c[2].upper() for c in cols_info}
        pk_cols = [c[1] for c in cols_info if c[5] > 0]
        
        # Determine deterministic ordering
        if pk_cols:
            order_clause = ", ".join(f'"{pk}" ASC' for pk in pk_cols)
        else:
            order_clause = ", ".join(f'"{c}" ASC' for c in col_names)
            
        quoted_cols = ", ".join(f'"{c}"' for c in col_names)
        
        query = f'SELECT {quoted_cols} FROM "{tbl}" ORDER BY {order_clause};'
        cur.execute(query)
        rows = cur.fetchall()
        
        row_count = len(rows)
        total_exported_rows += row_count
        
        lines.append(f"-- ----------------------------------------------------------------------------")
        lines.append(f"-- Table: {tbl} ({row_count} rows)")
        lines.append(f"-- ----------------------------------------------------------------------------")
        
        if tbl == "_prisma_migrations":
            lines.append("CREATE TABLE IF NOT EXISTS \"_prisma_migrations\" (")
            lines.append("    \"id\"                    TEXT PRIMARY KEY NOT NULL,")
            lines.append("    \"checksum\"              TEXT NOT NULL,")
            lines.append("    \"finished_at\"           DATETIME,")
            lines.append("    \"migration_name\"        TEXT NOT NULL,")
            lines.append("    \"logs\"                  TEXT,")
            lines.append("    \"rolled_back_at\"        DATETIME,")
            lines.append("    \"started_at\"            DATETIME NOT NULL DEFAULT current_timestamp,")
            lines.append("    \"applied_steps_count\"   INTEGER UNSIGNED NOT NULL DEFAULT 0")
            lines.append(");")
            lines.append("")

        if row_count == 0:
            lines.append(f"-- (No rows to insert for {tbl})\n")
        else:
            for row in rows:
                formatted_values = []
                for val, col_name in zip(row, col_names):
                    col_t = col_types.get(col_name, "")
                    formatted_values.append(format_sql_value(val, col_name, col_t))
                val_str = ", ".join(formatted_values)
                lines.append(f'INSERT INTO "{tbl}" ({quoted_cols}) VALUES ({val_str});')
            lines.append("")
            
        manifest_tables[tbl] = {
            "row_count": row_count,
            "columns": col_names,
            "primary_key": pk_cols
        }
        
    lines.append("-- Restore normal foreign key deferral behavior")
    lines.append("PRAGMA defer_foreign_keys = OFF;")
    lines.append("")
    
    sql_content = "\n".join(lines)
    
    os.makedirs(os.path.dirname(OUTPUT_SQL_PATH), exist_ok=True)
    with open(OUTPUT_SQL_PATH, "w", encoding="utf-8") as f:
        f.write(sql_content)
        
    export_sha256 = compute_sha256(OUTPUT_SQL_PATH)
    export_stat = os.stat(OUTPUT_SQL_PATH)
    
    manifest_data = {
        "generated_at_utc": now_utc,
        "source": {
            "file": "data/dev.db",
            "sha256": source_sha256,
            "integrity": integrity
        },
        "export": {
            "file": "data/d1-data-export.sql",
            "size_bytes": export_stat.st_size,
            "sha256": export_sha256,
            "total_statements": total_exported_rows,
            "table_order": TABLE_ORDER
        },
        "tables": manifest_tables,
        "total_rows": total_exported_rows
    }
    
    with open(OUTPUT_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)
        
    conn.close()
    
    print(f"Export Target:    {OUTPUT_SQL_PATH}")
    print(f"Export Size:      {export_stat.st_size} bytes")
    print(f"Export SHA256:    {export_sha256}")
    print(f"Manifest Path:    {OUTPUT_MANIFEST_PATH}")
    print(f"Total Tables:     {len(TABLE_ORDER)}")
    print(f"Total Rows:       {total_exported_rows}")
    print("\nTable Breakdown:")
    for tbl, meta in manifest_tables.items():
        print(f"  - {tbl:<25}: {meta['row_count']:>4} rows")
        
    print("\n✅ PHASE 2 COMPLETE: Deterministic export generated successfully.")

if __name__ == "__main__":
    export_data()
