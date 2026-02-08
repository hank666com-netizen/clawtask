#!/bin/bash
# verify_db.sh - Verify task status in SQLite database
# Usage: ./verify_db.sh [TASK_ID] [EXPECTED_STATUS]

set -e

# Change to project root (assume script is run from anywhere)
cd "$(dirname "$0")/.." || exit 1

# Load environment
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
else
    echo "❌ [ERROR]: .env file not found in project root"
    exit 1
fi

# Validate DATABASE_PATH
if [ -z "$DATABASE_PATH" ]; then
    echo "❌ [ERROR]: DATABASE_PATH not set in .env"
    exit 1
fi

if [ ! -f "$DATABASE_PATH" ]; then
    echo "❌ [ERROR]: Database not found at: $DATABASE_PATH"
    exit 1
fi

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: ./verify_db.sh [TASK_ID] [EXPECTED_STATUS]"
    echo "Example: ./verify_db.sh abc-123 TODO"
    exit 1
fi

TASK_ID="$1"
EXPECTED="$2"

# Query database
RESULT=$(sqlite3 "$DATABASE_PATH" "SELECT status FROM tasks WHERE id='$TASK_ID';" 2>/dev/null || echo "ERROR")

# Compare results
if [ "$RESULT" = "ERROR" ] || [ -z "$RESULT" ]; then
    echo "⚠️  [NOT FOUND]: Task ID $TASK_ID does not exist in DB."
    exit 1
elif [ "$RESULT" = "$EXPECTED" ]; then
    echo "✅ [VERIFIED]: Task $TASK_ID is now $EXPECTED."
    exit 0
else
    echo "❌ [FAILED]: Expected $EXPECTED but DB shows '$RESULT'. ERROR: Data not persisted!"
    exit 1
fi
