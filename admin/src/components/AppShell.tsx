import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAccessibleEntities } from "../auth/entityAccess";
import { useAuth } from "../auth/AuthContext";
import { CMS_VERSION } from "../version";

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
};

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : undefined;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    entities,
    selectedEntity,
    entityChoiceId,
    entityPhase,
    setSelectedEntityId,
  } = useAccessibleEntities();
  const isSuper = user?.role === "SUPER_ADMIN";

  function onEntityChange(entityId: string) {
    if (/^\/new-flow\/.+/.test(location.pathname)) {
      navigate("/new-flow");
    }
    setSelectedEntityId(entityId);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Booky CMS
          <span>Beheeromgeving</span>
        </div>

        <nav className="nav">
          {entities.length > 1 ? (
            <label className="entity-switch">
              Entiteit
              <select
                value={entityChoiceId}
                onChange={(event) => onEntityChange(event.target.value)}
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </label>
          ) : selectedEntity ? (
            <div className="entity-switch">
              Entiteit
              <strong>{selectedEntity.name}</strong>
            </div>
          ) : null}

          <NavLink to="/" end className={navClass}>
            Overzicht
          </NavLink>
          {isSuper ? (
            <NavLink to="/activity" className={navClass}>
              Activiteit
            </NavLink>
          ) : null}

          <div className="nav-divider" aria-hidden="true" />

          {isSuper ? (
            <NavLink to="/entities" className={navClass}>
              Entiteiten
            </NavLink>
          ) : null}
          <NavLink to="/users" className={navClass}>
            Gebruikers
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            Algemene instellingen
          </NavLink>

          <div className="nav-divider" aria-hidden="true" />

          <NavLink to="/locations" className={navClass}>
            Locaties
          </NavLink>
          <NavLink to="/sellers" className={navClass}>
            Verkopers
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            Categorieën
          </NavLink>

          <div className="nav-divider" aria-hidden="true" />

          <NavLink to="/new-flow" className={navClass}>
            Nieuwe flow
          </NavLink>
          <NavLink to="/content-blocks" className={navClass}>
            Contentblokken
          </NavLink>

          {isSuper ? (
            <>
              <div className="nav-divider" aria-hidden="true" />
              <NavLink to="/product-sets" className={navClass}>
                Product Sets
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <div>
            <div>{user?.email}</div>
            <div>{user ? roleLabel[user.role] : ""}</div>
          </div>
          <NavLink to="/account" className={navClass}>
            Wachtwoord wijzigen
          </NavLink>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Uitloggen
          </button>
          <div className="sidebar-version">Booky CMS - V{CMS_VERSION}</div>
        </div>
      </aside>

      <main className="main">
        <div className={entityPhase === "steady" ? "entity-stage" : `entity-stage ${entityPhase}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
