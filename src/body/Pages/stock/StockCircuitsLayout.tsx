import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Form } from "antd";
import { Select } from "../../../items";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockPrivilege, hasStockScreenAccess } from "../../utils/stockPrivileges";
import { resolveStockCircuitsNavActiveKey } from "../../utils/stockMenuNavigation";
import {
  createCircuitStepCollabTask,
  fetchRoleCircuitEntries,
  type StockRoleCircuitEntry,
} from "../../../lib/stockApi";
import {
  dispatchCollabTasksChanged,
  requestOpenCollabTasks,
} from "../../utils/scheduledTasksStore";

export default function StockCircuitsLayout() {
  const N = usePageTexts("stockCircuitsNav");
  const C = usePageTexts("stockCircuits");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const canManage = hasStockPrivilege(session, "circuits_manage");
  const canCircuits = hasStockScreenAccess(session, "circuits");
  const canForms = hasStockScreenAccess(session, "circuits_forms");
  const [roleCircuitEntries, setRoleCircuitEntries] = useState<StockRoleCircuitEntry[]>([]);

  useEffect(() => {
    if (!session?.id || !canCircuits) {
      setRoleCircuitEntries([]);
      return;
    }
    fetchRoleCircuitEntries({
      requesterUserId: session.id,
      requesterRole: session.role ?? "",
    })
      .then(setRoleCircuitEntries)
      .catch(() => setRoleCircuitEntries([]));
  }, [session, canCircuits]);

  const options = useMemo(() => {
    const o: { value: string; label: string }[] = [];
    if (canCircuits) o.push({ value: "list", label: N[0] });
    if (canManage && canCircuits) o.push({ value: "circuit", label: N[1] });
    if (canForms) o.push({ value: "forms", label: N[2] });
    if (canCircuits) o.push({ value: "fill", label: N[3] });
    if (canCircuits) {
      for (const e of roleCircuitEntries) {
        o.push({ value: `role-${e.circuitId}`, label: e.circuitName });
      }
    }
    return o;
  }, [N, canManage, canCircuits, canForms, roleCircuitEntries]);

  const activeKey = useMemo(() => {
    const k = resolveStockCircuitsNavActiveKey(pathname);
    if (k.startsWith("role-") && !options.some((o) => o.value === k)) {
      return canManage ? "circuit" : "list";
    }
    if (!options.some((o) => o.value === k)) {
      return options[0]?.value;
    }
    return k;
  }, [pathname, options, canManage]);

  const activateRoleCircuit = async (entry: StockRoleCircuitEntry) => {
    if (!session?.id) return;
    if (session.role === "sadmin") {
      navigate(`/stock/circuits/${entry.circuitId}/edit`);
      return;
    }
    if (entry.canStart && entry.active) {
      try {
        await createCircuitStepCollabTask({
          requesterUserId: session.id,
          circuitId: entry.circuitId,
          stepIndex: 0,
          variant: "fill",
        });
        dispatchCollabTasksChanged();
      } catch {
        /* l’entrée sert aussi de raccourci vers les tâches */
      }
    }
    requestOpenCollabTasks();
  };

  const showNav = options.length > 1;

  return (
    <>
      {showNav ? (
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label={C[0]}>
            <Select
              style={{ minWidth: 280 }}
              value={activeKey}
              onChange={(k) => {
                if (typeof k !== "string") return;
                if (k === "circuit") {
                  navigate("/stock/circuits/new");
                  return;
                }
                if (k === "forms") {
                  navigate("/stock/circuits/forms");
                  return;
                }
                if (k === "fill") {
                  navigate("/stock/circuits/fill");
                  return;
                }
                if (k.startsWith("role-")) {
                  const id = k.slice("role-".length);
                  const entry = roleCircuitEntries.find((e) => e.circuitId === id);
                  if (entry) void activateRoleCircuit(entry);
                  return;
                }
                navigate("/stock/circuits");
              }}
              options={options}
            />
          </Form.Item>
        </Form>
      ) : null}
      <Outlet />
    </>
  );
}
