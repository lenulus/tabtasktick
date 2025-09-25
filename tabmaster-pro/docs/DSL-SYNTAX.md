# Rules Engine DSL Syntax Guide

The Rules Engine Domain-Specific Language (DSL) provides a human-readable way to define tab management rules.

## Basic Structure

```dsl
rule "Rule Name" {
  when <condition>
  then <action>
  trigger <type>
  flags <flag1> <flag2>
}
```

## Conditions

### Simple Conditions

```dsl
when tab.age > 7d
when tab.domain == "example.com"
when tab.category in ["news", "social"]
when tab.isDupe
when tab.isPinned is false
```

### Operators

- `==` - Equals
- `!=` - Not equals
- `>`, `>=`, `<`, `<=` - Numeric comparisons
- `in` - List membership
- `is` - Boolean check
- `contains` - String contains
- `startsWith`, `endsWith` - String prefix/suffix
- `regex` - Regular expression match

### Complex Conditions

Use `and`, `or` for chaining:

```dsl
when tab.domain == "example.com" and tab.age > 1h
when tab.category == "news" or tab.category == "social"
```

Use `all()`, `any()`, `none()` for grouping:

```dsl
when all(tab.domain == "example.com", tab.age >= 1h)
when any(tab.isPinned, tab.category == "important")
when none(tab.isDupe, tab.age < 10m)
```

### Special Fields

- `tab.age` - Time since tab creation (use durations: 10m, 1h, 7d)
- `tab.isDupe` - Boolean, true if duplicate exists
- `tab.countPerOrigin:domain` - Number of tabs from same domain
- `tab.origin` - Origin domain of tab (e.g., "gmail" for tabs opened from Gmail)
- `tab.category` - Category assigned to tab
- `window.tabCount` - Number of tabs in window

## Actions

### Available Actions

```dsl
then close
then snooze for 1d
then group name "Session Name"
then group by domain
then bookmark to "Folder Name"
```

### Multiple Actions

Chain actions with `and`:

```dsl
then group by domain and snooze for 12h
then bookmark to "Archive" and close
```

## Triggers

### Trigger Types

```dsl
trigger immediate           # On tab events (debounced)
trigger onAction           # Manual execution only
trigger repeat every 30m   # Periodic execution
trigger once at "2024-03-15T14:00:00"  # Scheduled once
```

## Flags

Optional behavior modifiers:

```dsl
flags skipPinned    # Don't affect pinned tabs
flags log          # Enable detailed logging
flags immediate    # Process immediately (no delay)
```

## Complete Examples

### Timebox News Tabs

```dsl
rule "Timebox News 1h" {
  when tab.category in ["news"] and tab.age >= 1h
  then snooze for 1d
  trigger repeat every 1h
  flags log skipPinned
}
```

### Close Old Solo Windows

```dsl
rule "Close Solo Windows > 3d" {
  when window.tabCount == 1 and tab.age >= 3d
  then close
  trigger onAction
  flags immediate
}
```

### Group Gmail Spawned Tabs

```dsl
rule "Gmail Group" {
  when tab.origin == "gmail"
  then group name "Gmail Session"
  trigger immediate
}
```

### Deduplicate Tabs

```dsl
rule "Deduplicate" {
  when tab.isDupe
  then close
  trigger repeat every 30m
}
```

### Archive Research Explosions

```dsl
rule "Clamp Research Explosions" {
  when all(
    tab.countPerOrigin:domain >= 8,
    tab.age >= 2h
  )
  then group by origin and snooze for 12h
  trigger repeat every 2h
}
```

### Complex Conditions with Regex

```dsl
rule "GitHub PRs" {
  when tab.url regex /github\.com\/.*\/pull\/\d+/
  then bookmark to "GitHub PRs"
  trigger onAction
}
```

## Syntax Notes

1. **Strings** must be quoted with double quotes: `"example"`
2. **Durations** use suffixes: `m` (minutes), `h` (hours), `d` (days)
3. **Arrays** use square brackets: `["item1", "item2"]`
4. **Comments** start with `//` and continue to end of line
5. **Regex patterns** use forward slashes: `/pattern/flags`
6. **Boolean values** can be `true` or `false` (unquoted)
7. **ISO dates** for once triggers: `"YYYY-MM-DDTHH:mm:ss"`

## Import/Export

Rules can be converted between DSL and JSON formats for portability and programmatic manipulation. The DSL format is ideal for:

- Human readability and editing
- Version control and diffing
- Sharing rules with others
- Quick rule creation

While JSON format is better for:

- Programmatic generation
- API integration
- Storage and serialization
- Complex rule builders