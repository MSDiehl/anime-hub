import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  AnimeHubIcon,
  CalendarIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  MoonIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
  XIcon,
} from "./Icons";
import { useTheme } from "./Theme";

type NavKey = "dashboard" | "search" | "discover" | "forums" | "schedule";

type Props = {
  active?: NavKey;
  onLogout: () => void | Promise<void>;
};

const navItems: Array<{
  key: NavKey;
  label: string;
  to: string;
  Icon: ComponentType<{ size?: number }>;
}> = [
  { key: "dashboard", label: "Dashboard", to: "/dashboard", Icon: LayoutDashboardIcon },
  { key: "search", label: "Search", to: "/search", Icon: SearchIcon },
  { key: "discover", label: "Discover", to: "/discover", Icon: StarIcon },
  { key: "forums", label: "Forums", to: "/forums", Icon: MessageSquareIcon },
  { key: "schedule", label: "Schedule", to: "/schedule", Icon: CalendarIcon },
];

export default function AppNav({ active, onLogout }: Props) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("navDrawerOpen", open);
    return () => document.body.classList.remove("navDrawerOpen");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  const navLinks = (
    <>
      {navItems.map(({ Icon, ...item }) => (
        <button
          aria-current={active === item.key ? "page" : undefined}
          className={`appNavLink ${active === item.key ? "isActive" : ""}`}
          key={item.key}
          onClick={() => go(item.to)}
          type="button"
        >
          <Icon />
          <span>{item.label}</span>
        </button>
      ))}
    </>
  );

  return (
    <header className="appNav">
      <button className="appNavBrand" onClick={() => go("/dashboard")} type="button">
        <AnimeHubIcon size={22} />
        <span>AnimeHub</span>
      </button>

      <nav aria-label="Primary" className="appNavLinks">
        {navLinks}
      </nav>

      <div className="appNavActions">
        <button
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="appIconBtn"
          onClick={toggleTheme}
          type="button"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button className="appNavLogout" onClick={onLogout} type="button">
          <LogOutIcon />
          <span>Logout</span>
        </button>
        <button
          aria-expanded={open}
          aria-label="Open navigation menu"
          className="appNavMenuBtn"
          onClick={() => setOpen(true)}
          type="button"
        >
          <MenuIcon />
        </button>
      </div>

      {open && (
        <div className="appNavDrawerShell">
          <button
            aria-label="Close navigation menu"
            className="appNavBackdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <aside aria-label="Mobile navigation" className="appNavDrawer">
            <div className="appNavDrawerHead">
              <span>Menu</span>
              <button
                aria-label="Close navigation menu"
                className="appIconBtn"
                onClick={() => setOpen(false)}
                type="button"
              >
                <XIcon />
              </button>
            </div>
            <nav className="appNavDrawerLinks">{navLinks}</nav>
            <button className="appNavLogout appNavDrawerLogout" onClick={onLogout} type="button">
              <LogOutIcon />
              <span>Logout</span>
            </button>
          </aside>
        </div>
      )}
    </header>
  );
}
