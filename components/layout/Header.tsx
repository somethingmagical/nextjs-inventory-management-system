import { Icon } from "./Sidebar";
import UserMenu from "./UserMenu";

export default function Header({
  onToggleSidebar,
  user,
}: {
  onToggleSidebar: () => void;
  user: { name: string; image: string | null };
}) {
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
      <UserMenu name={user.name} image={user.image} />
    </header>
  );
}
