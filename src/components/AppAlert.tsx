import { useAlert } from "../context/AlertContext";
import { useTheme } from "../context/ThemeContext";
import { themes } from "../constants";

export function AppAlert() {
  const { alertObj, setAlertObj } = useAlert();
  const { themeNumber } = useTheme();
  const theme = themes[themeNumber] ?? themes[0];

  if (!alertObj.show || !alertObj.text) return null;

  const bg =
    alertObj.type === "error" || alertObj.type === "danger"
      ? "#ef4444"
      : alertObj.type === "warning"
        ? theme.secondary
        : "#22c55e";

  const color =
    alertObj.type === "warning" ? theme.textPrimary : "#ffffff";

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        maxWidth: 560,
        padding: "14px 20px",
        borderRadius: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        background: bg,
        color,
        fontSize: 15,
      }}
    >
      {alertObj.text}
      <button
        type="button"
        onClick={() => setAlertObj({ text: "", type: "success", show: false })}
        style={{
          marginLeft: 16,
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          opacity: 0.85,
          fontSize: 18,
          lineHeight: 1,
        }}
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
