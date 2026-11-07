const appName = process.env.NEXT_PUBLIC_APP_NAME || "Inventory";

export default function Footer() {
  return <footer className="dash-foot">All Rights Reserved &copy; 2026 <a href="/dashboard">{appName}</a></footer>;
}
