import { App as AntdApp, ConfigProvider, theme } from "antd";
import frFR from "antd/locale/fr_FR";
import { useTheme } from "../context/ThemeContext";
import { themes } from "../constants";

export function AntdThemeBridge({ children }: { children: React.ReactNode }) {
  const { themeNumber } = useTheme();
  const c = themes[themeNumber] ?? themes[0];

  return (
    <ConfigProvider
      locale={frFR}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: c.primary,
          colorSuccess: "#16a34a",
          colorWarning: "#ca8a04",
          colorError: "#ef4444",
          colorBgContainer: c.tertiary,
          colorText: c.textBody ?? "#1f2937",
          colorTextSecondary: c.textBodySecondary ?? "#4b5563",
          colorTextTertiary: c.textBodyTertiary ?? "#9ca3af",
          borderRadius: 8,
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        },
        components: {
          Layout: {
            bodyBg: "#f0fdf4",
            headerBg: c.tertiary,
            siderBg: c.primary,
          },
          Menu: {
            darkItemBg: "transparent",
            darkItemColor: c.textPrimary,
            darkItemSelectedBg: c.secondary,
            /** Évite le texte « vert sur vert » sur le Sider : même teinte que `colorTextTertiary` global. */
            darkItemSelectedColor: c.textBodyTertiary ?? "#9ca3af",
            darkSubMenuItemBg: "transparent",
          },
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
