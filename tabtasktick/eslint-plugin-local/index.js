/**
 * Local ESLint plugin for TabMaster Pro
 *
 * Contains custom rules specific to this project's architecture and constraints.
 */

import noAsyncChromeListener from './no-async-chrome-listener.js';
import noHardcodedUiString from './no-hardcoded-ui-string.js';

export default {
  rules: {
    'no-async-chrome-listener': noAsyncChromeListener,
    'no-hardcoded-ui-string': noHardcodedUiString
  }
};
