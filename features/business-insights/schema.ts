import { z } from "zod";

export const businessInsightIds = [
  "sales",
  "expenses",
  "receivables",
  "stock",
] as const;

export const businessInsightFactSchema = z.object({
  id: z.enum(businessInsightIds),
  title: z.string(),
  evidence: z.string(),
});

export const businessInsightRecommendationSchema = z.object({
  factId: z.enum(businessInsightIds),
  recommendation: z.string().trim().min(1).max(240),
});

export const businessInsightModelOutputSchema = z.object({
  recommendations: z.array(businessInsightRecommendationSchema).max(4),
});

export const businessInsightsResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  facts: z.array(businessInsightFactSchema),
  recommendations: z.array(businessInsightRecommendationSchema).max(4),
});

export type BusinessInsightFact = z.infer<typeof businessInsightFactSchema>;
export type BusinessInsightRecommendation = z.infer<
  typeof businessInsightRecommendationSchema
>;
export type BusinessInsightsResponse = z.infer<
  typeof businessInsightsResponseSchema
>;
