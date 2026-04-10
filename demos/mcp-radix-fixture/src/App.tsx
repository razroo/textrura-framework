import { useState } from 'react'
import * as Select from '@radix-ui/react-select'

/**
 * Geometra MCP Radix-Select fixture.
 *
 * Companion to mcp-greenhouse-fixture (which exercises real react-select v5).
 * The Radix sibling-readback path in `extractor.ts:findCustomComboboxValueText`
 * has selector support for `[class*="SelectValue"]` and `[data-radix-select-value]`,
 * but until this fixture existed it was only validated against hand-coded
 * mocks in extractor.test.ts. Real Radix Select renders:
 *
 *   <button role="combobox" aria-expanded="..." data-radix-select-trigger>
 *     <span data-radix-select-value>Yes</span>
 *     <span aria-hidden="true">▾</span>
 *   </button>
 *
 * with the menu portal'd to document.body. This fixture mirrors the
 * Greenhouse eligibility section so the benchmark exercises:
 *
 *   - geometra_form_schema discovery of Radix combobox triggers
 *   - geometra_fill_form selecting options via the portal'd popup
 *   - geometra_query reading the picked value from the <SelectValue>
 *     sibling after the menu closes
 *
 * The form is intentionally never submitted — `onSubmit` no-ops. The
 * benchmark stops after the post-fill ground-truth read.
 */

const yesNo = ['Yes', 'No'] as const

interface YesNoSelectProps {
  inputId: string
  label: string
  value: string
  onChange: (next: string) => void
}

function YesNoSelect({ inputId, label, value, onChange }: YesNoSelectProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger id={inputId} className="SelectTrigger" aria-label={label}>
          <Select.Value placeholder="Select..." />
          <Select.Icon className="SelectIcon">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="SelectContent" position="popper" sideOffset={4}>
            <Select.Viewport>
              {yesNo.map(option => (
                <Select.Item key={option} value={option} className="SelectItem">
                  <Select.ItemText>{option}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}

export function App(): JSX.Element {
  const [workAuth, setWorkAuth] = useState('')
  const [sponsorship, setSponsorship] = useState('')
  const [priorEmployment, setPriorEmployment] = useState('')
  const [accommodations, setAccommodations] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    // Test fixture: never actually submits.
    // eslint-disable-next-line no-console
    console.log('[fixture] submit blocked')
  }

  return (
    <main>
      <h1>Eligibility — Radix Select</h1>
      <p className="subtitle">
        Geometra MCP test fixture using real <code>@radix-ui/react-select</code>.
        Each trigger renders the picked option in a sibling <code>&lt;SelectValue&gt;</code> —
        the path the extractor's <code>findCustomComboboxValueText</code> reads.
      </p>

      <form onSubmit={handleSubmit} aria-label="Eligibility">
        <fieldset>
          <legend>Eligibility</legend>

          <YesNoSelect
            inputId="work-auth"
            label="Are you legally authorized to work in the country in which you are applying?"
            value={workAuth}
            onChange={setWorkAuth}
          />

          <YesNoSelect
            inputId="sponsorship"
            label="Will you now or in the future require sponsorship for employment visa status?"
            value={sponsorship}
            onChange={setSponsorship}
          />

          <YesNoSelect
            inputId="prior-employment"
            label="Have you previously worked for this company?"
            value={priorEmployment}
            onChange={setPriorEmployment}
          />

          <YesNoSelect
            inputId="accommodations"
            label="Do you require any accommodations for the interview process?"
            value={accommodations}
            onChange={setAccommodations}
          />
        </fieldset>
      </form>
    </main>
  )
}
