# Form semantics examples

Examples for representing form-like relationships in Geometra semantic props.

## Labeled input with error text

```ts
box({ semantic: { tag: 'form', ariaLabel: 'Signup form' } }, [
  box({ semantic: { tag: 'label', ariaLabel: 'Email label' } }, [
    text({ text: 'Email', font: '14px Inter', lineHeight: 18 }),
  ]),
  box({
    semantic: {
      tag: 'input',
      ariaLabel: 'Email input',
      ariaSelected: false,
      ariaDisabled: false,
    },
  }, []),
  box({
    semantic: {
      tag: 'p',
      role: 'alert',
      ariaLabel: 'Email error: invalid address',
    },
  }, [
    text({ text: 'Please enter a valid email.', font: '12px Inter', lineHeight: 16 }),
  ]),
])
```

## Grouped controls with expanded state

```ts
box({ semantic: { tag: 'section', ariaLabel: 'Shipping method group', ariaExpanded: true } }, [
  box({ semantic: { tag: 'button', ariaLabel: 'Standard shipping', ariaSelected: true } }, []),
  box({ semantic: { tag: 'button', ariaLabel: 'Express shipping', ariaSelected: false } }, []),
])
```

## Notes

- Use `ariaLabel` as the primary accessible name.
- Use `ariaDisabled`, `ariaExpanded`, and `ariaSelected` for state projection into `toAccessibilityTree`.
- For complex relationships (described-by/labelled-by chains), encode explicit names and state in semantic labels until richer relationship fields are added.
