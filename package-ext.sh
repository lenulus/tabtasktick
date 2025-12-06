#!/bin/bash

# Package script for TabTaskTick Chrome Extension
# Creates a clean zip file for Chrome Web Store submission
# Supports automatic version incrementing

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --major              Increment major version (X+1.0.0)"
    echo "  --minor              Increment minor version (X.Y+1.0)"
    echo "  --patch              Increment patch version (X.Y.Z+1) [default]"
    echo "  --set-version X.Y.Z  Set specific version before packaging"
    echo "  --no-increment       Don't increment version after packaging"
    echo "  --tag                Create git tag for the built version"
    echo "  --push               Push tag and version bump commit to remote"
    echo "  --release            Shorthand for --tag --push (full release workflow)"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   # Build and auto-increment patch version"
    echo "  $0 --major           # Increment to next major version and build"
    echo "  $0 --set-version 2.0.0  # Set version to 2.0.0 and build"
    echo "  $0 --no-increment    # Build without incrementing version"
    echo "  $0 --tag             # Build, tag, and increment version"
    echo "  $0 --release         # Build, tag, increment, commit, and push"
}

# Check for required dependencies
if ! command -v zip &> /dev/null; then
    echo "Error: zip command not found!"
    echo "Please install it using: sudo apt install zip"
    echo "Or on macOS: brew install zip"
    exit 1
fi

# Ensure dist directory exists
mkdir -p dist

# Change to the extension directory
cd tabtasktick || { echo "Error: tabtasktick directory not found"; exit 1; }

# Function to get current version from manifest.json
get_version() {
    grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4
}

# Function to set version in manifest.json
set_version() {
    local new_version=$1
    # Use sed to replace the version line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" manifest.json
    else
        # Linux
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" manifest.json
    fi
    echo "Version updated to: $new_version"
}

# Function to increment version
increment_version() {
    local version=$1
    local increment_type=$2

    # Split version into parts
    IFS='.' read -r major minor patch <<< "$version"

    case $increment_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo "Error: Unknown increment type: $increment_type"
            exit 1
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Parse command line arguments
INCREMENT_TYPE="patch"
AUTO_INCREMENT=true
SET_VERSION=""
CREATE_TAG=false
PUSH_CHANGES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --major)
            INCREMENT_TYPE="major"
            shift
            ;;
        --minor)
            INCREMENT_TYPE="minor"
            shift
            ;;
        --patch)
            INCREMENT_TYPE="patch"
            shift
            ;;
        --set-version)
            SET_VERSION="$2"
            shift 2
            ;;
        --no-increment)
            AUTO_INCREMENT=false
            shift
            ;;
        --tag)
            CREATE_TAG=true
            shift
            ;;
        --push)
            PUSH_CHANGES=true
            shift
            ;;
        --release)
            CREATE_TAG=true
            PUSH_CHANGES=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option: $1"
            echo ""
            show_usage
            exit 1
            ;;
    esac
done

# Get current version
CURRENT_VERSION=$(get_version)
echo "Current version: $CURRENT_VERSION"

# Set specific version if requested
if [ -n "$SET_VERSION" ]; then
    # Validate version format
    if [[ ! "$SET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Error: Invalid version format: $SET_VERSION"
        echo "Expected format: X.Y.Z (e.g., 1.0.0)"
        exit 1
    fi
    set_version "$SET_VERSION"
    CURRENT_VERSION=$(get_version)
fi

echo "Building TabTaskTick extension package..."
echo "Version: $CURRENT_VERSION"

# Set the output filename with version (replace dots with underscores)
VERSION_SAFE=$(echo "$CURRENT_VERSION" | tr '.' '_')
OUTPUT_FILE="../dist/tabtasktick-extension_${VERSION_SAFE}.zip"

# Remove existing zip if present
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing existing $OUTPUT_FILE..."
    rm "$OUTPUT_FILE"
fi

# Create zip with only necessary extension files
echo "Creating extension package..."
zip -r "$OUTPUT_FILE" \
    manifest.json \
    background-integrated.js \
    debug-sync.html \
    debug-sync.js \
    popup/ \
    sidepanel/ \
    dashboard/ \
    options/ \
    icons/ \
    services/ \
    lib/ \
    components/ \
    test-panel/ \
    -x "*.DS_Store" \
    -x "*/.DS_Store" \
    -x "*/tests/*" \
    -x "dashboard/test-*.html" \
    -x "dashboard/verify-*.html" \
    -x "dashboard/package.json" \
    -x "*.backup*" \
    -x "*/node_modules/*"

# Check the size
SIZE=$(ls -lah "$OUTPUT_FILE" | awk '{print $5}')
echo ""
echo "✓ Extension package created: $OUTPUT_FILE"
echo "  Size: $SIZE"
echo "  Version: $CURRENT_VERSION"

# Store the built version for tagging
BUILT_VERSION="$CURRENT_VERSION"

# Create git tag if requested
if [ "$CREATE_TAG" = true ]; then
    echo ""
    echo "Creating git tag for version $BUILT_VERSION..."
    # Go back to repo root for git operations
    cd ..
    git tag -a "v$BUILT_VERSION" -m "Release version $BUILT_VERSION"
    echo "✓ Tagged as v$BUILT_VERSION"
    cd tabtasktick
fi

# Auto-increment version after packaging
if [ "$AUTO_INCREMENT" = true ]; then
    NEW_VERSION=$(increment_version "$CURRENT_VERSION" "$INCREMENT_TYPE")
    echo ""
    echo "Auto-incrementing version ($INCREMENT_TYPE)..."
    set_version "$NEW_VERSION"
    echo "Next build will be version: $NEW_VERSION"
    
    # Commit the version bump if we're tagging or pushing
    if [ "$CREATE_TAG" = true ] || [ "$PUSH_CHANGES" = true ]; then
        echo ""
        echo "Committing version bump..."
        cd ..
        git add tabtasktick/manifest.json
        git commit -m "Bump version to $NEW_VERSION for next development cycle"
        echo "✓ Committed version bump"
        cd tabtasktick
    fi
fi

# Push changes if requested
if [ "$PUSH_CHANGES" = true ]; then
    echo ""
    echo "Pushing changes to remote..."
    cd ..
    if [ "$CREATE_TAG" = true ]; then
        git push origin main --tags
        echo "✓ Pushed commits and tags"
    else
        git push origin main
        echo "✓ Pushed commits"
    fi
    cd tabtasktick
fi

echo ""
echo "The package is ready for:"
echo "  • Chrome Web Store submission"
echo "  • Sideloading via chrome://extensions (Developer mode)"

if [ "$CREATE_TAG" = true ]; then
    echo ""
    echo "Release tag created: v$BUILT_VERSION"
fi
