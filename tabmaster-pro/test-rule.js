// Test script to check rule configuration
chrome.storage.local.get('rules', (data) => {
  console.log('Rules in storage:', JSON.stringify(data.rules, null, 2));
  if (data.rules && data.rules.length > 0) {
    const rule = data.rules[0];
    console.log('First rule details:');
    console.log('- Name:', rule.name);
    console.log('- Enabled:', rule.enabled);
    console.log('- Trigger:', JSON.stringify(rule.trigger, null, 2));
    console.log('- Conditions (when):', JSON.stringify(rule.when, null, 2));
    console.log('- Actions (then):', JSON.stringify(rule.then, null, 2));
  }
});
