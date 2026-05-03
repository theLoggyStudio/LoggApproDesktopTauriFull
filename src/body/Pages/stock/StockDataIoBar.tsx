import { useRef, type ChangeEvent } from "react";
import { Space, message } from "antd";
import { Button } from "../../../items";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { hasStockPrivilege } from "../../utils/stockPrivileges";
import { exportStockCsv, importStockCsv, type StockCsvTable } from "../../../lib/stockApi";

type Props = {
  table: StockCsvTable;
  /** Si absent, le bouton d’import CSV est masqué. */
  importPrivilege?: string;
  /** Si absent, le bouton d’export CSV est masqué. */
  exportPrivilege?: string;
  /** Import / export des emplacements limités à cet entrepôt (colonne `warehouseId` côté CSV). */
  warehouseId?: string;
  onAfterImport?: () => void;
};

export default function StockDataIoBar({
  table,
  importPrivilege,
  exportPrivilege,
  warehouseId,
  onAfterImport,
}: Props) {
  const { session } = useSession();
  const T = usePageTexts("stockDataIo");
  const fileRef = useRef<HTMLInputElement>(null);
  const canImport = importPrivilege ? hasStockPrivilege(session, importPrivilege) : false;
  const canExport = exportPrivilege ? hasStockPrivilege(session, exportPrivilege) : false;

  if (!canImport && !canExport) {
    return null;
  }

  const onExport = async () => {
    try {
      const r = await exportStockCsv(table, warehouseId ? { warehouseId } : undefined);
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName || "export.csv";
      a.click();
      URL.revokeObjectURL(url);
      message.success(T[2]);
    } catch (e) {
      message.error(String(e));
    }
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const r = await importStockCsv(table, text, warehouseId ? { warehouseId } : undefined);
      const summary = T[3].replace("{0}", String(r.inserted)).replace("{1}", String(r.updated));
      if (r.success || r.inserted > 0 || r.updated > 0) {
        message.success(summary);
      } else {
        message.warning(summary);
      }
      if (r.errorCount > 0 && r.errors?.length) {
        message.warning(`${T[5]} ${r.errors.slice(0, 5).join(" — ")}`);
      }
      onAfterImport?.();
    } catch (err) {
      message.error(String(err));
    }
  };

  return (
    <Space wrap>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={onFileChange}
      />
      {canImport ? (
        <Button icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
          {T[0]}
        </Button>
      ) : null}
      {canExport ? (
        <Button icon={<DownloadOutlined />} onClick={onExport}>
          {T[1]}
        </Button>
      ) : null}
    </Space>
  );
}
