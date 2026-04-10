import { useState, type FormEvent } from 'react'
import Select, { type SingleValue } from 'react-select'

/**
 * Geometra MCP Greenhouse fixture.
 *
 * This deliberately uses real `react-select` (not a hand-coded mimic). It is
 * the live target for `scripts/benchmark-mcp-greenhouse.mjs`, which drives the
 * MCP through `connect → form_schema → fill_form (verifyFills)` and asserts
 * that the v1.33.0 popup-scoping fix correctly distinguishes the four
 * Yes/No comboboxes that share option labels (work auth, sponsorship, prior
 * employment, accommodations) — exactly the failure mode that breaks
 * Greenhouse application forms in the wild.
 *
 * Each react-select uses `menuPortalTarget={document.body}`, which renders
 * the option list outside the trigger's parent and is the harder of the two
 * react-select layout modes for an MCP to disambiguate. This is the case
 * that motivated `dom-actions.ts:resolveOwnedPopupHandle` and the entire
 * `clickScopedOptionCandidate` path.
 *
 * The form is intentionally never submitted — `onSubmit` no-ops. The
 * benchmark stops after the verifyFills step.
 */

interface OptionType {
  value: string
  label: string
}

const yesNoOptions: OptionType[] = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
]

const sourceOptions: OptionType[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'hackernews', label: 'Hacker News' },
  { value: 'referral', label: 'Friend or colleague' },
  { value: 'event', label: 'Conference or meetup' },
  { value: 'other', label: 'Other' },
]

const portalStyles = {
  menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }),
}

export function App(): JSX.Element {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [country, setCountry] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [agreed, setAgreed] = useState(false)

  // The four shared-option Yes/No comboboxes — the v1.33.0 case.
  const [workAuth, setWorkAuth] = useState<SingleValue<OptionType>>(null)
  const [sponsorship, setSponsorship] = useState<SingleValue<OptionType>>(null)
  const [priorEmployment, setPriorEmployment] = useState<SingleValue<OptionType>>(null)
  const [accommodations, setAccommodations] = useState<SingleValue<OptionType>>(null)
  // Single combobox with non-overlapping options — used to verify the picker
  // doesn't regress on the easy case while we exercise the hard one.
  const [source, setSource] = useState<SingleValue<OptionType>>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    // Test fixture: never actually submits.
    // eslint-disable-next-line no-console
    console.log('[fixture] submit blocked')
  }

  return (
    <main>
      <h1>Software Engineer — Application</h1>
      <p className="subtitle">
        Geometra MCP test fixture using real react-select. The four Yes/No questions below all
        share the same option labels — picking the right one for each is the hard case.
      </p>

      <form onSubmit={handleSubmit} aria-label="Job application">
        <fieldset>
          <legend>Personal information</legend>

          <div className="field">
            <label className="field-label" htmlFor="first-name">First name</label>
            <input
              id="first-name"
              name="first-name"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="last-name">Last name</label>
            <input
              id="last-name"
              name="last-name"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="linkedin">LinkedIn URL</label>
            <input
              id="linkedin"
              name="linkedin"
              type="url"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="resume">Resume</label>
            <input id="resume" name="resume" type="file" accept=".pdf,.doc,.docx" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Eligibility</legend>

          <div className="field">
            <label className="field-label" htmlFor="work-auth">
              Are you legally authorized to work in the country in which you are applying?
            </label>
            <Select<OptionType>
              inputId="work-auth"
              name="work-auth"
              classNamePrefix="select"
              options={yesNoOptions}
              value={workAuth}
              onChange={setWorkAuth}
              placeholder="Select..."
              menuPortalTarget={document.body}
              styles={portalStyles}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="sponsorship">
              Will you now or in the future require sponsorship for employment visa status?
            </label>
            <Select<OptionType>
              inputId="sponsorship"
              name="sponsorship"
              classNamePrefix="select"
              options={yesNoOptions}
              value={sponsorship}
              onChange={setSponsorship}
              placeholder="Select..."
              menuPortalTarget={document.body}
              styles={portalStyles}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="prior-employment">
              Have you previously worked for this company?
            </label>
            <Select<OptionType>
              inputId="prior-employment"
              name="prior-employment"
              classNamePrefix="select"
              options={yesNoOptions}
              value={priorEmployment}
              onChange={setPriorEmployment}
              placeholder="Select..."
              menuPortalTarget={document.body}
              styles={portalStyles}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="accommodations">
              Do you require any accommodations for the interview process?
            </label>
            <Select<OptionType>
              inputId="accommodations"
              name="accommodations"
              classNamePrefix="select"
              options={yesNoOptions}
              value={accommodations}
              onChange={setAccommodations}
              placeholder="Select..."
              menuPortalTarget={document.body}
              styles={portalStyles}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>About you</legend>

          <div className="field">
            <label className="field-label" htmlFor="country">Country</label>
            <select
              id="country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            >
              <option value="">Select...</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="CA">Canada</option>
              <option value="AU">Australia</option>
              <option value="JP">Japan</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="source">How did you hear about us?</label>
            <Select<OptionType>
              inputId="source"
              name="source"
              classNamePrefix="select"
              options={sourceOptions}
              value={source}
              onChange={setSource}
              placeholder="Select..."
              menuPortalTarget={document.body}
              styles={portalStyles}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="cover-letter">Cover letter</label>
            <textarea
              id="cover-letter"
              name="cover-letter"
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={6}
              placeholder="Tell us why you're interested in this role..."
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Agreement</legend>

          <div className="field checkbox-row">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              required
            />
            <label className="field-label" htmlFor="terms">
              I have read and agree to the privacy policy and terms of use
            </label>
          </div>
        </fieldset>

        <button type="submit">Submit application</button>
      </form>
    </main>
  )
}
