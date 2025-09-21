# TabMaster Pro Documentation

## Directory Structure

### `/docs/` - User Documentation
- `EXPORT-IMPORT.md` - Guide for export/import functionality
- `KEYBINDS.md` - Keyboard shortcuts reference
- Additional user guides and documentation

### `/docs/specs/` - Technical Specifications
Feature specifications following the Plan-Spec-Implement pattern:
- Format: `SPEC-{number}-{feature-name}.md`
- Example: `SPEC-001-command-palette.md`

Each spec includes:
- User stories and acceptance criteria
- Technical design details
- UI/UX mockups or descriptions
- Chrome API usage
- Test scenarios
- Error handling

### Spec Numbering Convention
- 001-099: Core UI features (Priority 1)
- 100-199: Visual enhancements (Priority 2)
- 200-299: Advanced features (Priority 3)
- 300-399: Professional features
- 400-499: Infrastructure/technical debt
- 500+: Future enhancements

### Adding New Documentation

1. **User Documentation**: Add to `/docs/` root
2. **Feature Specs**: Add to `/docs/specs/` with proper numbering
3. **Update TODO.md**: Add spec reference like `[Spec: SPEC-001]`

### Best Practices

- Write specs BEFORE implementation
- Include all edge cases and error scenarios
- Add visual mockups (ASCII art is fine)
- Reference Chrome API documentation
- Include performance considerations for 200+ tabs