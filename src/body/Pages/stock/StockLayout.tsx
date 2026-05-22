import { useEffect, useMemo, useState } from "react";
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
  BranchesOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePageTexts } from "../../../hooks/usePageTexts";
import { useSession } from "../../context/SessionContext";
import { useScheduledTaskAlarms } from "../../hooks/useScheduledTaskAlarms";
import {
  countLowStockTasks,
  dispatchCollabTasksChanged,
  getReminderTasks,
  subscribeCollabTasks,
  subscribeScheduledTasks,
  syncLowStockTasksFromArticles,
} from "../../utils/scheduledTasksStore";
import {
  createCircuitStepCollabTask,
  fetchArticles,
  fetchRoleCircuitEntries,
  fetchStockCollabTasks,
  type StockArticle,
  type StockRoleCircuitEntry,
} from "../../../lib/stockApi";
import { getPageTexts } from "../../../hooks/usePageTexts";
import { hasStockPrivilege, hasStockScreenAccess } from "../../utils/stockPrivileges";
import {
  resolveStockSiderOpenKeys,
  resolveStockSiderSelectedKeys,
} from "../../utils/stockMenuNavigation";
import { StockAccessGuard } from "./StockAccessGuard";
import { StockDbSettingsModal } from "./StockDbSettingsModal";
import { StockScheduledTasksModal } from "./StockScheduledTasksModal";
import { useTheme } from "../../../context/ThemeContext";
import { themes } from "../../../constants";

const { Sider, Content } = Layout;

const STOCK_SIDER_WIDTH = 260;
const STOCK_HEADER_HEIGHT = 64;

/** Libellés des écrans (niveau racine du menu) — les sous-écrans restent en graisse normale. */
function menuScreenLabel(text: string) {
  return <span style={{ fontWeight: 700 }}>{text}</span>;
}

export default function StockLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { logout, session } = useSession();
  const M = usePageTexts("stockMenu");
  const Cnav = usePageTexts("stockCollaborateurNav");
  const CirNav = usePageTexts("stockCircuitsNav");
  const DocNav = usePageTexts("stockDocumentsNav");
  const Nav = usePageTexts("stockArticlesNav");
  const NavW = usePageTexts("stockWarehouseNav");
  const R = usePageTexts("stockScheduledTasks");
  const { themeNumber, setThemeNumber } = useTheme();
  const { token } = theme.useToken();
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [dbOpen, setDbOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskBadge, setTaskBadge] = useState(0);
  const [roleCircuitEntries, setRoleCircuitEntries] = useState<StockRoleCircuitEntry[]>([]);
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const h = window.location.hash;
    const keys: string[] = [];
    if (h.includes("articles")) keys.push("sub-articles");
    if (h.includes("warehouse")) keys.push("sub-warehouse");
    if (h.includes("user")) keys.push("sub-collab");
    if (h.includes("circuits")) keys.push("sub-circuits");
    if (h.includes("documents")) keys.push("sub-documents");
    return keys;
  });

  useScheduledTaskAlarms(session);

  useEffect(() => {
    const sync = async () => {
      const low = countLowStockTasks();
      const localRem = getReminderTasks().length;
      let server = 0;
      if (session?.id && (session.role === "stock_user" || session.role === "sadmin")) {
        try {
          const arr = await fetchStockCollabTasks({
            requesterUserId: session.id,
            requesterRole: session.role ?? "",
          });
          server = (arr ?? []).length;
        } catch {
          server = 0;
        }
      }
      setTaskBadge(low + localRem + server);
    };
    void sync();
    const u1 = subscribeScheduledTasks(() => void sync());
    const u2 = subscribeCollabTasks(() => void sync());
    const iv = window.setInterval(() => void sync(), 27000);
    return () => {
      u1();
      u2();
      window.clearInterval(iv);
    };
  }, [session]);

  useEffect(() => {
    if (!session?.id || !hasStockScreenAccess(session, "circuits")) {
      setRoleCircuitEntries([]);
      return;
    }
    fetchRoleCircuitEntries({
      requesterUserId: session.id,
      requesterRole: session.role ?? "",
    })
      .then(setRoleCircuitEntries)
      .catch(() => setRoleCircuitEntries([]));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (!hasStockScreenAccess(session, "articles")) return;
    let cancelled = false;
    const buildTitle = (a: StockArticle) => {
      const tpl =
        getPageTexts("stockScheduledTasks")[19] ?? "{name} ({sku}) — {qty} ≤ seuil min. {min} {unit}";
      return tpl
        .replace(/\{name\}/g, a.name)
        .replace(/\{sku\}/g, a.sku)
        .replace(/\{qty\}/g, String(a.qty))
        .replace(/\{min\}/g, String(a.minQty))
        .replace(/\{unit\}/g, (a.unit || "").trim());
    };
    const run = async () => {
      try {
        const articles = await fetchArticles();
        if (cancelled) return;
        syncLowStockTasksFromArticles(articles, buildTitle);
      } catch {
        /* accès API refusé ou hors ligne */
      }
    };
    run();
    const iv = window.setInterval(run, 60_000);
    const onFocus = () => {
      void run();
    };
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session]);

  useEffect(() => {
    setOpenKeys(resolveStockSiderOpenKeys(loc.pathname));
  }, [loc.pathname]);

  const selectedKeys = resolveStockSiderSelectedKeys(loc.pathname);

  const menuItems: MenuProps["items"] = [];

  if (hasStockScreenAccess(session, "dashboard")) {
    menuItems.push({
      key: "dash",
      icon: <DashboardOutlined />,
      label: menuScreenLabel(M[0]),
      onClick: () => navigate("/stock"),
    });
  }

  {
    const articleChildren: NonNullable<MenuProps["items"]> = [];
    if (hasStockScreenAccess(session, "articles")) {
      articleChildren.push({
        key: "articles-list",
        label: Nav[0],
        onClick: () => navigate("/stock/articles"),
      });
    }
    if (hasStockScreenAccess(session, "articles_units")) {
      articleChildren.push({
        key: "articles-units",
        label: Nav[1],
        onClick: () => navigate("/stock/articles/units"),
      });
    }
    if (hasStockScreenAccess(session, "articles_categories")) {
      articleChildren.push({
        key: "articles-categories",
        label: Nav[2],
        onClick: () => navigate("/stock/articles/categories"),
      });
    }
    if (hasStockScreenAccess(session, "articles_devises")) {
      articleChildren.push({
        key: "articles-devises",
        label: Nav[3],
        onClick: () => navigate("/stock/articles/devises"),
      });
    }
    if (articleChildren.length) {
      menuItems.push({
        key: "sub-articles",
        icon: <InboxOutlined />,
        label: menuScreenLabel(M[1]),
        children: articleChildren,
      });
    }
  }

  if (hasStockScreenAccess(session, "warehouse")) {
    menuItems.push({
      key: "sub-warehouse",
      icon: <ShopOutlined />,
      label: menuScreenLabel(M[2]),
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
      label: menuScreenLabel(M[3]),
      onClick: () => navigate("/stock/movements"),
    });
  }

  if (hasStockScreenAccess(session, "fournisseurs")) {
    menuItems.push({
      key: "fournisseurs",
      icon: <TruckOutlined />,
      label: menuScreenLabel(M[4]),
      onClick: () => navigate("/stock/fournisseurs"),
    });
  }

  if (hasStockScreenAccess(session, "clients")) {
    menuItems.push({
      key: "clients",
      icon: <TeamOutlined />,
      label: menuScreenLabel(M[5]),
      onClick: () => navigate("/stock/clients"),
    });
  }

  {
    const documentChildren: NonNullable<MenuProps["items"]> = [];
    if (hasStockScreenAccess(session, "documents")) {
      documentChildren.push({
        key: "documents-files",
        label: DocNav[0],
        onClick: () => navigate("/stock/documents"),
      });
    }
    if (hasStockScreenAccess(session, "documents_models")) {
      documentChildren.push({
        key: "documents-models",
        label: DocNav[1],
        onClick: () => navigate("/stock/documents/models"),
      });
    }
    if (documentChildren.length) {
      menuItems.push({
        key: "sub-documents",
        icon: <FileOutlined />,
        label: menuScreenLabel(M[6]),
        children: documentChildren,
      });
    }
  }

  const dynamicCircuitChildren = useMemo<NonNullable<MenuProps["items"]>>(() => {
    if (!hasStockScreenAccess(session, "circuits")) return [];
    return roleCircuitEntries.map((e) => ({
      key: `circuit-role-${e.circuitId}`,
      label: e.circuitName,
      onClick: async () => {
        if (!session?.id) return;
        if (session.role === "sadmin") {
          navigate(`/stock/circuits/${e.circuitId}/edit`);
          return;
        }
        if (e.canStart && e.active) {
          try {
            await createCircuitStepCollabTask({
              requesterUserId: session.id,
              circuitId: e.circuitId,
              stepIndex: 0,
              variant: "fill",
            });
            dispatchCollabTasksChanged();
          } catch {
            /* ignore: l’entrée sert aussi de raccourci vers les tâches */
          }
        }
        setTasksOpen(true);
      },
    }));
  }, [roleCircuitEntries, session, navigate]);

  {
    const canCircuitsList = hasStockScreenAccess(session, "circuits");
    const canCircuitsForms = hasStockScreenAccess(session, "circuits_forms");
    if (canCircuitsList || canCircuitsForms) {
      const children: NonNullable<MenuProps["items"]> = [];
      if (canCircuitsList) {
        children.push({
          key: "circuits-list",
          label: CirNav[0],
          onClick: () => navigate("/stock/circuits"),
        });
      }
      if (canCircuitsList && hasStockPrivilege(session, "circuits_manage")) {
        children.push({
          key: "circuits-form",
          label: CirNav[1],
          onClick: () => navigate("/stock/circuits/new"),
        });
      }
      if (canCircuitsForms) {
        children.push({
          key: "circuits-forms",
          label: CirNav[2],
          onClick: () => navigate("/stock/circuits/forms"),
        });
      }
      if (canCircuitsList && dynamicCircuitChildren.length) {
        children.push(...dynamicCircuitChildren);
      }
      menuItems.push({
        key: "sub-circuits",
        icon: <BranchesOutlined />,
        label: menuScreenLabel(M[7]),
        children,
      });
    }
  }

  const collabChildren: NonNullable<MenuProps["items"]> = [];
  if (hasStockScreenAccess(session, "user")) {
    collabChildren.push({
      key: "user-profil",
      label: Cnav[0],
      onClick: () => navigate("/stock/user"),
    });
  }
  if (hasStockScreenAccess(session, "roles")) {
    collabChildren.push({
      key: "user-roles",
      label: Cnav[1],
      onClick: () => navigate("/stock/user/roles"),
    });
  }
  if (collabChildren.length) {
    menuItems.push({
      key: "sub-collab",
      icon: <UserOutlined />,
      label: menuScreenLabel(M[8]),
      children: collabChildren,
    });
  }

  if (hasStockScreenAccess(session, "settings")) {
    menuItems.push({
      key: "settings",
      icon: <DatabaseOutlined />,
      label: menuScreenLabel(M[9]),
      onClick: () => setDbOpen(true),
    });
  }

  const mainOffset = siderCollapsed ? 0 : STOCK_SIDER_WIDTH;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        width={STOCK_SIDER_WIDTH}
        theme="dark"
        collapsed={siderCollapsed}
        onCollapse={(c) => setSiderCollapsed(c)}
        onBreakpoint={(broken) => setSiderCollapsed(broken)}
        style={{
          background: token.colorPrimary,
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          height: "100vh",
          overflow: "auto",
          zIndex: 200,
        }}
      >
        <div
          style={{
            height: STOCK_HEADER_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {M[10] ?? "Stock"}
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
      <Layout
        style={{
          marginLeft: mainOffset,
          minHeight: "100vh",
          transition: "margin-left 0.2s ease",
        }}
      >
        <NavBar
          style={{
            background: token.colorBgContainer,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            position: "fixed",
            top: 0,
            left: mainOffset,
            right: 0,
            height: STOCK_HEADER_HEIGHT,
            zIndex: 150,
            transition: "left 0.2s ease",
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
                        {(M[12] ?? "Thème") + ` ${i + 1}`}
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
                aria-label={M[12] ?? "Thème"}
                title={M[13] ?? M[12] ?? "Thème"}
              />
            </Dropdown>
          </div>
          <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate("/connection"); }}>
            {M[11]}
          </Button>
        </NavBar>
        <Content
          style={{
            padding: 24,
            paddingTop: STOCK_HEADER_HEIGHT + 24,
            minHeight: 280,
          }}
        >
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
