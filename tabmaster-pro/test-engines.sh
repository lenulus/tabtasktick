#!/bin/bash

# Test runner for comparing different engine versions
# Usage: ./test-engines.sh [engine-version]
#   engine-version: v1, v2-services, v2-command-full, v2-command-compact, or 'all'

ENGINE="${1:-all}"

echo "================================"
echo "Engine Compatibility Test Runner"
echo "================================"
echo ""

if [ "$ENGINE" = "all" ]; then
  echo "Testing ALL engine versions..."
  echo ""

  # Test each engine version
  for engine in v1 v2-services; do
    echo "----------------------------------------"
    echo "Testing Engine: $engine"
    echo "----------------------------------------"
    TEST_ENGINE=$engine npm test -- tests/engine-compatibility.test.js --verbose 2>&1 | grep -E "(Testing:|found|created|result:|\[.*\])" | head -20
    echo ""
  done

  echo "================================"
  echo "Summary: All engines tested"
  echo "================================"
else
  echo "Testing Engine: $ENGINE"
  echo "----------------------------------------"
  TEST_ENGINE=$ENGINE npm test -- tests/engine-compatibility.test.js --verbose
fi