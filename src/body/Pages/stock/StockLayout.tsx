import { useEffect, useState } from "react";
import { Layout, Menu, theme, Badge, Dropdown } from "antd";
import { Button, NavBar } from "../../../items";
import type { MenuProps } from "antd";
import {
  DashboardOutlined,
  InboxOutlined,
  ShopOutlined,
  SwapOutlined,
  TruckOutlined,
  TeamOutlined,
  UserOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  BellOutlined,
  BgColorsOutlined,
  FileOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { useScheduledTaskAlarms } from "../../hooks/useScheduledTaskAlarms";
import { countUpcomingTasks, subscribeScheduledTasks } from "../../utils/scheduledTasksStore";
import { hasStockScreenAccess } from "../../utils/stockPrivileges";
import { StockAccessGuard } from "./StockAccessGuard";
import { StockDbSettingsModal } from "./StockDbSettingsModal";
import { StockScheduledTasksModal } from "./StockScheduledTasksModal";
import { useTheme } from "../../../context/ThemeContext";
import { themes } from "../../../constants";

const { Sider, Content } = Layout;

export default function StockLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { logout, session } = useSession();
  const M = usePageTexts("stockMenu");
  const Nav = usePageTexts("stockArticlesNav");
  const NavW = usePageTexts("stockWarehouseNav");
  const R = usePageTexts("stockScheduledTasks");
  const { themeNumber, setThemeNumber } = useTheme();
  const { token } = theme.useToken();
  const [dbOpen, setDbOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskBadge, setTaskBadge] = useState(() => countUpcomingTasks());
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const h = window.location.hash;
    const keys: string[] = [];
    if (h.includes("articles")) keys.push("sub-articles");
    if (h.includes("warehouse")) keys.push("sub-warehouse");
    return keys;
  });

  useScheduledTaskAlarms();

  useEffect(() => {
    const sync = () => setTaskBadge(countUpcomingTasks());
    sync();
    return subscribeScheduledTasks(sync);
  }, []);

  useEffect(() => {
    const keys: string[] = [];
    if (loc.pathname.includes("/articles")) keys.push("sub-articles");
    if (loc.pathname.includes("/warehouse")) keys.push("sub-warehouse");
    setOpenKeys(keys);
  }, [loc.pathname]);

  const selectedKeys = (() => {
    if (loc.pathname.includes("/articles/units")) return ["articles-units"];
    if (loc.pathname.includes("/articles/categories")) return ["articles-categories"];
    if (loc.pathname.includes("/articles")) return ["articles-list"];
    if (/\/stock\/warehouse\/.+/.test(loc.pathname)) return ["warehouse-locations"];
    if (loc.pathname.includes("/movements")) return ["movements"];
    if (loc.pathname.includes("/fournisseurs")) return ["fournisseurs"];
    if (loc.pathname.includes("/clients")) return ["clients"];
    if (loc.pathname.includes("/documents")) return ["documents"];
    if (loc.pathname.includes("/user")) return ["user"];
    return ["dash"];
  })();

  const menuItems: MenuProps["items"] = [];

  if (hasStockScreenAccess(session, "dashboard")) {
    menuItems.push({
      key: "dash",
      icon: <DashboardOutlined />,
      label: M[0],
      onClick: () => navigate("/stock"),
    });
  }

  if (hasStockScreenAccess(session, "articles")) {
    menuItems.push({
      key: "sub-articles",
      icon: <InboxOutlined />,
      label: M[1],
      children: [
        {
          key: "articles-list",
          label: Nav[0],
          onClick: () => navigate("/stock/articles"),
        },
        {
          key: "articles-units",
          label: Nav[1],
          onClick: () => navigate("/stock/articles/units"),
        },
        {
          key: "articles-categories",
          label: Nav[2],
          onClick: () => navigate("/stock/articles/categories"),
        },
      ],
    });
  }

  if (hasStockScreenAccess(session, "warehouse")) {
    menuItems.push({
      key: "sub-warehouse",
      icon: <ShopOutlined />,
      label: M[2],
      children: [
        {
          key: "warehouse-locations",
          label: NavW[0],
          onClick: () => navigate("/stock/warehouse"),
        },
      ],
    });
  }

  if (hasStockScreenAccess(session, "movements")) {
    menuItems.push({
      key: "movements",
      icon: <SwapOutlined />,
      label: M[3],
      onClick: () => navigate("/stock/movements"),
    });
  }

  if (hasStockScreenAccess(session, "fournisseurs")) {
    menuItems.push({
      key: "fournisseurs",
      icon: <TruckOutlined />,
      label: M[4],
      onClick: () => navigate("/stock/fournisseurs"),
    });
  }

  if (hasStockScreenAccess(session, "clients")) {
    menuItems.push({
      key: "clients",
      icon: <TeamOutlined />,
      label: M[5],
      onClick: () => navigate("/stock/clients"),
    });
  }

  if (hasStockScreenAccess(session, "documents")) {
    menuItems.push({
      key: "documents",
      icon: <FileOutlined />,
      label: M[6],
      onClick: () => navigate("/stock/documents"),
    });
  }

  if (hasStockScreenAccess(session, "user")) {
    menuItems.push({
      key: "user",
      icon: <UserOutlined />,
      label: M[7],
      onClick: () => navigate("/stock/user"),
    });
  }

  if (hasStockScreenAccess(session, "settings")) {
    menuItems.push({
      key: "settings",
      icon: <DatabaseOutlined />,
      label: M[8],
      onClick: () => setDbOpen(true),
    });
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0} width={260} theme="dark" style={{ background: token.colorPrimary }}>
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {M[9] ?? "Stock"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          style={{ background: "transparent", border: "none" }}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <NavBar
          style={{
            background: token.colorBgContainer,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Badge count={taskBadge} size="small" offset={[-2, 4]}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 22, color: token.colorPrimary }} />}
                onClick={() => setTasksOpen(true)}
                aria-label={R[0]}
                title={R[0]}
              />
            </Badge>
            <Dropdown
              trigger={["click"]}
              placement="bottomLeft"
              menu={{
                items: themes.map((pal, i) => ({
                  key: String(i),
                  label: (
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          background: pal.primary,
                          boxShadow:
                            themeNumber === i
                              ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 4px ${pal.secondary}`
                              : "inset 0 0 0 1px rgba(0,0,0,0.12)",
                        }}
                      />
                      <span style={{ flex: 1 }}>
                        {(M[11] ?? "Thème") + ` ${i + 1}`}
                        {themeNumber === i ? " ✓" : ""}
                      </span>
                    </span>
                  ),
                  onClick: () => setThemeNumber(i),
                })),
              }}
            >
              <Button
                type="text"
                icon={<BgColorsOutlined style={{ fontSize: 22, color: token.colorPrimary }} />}
                aria-label={M[11] ?? "Thème"}
                title={M[12] ?? M[11] ?? "Thème"}
              />
            </Dropdown>
          </div>
          <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate("/connection"); }}>
            {M[10]}
          </Button>
        </NavBar>
        <Content style={{ margin: 24, minHeight: 280 }}>
          <StockAccessGuard>
            <Outlet />
          </StockAccessGuard>
        </Content>
      </Layout>
      <StockDbSettingsModal open={dbOpen} onClose={() => setDbOpen(false)} />
      <StockScheduledTasksModal open={tasksOpen} onClose={() => setTasksOpen(false)} />
    </Layout>
  );
}
