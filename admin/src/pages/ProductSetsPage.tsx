import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { Navigate } from "react-router-dom";
import { api, uploadMedia } from "../api/client";
import type { Entity, ProductSet, ProductSetItem } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useSaveNotice } from "../components/SaveNotice";
import { useAutosaveEdit } from "../hooks/useAutosaveEdit";

type SelectOption = { value: string; label: string };

type DraftProduct = {
  key: string;
  name: string;
  photoUrl: string;
};

type FormState = {
  name: string;
  products: DraftProduct[];
  entityIds: string[];
};

type ProductSetPutBody = {
  name: string;
  entityIds: string[];
  products: Array<{ name: string; photoUrl: string }>;
};

function productSetBody(form: FormState): ProductSetPutBody | null {
  const name = form.name.trim();
  const products = form.products
    .filter((product) => product.name.trim() && product.photoUrl)
    .map((product) => ({
      name: product.name.trim(),
      photoUrl: product.photoUrl,
    }));
  if (!name || products.length === 0) return null;
  return { name, entityIds: form.entityIds, products };
}

function newProduct(): DraftProduct {
  return {
    key: crypto.randomUUID(),
    name: "",
    photoUrl: "",
  };
}

const emptyForm: FormState = {
  name: "",
  products: [newProduct()],
  entityIds: [],
};

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8.6-8.6 1.4 1.4-10 10z"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3zm17.7-10.4c.4-.4.4-1 0-1.4l-2.2-2.2c-.4-.4-1-.4-1.4 0l-1.7 1.7 3.7 3.7 1.6-1.8z"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"
      />
    </svg>
  );
}

export function ProductSetsPage() {
  const { user } = useAuth();
  const { markSaved } = useSaveNotice();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [productSets, setProductSets] = useState<ProductSet[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const tableColSpan = 4;

  const entityOptions = useMemo<SelectOption[]>(
    () =>
      entities.map((entity) => ({
        value: entity.id,
        label: entity.name,
      })),
    [entities],
  );

  const { flush, rememberBaseline } = useAutosaveEdit<ProductSetPutBody>({
    editingId,
    deps: form,
    buildBody: () => (editingId ? productSetBody(form) : null),
    onError: setError,
    save: async (id, body) => {
      const data = await api<{ productSet: ProductSet }>(`/product-sets/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setProductSets((prev) =>
        prev.map((item) =>
          item.id === data.productSet.id ? data.productSet : item,
        ),
      );
    },
  });

  useEffect(() => {
    if (!isSuper) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [setsData, entitiesData] = await Promise.all([
          api<{ productSets: ProductSet[] }>("/product-sets"),
          api<{ entities: Entity[] }>("/entities"),
        ]);
        if (!cancelled) {
          setProductSets(setsData.productSets);
          setEntities(entitiesData.entities);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  async function reload() {
    const data = await api<{ productSets: ProductSet[] }>("/product-sets");
    setProductSets(data.productSets);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setExpandedKeys(new Set());
  }

  function startCreate() {
    flush();
    const product = newProduct();
    setEditingId(null);
    setForm({ name: "", products: [product], entityIds: [] });
    setExpandedKeys(new Set([product.key]));
    setShowForm(true);
  }

  function startEdit(set: ProductSet) {
    const products =
      set.products.length > 0
        ? set.products.map((product: ProductSetItem) => ({
            key: product.id ?? crypto.randomUUID(),
            name: product.name,
            photoUrl: product.photoUrl,
          }))
        : [newProduct()];

    const next: FormState = {
      name: set.name,
      products,
      entityIds: (set.entities ?? []).map((entity) => entity.id),
    };
    rememberBaseline(set.id, productSetBody(next));
    setEditingId(set.id);
    setForm(next);
    setExpandedKeys(
      new Set(
        products
          .filter((product) => !product.name || !product.photoUrl)
          .map((product) => product.key),
      ),
    );
    setShowForm(true);
  }

  function toggleEdit(set: ProductSet) {
    if (uploadingKey) return;
    if (showForm && editingId === set.id) {
      flush();
      closeForm();
      return;
    }
    flush();
    startEdit(set);
  }

  if (!isSuper) {
    return <Navigate to="/" replace />;
  }

  function setExpanded(key: string, expanded: boolean) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function collapseProduct(key: string) {
    const product = form.products.find((item) => item.key === key);
    if (!product?.name.trim()) {
      setError("Vul eerst een productnaam in vóór je inklapt");
      return;
    }
    if (!product.photoUrl) {
      setError("Upload eerst een foto vóór je inklapt");
      return;
    }
    setError(null);
    setExpanded(key, false);
  }

  function addProduct() {
    const product = newProduct();
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, product],
    }));
    setExpanded(product.key, true);
  }

  async function onPhotoChange(key: string, file: File | null) {
    if (!file) return;
    setUploadingKey(key);
    setError(null);
    try {
      const url = await uploadMedia(file);
      setForm((prev) => ({
        ...prev,
        products: prev.products.map((product) =>
          product.key === key ? { ...product, photoUrl: url } : product,
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploadingKey(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (editingId) {
      flush();
      return;
    }

    const payload = productSetBody(form);
    if (!payload) {
      setError("Voeg minstens één product toe met naam en foto");
      return;
    }

    setSavingCreate(true);
    setError(null);

    try {
      await api("/product-sets", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      markSaved();
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingCreate(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Deze product set verwijderen?")) return;
    setError(null);
    try {
      await api(`/product-sets/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  function renderProductSetFormFields(mode: "create" | "edit") {
    return (
      <>
        <h2>
          {mode === "edit" ? "Product set bewerken" : "Nieuwe product set"}
        </h2>

        <label>
          Naam van de set
          <input
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
        </label>

        <label>
          Beschikbaar voor entiteiten
          <Select
            isMulti
            classNamePrefix="rs"
            options={entityOptions}
            value={entityOptions.filter((option) =>
              form.entityIds.includes(option.value),
            )}
            onChange={(selected) =>
              setForm((prev) => ({
                ...prev,
                entityIds: selected.map((option) => option.value),
              }))
            }
            placeholder="Selecteer entiteiten…"
            noOptionsMessage={() => "Geen entiteiten"}
          />
        </label>
        <p className="muted" style={{ margin: 0 }}>
          Alleen geselecteerde entiteiten zien deze set in de flow builder.
        </p>

        <div className="stack">
          <h3>Producten</h3>

          {form.products.map((product, index) => {
            const expanded = expandedKeys.has(product.key);

            return (
              <div
                key={product.key}
                className={`repeater-item ${expanded ? "is-expanded" : "is-collapsed"}`}
              >
                {expanded ? (
                  <div className="panel-body stack">
                    <div className="repeater-toolbar">
                      <span className="muted">Product {index + 1}</span>
                      <div className="repeater-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Inklappen"
                          aria-label="Inklappen"
                          onClick={() => collapseProduct(product.key)}
                        >
                          <IconCheck />
                        </button>
                        {form.products.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                products: prev.products.filter(
                                  (item) => item.key !== product.key,
                                ),
                              }))
                            }
                          >
                            Verwijderen
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="form-grid two">
                      <label>
                        Productnaam
                        <input
                          value={product.name}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              products: prev.products.map((item) =>
                                item.key === product.key
                                  ? { ...item, name: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Foto
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            void onPhotoChange(
                              product.key,
                              e.target.files?.[0] ?? null,
                            )
                          }
                        />
                      </label>
                    </div>

                    {uploadingKey === product.key ? (
                      <p className="muted">Foto uploaden…</p>
                    ) : null}

                    {product.photoUrl ? (
                      <img
                        src={product.photoUrl}
                        alt={product.name || `Product ${index + 1}`}
                        className="repeater-preview"
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="repeater-collapsed">
                    <div className="repeater-collapsed-main">
                      {product.photoUrl ? (
                        <img
                          src={product.photoUrl}
                          alt={product.name}
                          className="repeater-thumb"
                        />
                      ) : (
                        <div className="repeater-thumb placeholder" />
                      )}
                      <span className="repeater-collapsed-name">
                        {product.name || `Product ${index + 1}`}
                      </span>
                    </div>
                    <div className="repeater-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Bewerken"
                        aria-label="Bewerken"
                        onClick={() => setExpanded(product.key, true)}
                      >
                        <IconPencil />
                      </button>
                      {form.products.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              products: prev.products.filter(
                                (item) => item.key !== product.key,
                              ),
                            }))
                          }
                        >
                          Verwijderen
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="repeater-add">
            <button
              type="button"
              className="add-product-btn"
              onClick={addProduct}
            >
              <span className="add-product-circle">
                <IconPlus />
              </span>
              <span>Voeg product toe</span>
            </button>
          </div>
        </div>

        {mode === "create" ? (
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeForm}
            >
              Annuleren
            </button>
            <button
              type="submit"
              className="btn"
              disabled={savingCreate || uploadingKey !== null}
            >
              {savingCreate ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Product sets</h1>
          <p>
            Algemene wagensets. Kies per set welke entiteiten ze in de flow
            builder mogen gebruiken.
          </p>
        </div>
        <button type="button" className="btn" onClick={startCreate}>
          Nieuwe product set
        </button>
      </div>

      {error ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="panel">
        {loading ? (
          <div className="empty">Laden…</div>
        ) : productSets.length === 0 ? (
          <div className="empty">Nog geen product sets.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Entiteiten</th>
                <th>Producten</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productSets.map((set) => (
                <Fragment key={set.id}>
                  <tr>
                    <td>{set.name}</td>
                  <td>
                    {(set.entities ?? []).length === 0 ? (
                      <span className="muted">Geen toegang</span>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                        }}
                      >
                        {(set.entities ?? []).map((entity) => (
                          <span key={entity.id} className="badge">
                            {entity.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {set.products.slice(0, 4).map((product) => (
                        <img
                          key={product.id ?? product.photoUrl}
                          src={product.photoUrl}
                          alt={product.name}
                          title={product.name}
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                          }}
                        />
                      ))}
                      <span className="badge">{set.products.length}</span>
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className={
                          showForm && editingId === set.id
                            ? "btn btn-small"
                            : "btn btn-secondary btn-small"
                        }
                        disabled={uploadingKey !== null}
                        onClick={() => toggleEdit(set)}
                      >
                        Bewerken
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => void onDelete(set.id)}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </td>
                </tr>
                  {showForm && editingId === set.id ? (
                    <tr className="table-row-expand">
                      <td colSpan={tableColSpan}>
                        <form
                          id="product-set-form-edit"
                          className="table-expand-panel stack"
                          onSubmit={onSubmit}
                        >
                          {renderProductSetFormFields("edit")}
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {showForm && !editingId ? (
          <form
            id="product-set-form-create"
            className="drawer stack"
            onSubmit={onSubmit}
          >
            {renderProductSetFormFields("create")}
          </form>
        ) : null}
      </div>
    </div>
  );
}
