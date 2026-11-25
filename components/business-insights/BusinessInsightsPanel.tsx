"use client";

import { useState } from "react";
import { z } from "zod";
import DashboardCard from "@/components/dashboard/DashboardCard";
import {
  businessInsightsResponseSchema,
  type BusinessInsightsResponse,
} from "@/features/business-insights/schema";

const apiErrorSchema = z.object({ error: z.string() });

export default function BusinessInsightsPanel() {
  const [result, setResult] = useState<BusinessInsightsResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateInsights() {
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/business-insights", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsedError = apiErrorSchema.safeParse(body);
        setError(
          parsedError.success
            ? parsedError.data.error
            : "Business insights could not be generated. Please try again.",
        );
        return;
      }

      const parsed = businessInsightsResponseSchema.safeParse(body);
      if (!parsed.success) {
        setError("The business insights response could not be displayed. Please try again.");
        return;
      }
      setResult(parsed.data);
    } catch {
      setError("Business insights could not be reached. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const recommendationsByFactId = new Map(
    result?.recommendations.map((recommendation) => [
      recommendation.factId,
      recommendation.recommendation,
    ]) ?? [],
  );
  const selectedFacts = result?.facts.filter((fact) =>
    recommendationsByFactId.has(fact.id),
  ) ?? [];

  return (
    <DashboardCard
      title="AI Business Insights"
      action={
        <button
          className="gg-btn gg-btn--ghost gg-btn--sm"
          disabled={isLoading}
          onClick={generateInsights}
          type="button"
        >
          {isLoading ? "Generating..." : "Generate insights"}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="gg-muted">
          Get suggestions based on aggregate sales, returns, expenses, receivables, and stock-alert data.
          Review AI suggestions before acting.
        </p>

        {isLoading && (
          <p aria-live="polite" className="gg-muted">Analyzing recent business activity...</p>
        )}

        {error && (
          <p aria-live="polite" className="text-sm text-red-700">{error}</p>
        )}

        {result && selectedFacts.length > 0 && (
          <div className="space-y-3">
            {selectedFacts.map((fact) => (
              <article className="rounded-lg border border-gray-200 p-4" key={fact.id}>
                <h3 className="font-semibold">{fact.title}</h3>
                <p className="gg-muted mt-1 text-sm">{fact.evidence}</p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Suggested next step:</span>{" "}
                  {recommendationsByFactId.get(fact.id)}
                </p>
              </article>
            ))}
            <p className="gg-muted text-xs">
              Generated {new Date(result.generatedAt).toLocaleString()}.
            </p>
          </div>
        )}

        {result && result.facts.length > 0 && selectedFacts.length === 0 && (
          <p className="gg-muted">No priority recommendations were identified from the available facts.</p>
        )}

        {result && result.facts.length === 0 && (
          <p className="gg-muted">There is not enough recent activity to generate useful insights.</p>
        )}
      </div>
    </DashboardCard>
  );
}
