/**
 * ESLint rule: no-hardcoded-ui-string
 *
 * Flags user-facing English text that should go through the i18n helper
 * (services/utils/i18n.js → t() / tPlural()).
 *
 * Detected sinks:
 *   - assignment to .textContent / .innerText / .innerHTML / .title / .placeholder
 *   - el.setAttribute('title'|'aria-label'|'placeholder'|'alt', <text>)
 *   - alert(<text>) / confirm(<text>) / prompt(<text>)
 *
 * "Text" = a string or template literal whose content, after stripping HTML
 * tags/entities, contains a run of >= 2 letters. Values already produced by
 * t()/tPlural() are CallExpressions, not literals, so they never trip the rule.
 *
 * Suppress a deliberate case with: // eslint-disable-next-line local/no-hardcoded-ui-string
 */

const SINK_PROPS = new Set(['textContent', 'innerText', 'innerHTML', 'title', 'placeholder']);
const SINK_ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt']);
const SINK_CALLS = new Set(['alert', 'confirm', 'prompt']);

// Marker that stands in for ${} interpolations when joining template quasis, so
// an HTML tag split across an interpolation (e.g. `<button title="${t(...)}">`)
// reduces to a complete, strippable tag instead of leaving attribute fragments.
const INTERP = '';

function hasUserText(raw) {
  if (typeof raw !== 'string') return false;
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')          // complete HTML tags (markers are not '>')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')  // HTML entities
    .split(INTERP).join(' ');          // drop leftover interpolation markers
  return /[A-Za-z]{2,}/.test(stripped);
}

function isText(node) {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value === 'string' && hasUserText(node.value);
  if (node.type === 'TemplateLiteral') {
    return hasUserText(node.quasis.map((q) => q.value.cooked).join(INTERP));
  }
  return false;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded user-facing strings; use the i18n helper t()/tPlural().',
      recommended: false
    },
    messages: {
      hardcoded: 'Hardcoded UI string. Move it to _locales/en/messages.json and use t()/tPlural() (i18n.js). Suppress with // eslint-disable-next-line local/no-hardcoded-ui-string if intentional.'
    },
    schema: []
  },

  create(context) {
    return {
      AssignmentExpression(node) {
        if (node.left.type !== 'MemberExpression') return;
        const prop = node.left.property;
        const name = prop.type === 'Identifier' ? prop.name : (prop.type === 'Literal' ? prop.value : null);
        if (!SINK_PROPS.has(name)) return;
        if (isText(node.right)) context.report({ node: node.right, messageId: 'hardcoded' });
      },

      CallExpression(node) {
        const callee = node.callee;
        // setAttribute('title'|…, text)
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'setAttribute'
        ) {
          const [attrArg, valArg] = node.arguments;
          if (attrArg && attrArg.type === 'Literal' && SINK_ATTRS.has(attrArg.value) && isText(valArg)) {
            context.report({ node: valArg, messageId: 'hardcoded' });
          }
          return;
        }
        // alert/confirm/prompt(text)
        if (callee.type === 'Identifier' && SINK_CALLS.has(callee.name)) {
          if (isText(node.arguments[0])) context.report({ node: node.arguments[0], messageId: 'hardcoded' });
        }
      }
    };
  }
};
