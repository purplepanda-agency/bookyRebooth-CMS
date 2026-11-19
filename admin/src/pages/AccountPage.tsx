import { type FormEvent, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { SaveButton, useSaveNotice } from "../components/SaveNotice";

const PASSWORD_HINT =
  "Minimaal 8 tekens, met hoofdletter, kleine letter, cijfer en speciaal teken";

function passwordChecks(value: string) {
  return {
    length: value.length >= 8,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    digit: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function AccountPage() {
  const { user } = useAuth();
  const { savedKey, markSaved } = useSaveNotice();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const checks = useMemo(() => passwordChecks(newPassword), [newPassword]);
  const allChecksOk = Object.values(checks).every(Boolean);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!allChecksOk) {
      setError(PASSWORD_HINT);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen");
      return;
    }

    setSaving(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Wachtwoord bijgewerkt");
      markSaved("account");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Wachtwoord wijzigen mislukt",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>Beheer je inloggegevens voor {user?.email}</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
        <form className="panel-body stack" onSubmit={onSubmit}>
          <h2 style={{ margin: 0 }}>Wachtwoord wijzigen</h2>
          <p className="muted" style={{ margin: 0 }}>
            {PASSWORD_HINT}
          </p>

          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}

          <label>
            Huidig wachtwoord
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>

          <label>
            Nieuw wachtwoord
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          <ul className="password-checklist">
            <li className={checks.length ? "is-ok" : undefined}>
              Minimaal 8 tekens
            </li>
            <li className={checks.upper ? "is-ok" : undefined}>
              Minimaal één hoofdletter
            </li>
            <li className={checks.lower ? "is-ok" : undefined}>
              Minimaal één kleine letter
            </li>
            <li className={checks.digit ? "is-ok" : undefined}>
              Minimaal één cijfer
            </li>
            <li className={checks.special ? "is-ok" : undefined}>
              Minimaal één speciaal teken
            </li>
          </ul>

          <label>
            Bevestig nieuw wachtwoord
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          <div className="actions">
            <SaveButton
              saving={saving}
              saved={savedKey === "account"}
              disabled={!allChecksOk}
              label="Wachtwoord opslaan"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
