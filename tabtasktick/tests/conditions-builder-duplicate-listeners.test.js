/**
 * @jest-environment jsdom
 */

import { ConditionsBuilder } from '../lib/conditions-builder.js';

describe('ConditionsBuilder - Duplicate Event Listeners Bug', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('should not attach duplicate event listeners when setConditions is called multiple times', () => {
    const builder = new ConditionsBuilder(container, { all: [] });

    // Call setConditions multiple times (simulates what happens in the UI)
    builder.setConditions({ all: [{ subject: 'url', operator: 'contains', value: 'test' }] });
    builder.setConditions({ all: [{ subject: 'url', operator: 'contains', value: 'test2' }] });
    builder.setConditions({ all: [{ subject: 'url', operator: 'contains', value: 'test3' }] });

    // Find the remove button
    const removeButton = container.querySelector('.remove-condition');
    expect(removeButton).not.toBeNull();

    // Track how many times handleRemoveCondition is called
    let callCount = 0;
    const originalHandler = builder.handleRemoveCondition.bind(builder);
    builder.handleRemoveCondition = function(button) {
      callCount++;
      return originalHandler(button);
    };

    // Click the remove button once
    removeButton.click();

    // Should only be called once, not 3 times (once per setConditions call)
    expect(callCount).toBe(1);
  });

  test('should handle removing condition after multiple setConditions calls without crash', () => {
    const builder = new ConditionsBuilder(container, {
      all: [
        { subject: 'url', operator: 'startsWith', value: 'https://meet.google.com/' },
        { subject: 'last_access', operator: 'gt', value: '1h' }
      ]
    });

    // Simulate multiple re-renders (what happens during editing)
    builder.setConditions(builder.getConditions());
    builder.setConditions(builder.getConditions());

    // Find and click the first remove button
    const removeButton = container.querySelector('.remove-condition');
    expect(removeButton).not.toBeNull();

    // This should not throw an error about null.children
    expect(() => {
      removeButton.click();
    }).not.toThrow();

    // Verify the row was actually removed
    const rows = container.querySelectorAll('.condition-row');
    expect(rows.length).toBe(1); // One row should remain
  });

  test('listenersAttached flag should prevent duplicate attachment', () => {
    const builder = new ConditionsBuilder(container, { all: [] });

    expect(builder.listenersAttached).toBe(true);

    // Calling attachEventListeners again should be a no-op
    builder.attachEventListeners();
    builder.attachEventListeners();
    builder.attachEventListeners();

    // Flag should still be true
    expect(builder.listenersAttached).toBe(true);
  });
});
