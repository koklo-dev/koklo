import { useMemo, useState } from 'react'
import { Button } from '../../atoms/Button/Button'
import { Input } from '../../atoms/Input/Input'
import './UserSetupScreen.css'

export interface UserSetupValues {
  name: string
  email: string
  role: string
  avatarFile?: File
}

export interface UserSetupScreenProps {
  initialValues?: Partial<UserSetupValues>
  submitting?: boolean
  completed?: boolean
  onComplete?: (values: UserSetupValues) => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || 'YO'
}

export function UserSetupScreen({
  initialValues,
  submitting = false,
  completed = false,
  onComplete,
}: UserSetupScreenProps) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [role, setRole] = useState(initialValues?.role ?? '')
  const [avatarFile, setAvatarFile] = useState<File>()
  const [avatarUrl, setAvatarUrl] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email', string>>>({})
  const [submitted, setSubmitted] = useState(completed)

  const initials = useMemo(() => getInitials(name), [name])

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (avatarUrl) URL.revokeObjectURL(avatarUrl)
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) nextErrors.name = 'Enter your name to continue.'
    if (!trimmedEmail) nextErrors.email = 'Enter your email address.'
    else if (!EMAIL_PATTERN.test(trimmedEmail)) nextErrors.email = 'Enter a valid email address.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    onComplete?.({
      name: trimmedName,
      email: trimmedEmail,
      role: role.trim(),
      avatarFile,
    })
    setSubmitted(true)
  }

  const isComplete = completed || submitted

  return (
    <main className="kk-user-setup">
      <section className="kk-user-setup-brand" aria-labelledby="user-setup-brand-title">
        <div className="kk-user-setup-lockup">
          <span className="kk-user-setup-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="kk-user-setup-wordmark">Koklo</span>
        </div>

        <div className="kk-user-setup-brand-copy">
          <p className="kk-user-setup-eyebrow">First light</p>
          <h2 id="user-setup-brand-title">Your workspace starts with a name.</h2>
          <p>Koklo uses this profile to identify your proposals, approvals, and conversations.</p>
        </div>

        <div className="kk-user-setup-runtime" aria-label="Runtime ready">
          <span aria-hidden="true" />
          Tauri runtime ready
        </div>
      </section>

      <section className="kk-user-setup-content" aria-labelledby="user-setup-title">
        <div className="kk-user-setup-panel">
          <p className="kk-user-setup-step">Profile setup <span>1 of 1</span></p>

          {isComplete ? (
            <div className="kk-user-setup-success" role="status" aria-live="polite">
              <div className="kk-user-setup-avatar kk-user-setup-avatar--success" aria-hidden="true">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
              </div>
              <p className="kk-user-setup-eyebrow">Profile ready</p>
              <h1 id="user-setup-title">Welcome to Koklo, {name.trim() || 'there'}.</h1>
              <p>Your local identity is ready. You can update these details later in Settings.</p>
              <Button type="button" variant="primary" size="lg">Open Koklo</Button>
            </div>
          ) : (
            <>
              <header className="kk-user-setup-heading">
                <p className="kk-user-setup-eyebrow">Local profile</p>
                <h1 id="user-setup-title">Set up your identity</h1>
                <p>This is how teammates and agents will recognize you.</p>
              </header>

              <form className="kk-user-setup-form" noValidate onSubmit={handleSubmit}>
                <div className="kk-user-setup-avatar-row">
                  <div className="kk-user-setup-avatar" aria-hidden="true">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
                  </div>
                  <div>
                    <label className="kk-user-setup-upload" htmlFor="user-avatar">Choose a photo</label>
                    <input
                      className="kk-user-setup-file"
                      id="user-avatar"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarChange}
                    />
                    <p>PNG, JPG, or WebP. 5 MB maximum.</p>
                  </div>
                </div>

                <div className="kk-user-setup-field">
                  <label htmlFor="user-name">Full name</label>
                  <Input
                    id="user-name"
                    name="name"
                    required
                    autoComplete="name"
                    placeholder="Awa Yade"
                    value={name}
                    error={errors.name}
                    onChange={(event) => {
                      setName(event.target.value)
                      if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
                    }}
                  />
                </div>

                <div className="kk-user-setup-field">
                  <label htmlFor="user-email">Email address</label>
                  <Input
                    id="user-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="awa@studio.com"
                    value={email}
                    error={errors.email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (errors.email) setErrors((current) => ({ ...current, email: undefined }))
                    }}
                  />
                </div>

                <div className="kk-user-setup-field">
                  <div className="kk-user-setup-label-row">
                    <label htmlFor="user-role">Role</label>
                    <span>Optional</span>
                  </div>
                  <Input
                    id="user-role"
                    name="role"
                    autoComplete="organization-title"
                    placeholder="Product designer"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                  />
                </div>

                <div className="kk-user-setup-privacy">
                  <span aria-hidden="true">✓</span>
                  <p>Your profile stays on this device until you join a shared workspace.</p>
                </div>

                <Button
                  className="kk-user-setup-submit"
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={submitting}
                >
                  Continue to Koklo
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
