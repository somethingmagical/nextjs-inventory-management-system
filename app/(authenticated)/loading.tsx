import RouteSpinner from "@/components/layout/RouteSpinner";

export default function Loading() {
  return (
    <main className="gg-content gg-route-loading" aria-busy="true">
      <RouteSpinner />
    </main>
  );
}
