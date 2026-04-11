import React, { useState, useEffect } from "react";
import { Modal, Table, Button, Form } from "react-bootstrap";
import { themes } from "../../constants/index.ts";
import { useTheme } from "../context/ThemeContext";
import { useAlert } from "../context/SearchContext";
import TutoController, { type Tuto } from "../controllers/TutoController";
import { Plus, Pencil, Trash2, Loader } from "lucide-react";

interface ModalTutorielsProps {
  show: boolean;
  onClose: () => void;
  onTutosChanged?: () => void;
}

const ModalTutoriels: React.FC<ModalTutorielsProps> = ({ show, onClose, onTutosChanged }) => {
  const { themeNumber } = useTheme();
  const { setAlertObj } = useAlert();
  const controller = TutoController();

  const [tutos, setTutos] = useState<Tuto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitre, setFormTitre] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadTutos = async () => {
    setLoading(true);
    try {
      const list = await controller.list();
      setTutos(list);
    } catch (err) {
      console.error("Erreur chargement tutoriels:", err);
      setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des tutoriels." });
      setTutos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      loadTutos();
      setEditingId(null);
      setIsAdding(false);
      setFormTitre("");
      setFormUrl("");
    }
  }, [show]);

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setFormTitre("");
    setFormUrl("");
  };

  const startEdit = (t: Tuto) => {
    setEditingId(t.id);
    setIsAdding(false);
    setFormTitre(t.titre);
    setFormUrl(t.url);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormTitre("");
    setFormUrl("");
  };

  const handleSave = async () => {
    const titre = formTitre.trim();
    const url = formUrl.trim();
    if (!titre || !url) {
      setAlertObj({ type: "warning", show: true, text: "Titre et URL YouTube requis." });
      return;
    }
    setSaving(true);
    try {
      if (isAdding) {
        await controller.add(titre, url);
        setAlertObj({ type: "success", show: true, text: "Tutoriel ajouté." });
      } else if (editingId) {
        await controller.update(editingId, titre, url);
        setAlertObj({ type: "success", show: true, text: "Tutoriel modifié." });
      }
      cancelEdit();
      await loadTutos();
      onTutosChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertObj({ type: "error", show: true, text: msg || "Erreur lors de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce tutoriel ?")) return;
    setSaving(true);
    try {
      await controller.delete(id);
      setAlertObj({ type: "success", show: true, text: "Tutoriel supprimé." });
      await loadTutos();
      onTutosChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertObj({ type: "error", show: true, text: msg || "Erreur lors de la suppression." });
    } finally {
      setSaving(false);
    }
  };

  const theme = themes[themeNumber];

  return (
    <Modal
      show={show}
      onHide={onClose}
      size="lg"
      centered
      style={{ zIndex: 10001 }}
    >
      <Modal.Header
        closeButton
        style={{
          backgroundColor: theme.primary,
          color: theme.secondary,
          borderBottom: `3px solid ${theme.secondary}`,
        }}
      >
        <Modal.Title>📚 Gestion des tutoriels</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ backgroundColor: "#f8f9fa" }}>
        {loading ? (
          <div className="text-center py-5">
            <Loader size={32} className="animate-spin" />
            <p className="mt-2">Chargement...</p>
          </div>
        ) : (
          <>
            <Table striped bordered hover responsive>
              <thead style={{ backgroundColor: theme.primary, color: theme.secondary }}>
                <tr>
                  <th>Titre</th>
                  <th>URL YouTube</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(isAdding || editingId) && (
                  <tr style={{ backgroundColor: "rgba(0,0,0,0.03)" }}>
                    <td>
                      <Form.Control
                        size="sm"
                        placeholder="Titre"
                        value={formTitre}
                        onChange={(e) => setFormTitre(e.target.value)}
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm"
                        placeholder="ID vidéo ou URL (ex: 8SRSFLnAnsQ ou https://youtu.be/...)"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                      />
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={handleSave}
                        disabled={saving}
                        className="me-1"
                      >
                        {saving ? "..." : "OK"}
                      </Button>
                      <Button size="sm" variant="outline-secondary" onClick={cancelEdit}>
                        Annuler
                      </Button>
                    </td>
                  </tr>
                )}
                {tutos.map((t) => (
                  <tr key={t.id}>
                    <td>{t.titre}</td>
                    <td>
                      <small style={{ wordBreak: "break-all" }}>{t.url}</small>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        className="me-1"
                        onClick={() => startEdit(t)}
                        disabled={!!editingId || isAdding}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => handleDelete(t.id)}
                        disabled={saving}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!isAdding && !editingId && (
              <Button
                variant="outline-primary"
                onClick={startAdd}
                style={{ borderColor: theme.primary, color: theme.primary }}
              >
                <Plus size={18} className="me-1" />
                Ajouter un tutoriel
              </Button>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default ModalTutoriels;
