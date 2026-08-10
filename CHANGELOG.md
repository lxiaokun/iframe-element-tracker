# Changelog

## 0.2.0 (2026-08-09)

- feat(tracker): add `detach` messages that use MutationObserver to detect tracked elements removed during framework re-renders, automatically unregister them, release detached node references, and allow consumers to register replacements with the same ID
- feat(receiver): support subscribing to and forwarding `detach` events

## <small>0.1.1 (2026-07-15)</small>

- chore(deps): drop engines.node, downgrade jsdom for Node 18 dev support ([58df6f1](https://github.com/lxiaokun/iframe-element-tracker/commit/58df6f1))
