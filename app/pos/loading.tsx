import RouteSpinner from "@/components/layout/RouteSpinner";

export default function LoadingPos() {
  return (
    <main className="pos-loading" aria-busy="true">
      <RouteSpinner />
    </main>
  );
}
