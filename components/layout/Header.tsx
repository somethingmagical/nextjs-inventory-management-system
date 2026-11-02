import { Icon } from "./Sidebar";

export default function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="gg-topbar">
      <button className="gg-icon-btn" type="button" onClick={onToggleSidebar} aria-label="Toggle sidebar"><Icon name="menu" /></button>
      <div className="gg-topbar-title">
        <span className="gg-page-chip"><Icon name="plus" /></span>
        <span className="gg-breadcrumb">Dashboard</span>
      </div>
      <div className="gg-topbar-spacer" />
      <button className="gg-pos-btn" type="button"><Icon name="monitor" size={16} />POS</button>
      <button className="gg-icon-btn gg-apps-btn" type="button" aria-label="Apps"><Icon name="grid" /></button>
      <button className="gg-user" type="button" aria-label="Account menu for admin">
        <span className="gg-avatar">A</span>
        <span className="gg-user-name">admin</span>
        <Icon name="chevronDown" className="gg-user-chevron" size={16} />
      </button>
    </header>
  );
}
