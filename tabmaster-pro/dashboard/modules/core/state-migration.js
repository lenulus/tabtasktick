/**
 * State Migration Helper
 * Temporary module to help migrate from global variables to state module
 * This file will be removed after migration is complete
 */

import state from './state.js';

// Create getters and setters that match the old global variable names
// This allows gradual migration without breaking existing code

export const stateProxy = {
  get currentView() {
    return state.get('currentView');
  },
  set currentView(value) {
    state.set('currentView', value);
  },
  
  get selectedTabs() {
    return state.get('selectedTabs');
  },
  set selectedTabs(value) {
    state.set('selectedTabs', value);
  },
  
  get tabsData() {
    return state.get('tabsData');
  },
  set tabsData(value) {
    state.set('tabsData', value);
  },
  
  get groupsData() {
    return state.get('groupsData');
  },
  set groupsData(value) {
    state.set('groupsData', value);
  },
  
  get snoozedData() {
    return state.get('snoozedData');
  },
  set snoozedData(value) {
    state.set('snoozedData', value);
  },
  
  get charts() {
    return state.get('charts');
  },
  set charts(value) {
    state.set('charts', value);
  },
  
  get snoozeModal() {
    return state.get('snoozeModal');
  },
  set snoozeModal(value) {
    state.set('snoozeModal', value);
  },
  
  get previewCard() {
    return state.get('previewCard');
  },
  set previewCard(value) {
    state.set('previewCard', value);
  },
  
  get selectionState() {
    return state.get('selectionState');
  },
  set selectionState(value) {
    state.set('selectionState', value);
  },
  
  get activityChart() {
    return state.get('activityChart');
  },
  set activityChart(value) {
    state.set('activityChart', value);
  },
  
  get domainsChart() {
    return state.get('domainsChart');
  },
  set domainsChart(value) {
    state.set('domainsChart', value);
  },
  
  get currentRules() {
    return state.get('currentRules');
  },
  set currentRules(value) {
    state.set('currentRules', value);
  },
  
  get editingRule() {
    return state.get('editingRule');
  },
  set editingRule(value) {
    state.set('editingRule', value);
  },
  
  get sampleRules() {
    return state.get('sampleRules');
  },
  set sampleRules(value) {
    state.set('sampleRules', value);
  }
};

// Export individual variables that can be destructured
export const {
  currentView,
  selectedTabs,
  tabsData,
  groupsData,
  snoozedData,
  charts,
  snoozeModal,
  previewCard,
  selectionState,
  activityChart,
  domainsChart,
  currentRules,
  editingRule,
  sampleRules
} = stateProxy;